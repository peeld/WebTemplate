import json
import logging
import os
from datetime import datetime, timezone as dt_utc, timedelta

import stripe
from django.conf import settings
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product, ProductImage, ProductPrice, StripeCustomer, Subscription, SubscriptionItem
from .serializers import ProductSerializer, SubscriptionSerializer, AdminProductSerializer, AdminProductPriceSerializer, AdminSubscriptionSerializer, ProductImageSerializer
from .signals import checkout_completed, subscription_activated, subscription_cancelled, payment_completed
from core_app.signals import license_grant_requested

ACTIVE_STATUSES = {'active', 'trialing'}

logger = logging.getLogger(__name__)


def _stripe_client():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _resolve_period_end(sub_dict):
    """
    Return the subscription period-end as a timezone-aware datetime.

    Newer Stripe API versions (with billing_mode) omit current_period_end.
    Fallback order: current_period_end → trial_end (if trialing) →
    next billing date computed from billing_cycle_anchor + price interval.
    """
    ts = sub_dict.get('current_period_end')
    if ts:
        return datetime.fromtimestamp(ts, tz=dt_utc.utc)

    if sub_dict.get('status') == 'trialing':
        ts = sub_dict.get('trial_end')
        if ts:
            return datetime.fromtimestamp(ts, tz=dt_utc.utc)

    anchor_ts = sub_dict.get('billing_cycle_anchor')
    if not anchor_ts:
        raise ValueError(
            f'Cannot determine period end (no current_period_end, trial_end, or billing_cycle_anchor). '
            f'Fields present: {list(sub_dict.keys())}'
        )

    # Determine billing interval from items → plan (deprecated but reliable) or price.recurring
    interval       = 'month'
    interval_count = 1
    items_data = sub_dict.get('items', {}).get('data', [])
    if items_data:
        plan = items_data[0].get('plan') or {}
        if plan.get('interval'):
            interval       = plan['interval']
            interval_count = int(plan.get('interval_count', 1))
        else:
            recurring = (items_data[0].get('price') or {}).get('recurring') or {}
            if recurring.get('interval'):
                interval       = recurring['interval']
                interval_count = int(recurring.get('interval_count', 1))

    # Advance billing_cycle_anchor by one interval at a time until it's in the future.
    APPROX_DAYS = {'day': 1, 'week': 7, 'month': 31, 'year': 366}
    delta  = timedelta(days=APPROX_DAYS.get(interval, 31) * interval_count)
    anchor = datetime.fromtimestamp(anchor_ts, tz=dt_utc.utc)
    now    = timezone.now()
    while anchor <= now:
        anchor += delta
    return anchor


def _upsert_subscription_from_raw(sc, raw):
    """Write or update a local Subscription and its SubscriptionItems from a raw Stripe dict."""
    items_data = raw.get('items', {}).get('data', [])
    if not items_data:
        raise ValueError(f'No items in subscription {raw.get("id")}')

    period_end = _resolve_period_end(raw)

    sub, _ = Subscription.objects.update_or_create(
        stripe_subscription_id=raw['id'],
        defaults={
            'customer':            sc,
            'status':              raw['status'],
            'current_period_end':  period_end,
            'cancel_at_period_end': raw.get('cancel_at_period_end', False),
        },
    )

    seen_price_ids = set()
    for item_data in items_data:
        price_raw  = item_data.get('price', {})
        price_id   = price_raw.get('id')
        product_id = price_raw.get('product')
        if isinstance(product_id, dict):
            product_id = product_id.get('id')
        if price_id:
            SubscriptionItem.objects.update_or_create(
                subscription=sub,
                stripe_price_id=price_id,
                defaults={
                    'stripe_product_id': product_id or '',
                    'quantity':          item_data.get('quantity', 1),
                },
            )
            seen_price_ids.add(price_id)

    sub.items.exclude(stripe_price_id__in=seen_price_ids).delete()
    return sub


def _upsert_subscription_from_stripe(sc, stripe_sub):
    """Write or update a local Subscription and its items from a Stripe SDK object."""
    return _upsert_subscription_from_raw(sc, stripe_sub.to_dict())


def _get_or_create_stripe_customer(user, client):
    """Return (StripeCustomer, customer_id). Creates Stripe Customer if needed. Raises stripe.StripeError."""
    try:
        sc = user.stripe_customer
        return sc, sc.stripe_customer_id
    except StripeCustomer.DoesNotExist:
        pass

    customer = client.Customer.create(
        email=user.email,
        metadata={'user_id': str(user.pk)},
    )
    try:
        sc = StripeCustomer.objects.create(
            user=user,
            stripe_customer_id=customer.id,
        )
        logger.info('Created Stripe customer %s for user %s', customer.id, user.pk)
    except IntegrityError:
        # Concurrent request won the race; use the record it created.
        sc = StripeCustomer.objects.get(user=user)
        logger.info('StripeCustomer race resolved for user %s; using existing %s', user.pk, sc.stripe_customer_id)
    return sc, sc.stripe_customer_id


class ProductsView(APIView):
    """Return all active products from the local catalog."""
    permission_classes = [AllowAny]

    def get(self, request):
        products = Product.objects.filter(is_active=True)
        return Response(ProductSerializer(products, many=True).data)


class PricesView(APIView):
    """Return all active prices with their product names."""
    permission_classes = [AllowAny]

    def get(self, request):
        client = _stripe_client()
        try:
            prices = client.Price.list(active=True, expand=['data.product'], limit=100)
        except stripe.StripeError as e:
            logger.error('Stripe error fetching prices: %s', e, exc_info=True)
            return Response({'error': 'Unable to fetch prices.'}, status=502)

        data = []
        for price in prices.data:
            product = price.product
            if isinstance(product, str) or not product.active:
                continue
            data.append({
                'price_id':  price.id,
                'amount':    price.unit_amount,
                'currency':  price.currency,
                'interval':  price.recurring.interval if price.recurring else None,
                'name':      product.name,
                'description': product.description or '',
            })

        return Response(data)


class CheckoutView(APIView):
    """Create a Stripe Checkout session and return the redirect URL."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        price_id = request.data.get('price_id')
        mode     = request.data.get('mode', 'subscription')

        if not price_id:
            return Response({'error': 'price_id is required.'}, status=400)
        if mode not in ('subscription', 'payment'):
            return Response({'error': 'mode must be subscription or payment.'}, status=400)

        client = _stripe_client()

        # Get or create the Stripe customer for this user.
        try:
            sc = request.user.stripe_customer
            customer_id = sc.stripe_customer_id
        except StripeCustomer.DoesNotExist:
            try:
                customer = client.Customer.create(
                    email=request.user.email,
                    metadata={'user_id': str(request.user.pk)},
                )
                sc = StripeCustomer.objects.create(
                    user=request.user,
                    stripe_customer_id=customer.id,
                )
                customer_id = customer.id
                logger.info('Created Stripe customer %s for user %s', customer_id, request.user.pk)
            except stripe.StripeError as e:
                logger.error('Failed to create Stripe customer for user %s: %s', request.user.pk, e, exc_info=True)
                return Response({'error': 'Unable to create billing account.'}, status=502)

        try:
            session = client.checkout.Session.create(
                customer=customer_id,
                mode=mode,
                line_items=[{'price': price_id, 'quantity': 1}],
                success_url=settings.STRIPE_SUCCESS_URL,
                cancel_url=settings.STRIPE_CANCEL_URL,
            )
        except stripe.StripeError as e:
            logger.error('Failed to create checkout session for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to create checkout session.'}, status=502)

        logger.info('Checkout session %s created for user %s', session.id, request.user.pk)
        return Response({'url': session.url})


class SubscriptionView(APIView):
    """Return all active subscriptions for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            sc = request.user.stripe_customer
        except StripeCustomer.DoesNotExist:
            return Response([])
        subs = (
            sc.subscriptions
            .prefetch_related('items')
            .exclude(status__in=('canceled', 'incomplete_expired'))
            .order_by('-updated_at')
        )
        return Response(SubscriptionSerializer(subs, many=True).data)


class PortalView(APIView):
    """Create a Stripe Billing Portal session and return the redirect URL."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            customer_id = request.user.stripe_customer.stripe_customer_id
        except StripeCustomer.DoesNotExist:
            return Response({'error': 'No billing account found.'}, status=404)

        client = _stripe_client()
        try:
            session = client.billing_portal.Session.create(
                customer=customer_id,
                return_url=settings.STRIPE_CANCEL_URL,
            )
        except stripe.StripeError as e:
            logger.error('Failed to create portal session for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to open billing portal.'}, status=502)

        return Response({'url': session.url})


class CancelSubscriptionView(APIView):
    """Cancel a subscription at period end. Requires subscription_id in the request body."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        subscription_id = request.data.get('subscription_id')
        if not subscription_id:
            return Response({'error': 'subscription_id is required.'}, status=400)

        try:
            subscription = Subscription.objects.get(
                customer__user=request.user,
                stripe_subscription_id=subscription_id,
            )
        except Subscription.DoesNotExist:
            return Response({'error': 'Subscription not found.'}, status=404)

        if subscription.cancel_at_period_end:
            return Response({'error': 'Subscription is already set to cancel.'}, status=400)

        client = _stripe_client()
        try:
            client.Subscription.modify(subscription_id, cancel_at_period_end=True)
        except stripe.StripeError as e:
            logger.error('Failed to cancel subscription for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to cancel subscription.'}, status=502)

        subscription.cancel_at_period_end = True
        subscription.save(update_fields=['cancel_at_period_end', 'updated_at'])
        logger.info('Subscription %s set to cancel at period end for user %s', subscription_id, request.user.pk)
        return Response(SubscriptionSerializer(subscription).data)


class ResumeSubscriptionView(APIView):
    """Undo a pending cancellation. Requires subscription_id in the request body."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        subscription_id = request.data.get('subscription_id')
        if not subscription_id:
            return Response({'error': 'subscription_id is required.'}, status=400)

        try:
            subscription = Subscription.objects.get(
                customer__user=request.user,
                stripe_subscription_id=subscription_id,
            )
        except Subscription.DoesNotExist:
            return Response({'error': 'Subscription not found.'}, status=404)

        if not subscription.cancel_at_period_end:
            return Response({'error': 'Subscription is not scheduled to cancel.'}, status=400)

        client = _stripe_client()
        try:
            client.Subscription.modify(subscription_id, cancel_at_period_end=False)
        except stripe.StripeError as e:
            logger.error('Failed to resume subscription for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to resume subscription.'}, status=502)

        subscription.cancel_at_period_end = False
        subscription.save(update_fields=['cancel_at_period_end', 'updated_at'])
        logger.info('Subscription %s resumption confirmed for user %s', subscription_id, request.user.pk)
        return Response(SubscriptionSerializer(subscription).data)


class ChangeSubscriptionView(APIView):
    """Swap a subscription to a different price (plan change with proration)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        subscription_id = request.data.get('subscription_id')
        price_id        = request.data.get('price_id')

        if not subscription_id or not price_id:
            return Response({'error': 'subscription_id and price_id are required.'}, status=400)

        try:
            subscription = Subscription.objects.get(
                customer__user=request.user,
                stripe_subscription_id=subscription_id,
            )
        except Subscription.DoesNotExist:
            return Response({'error': 'Subscription not found.'}, status=404)

        if not ProductPrice.objects.filter(stripe_price_id=price_id, price_type='recurring', is_active=True).exists():
            return Response({'error': 'Invalid plan.'}, status=400)

        client = _stripe_client()
        try:
            stripe_sub = client.Subscription.retrieve(subscription_id)
            existing_items = stripe_sub['items']['data']
            new_items = [{'id': item['id'], 'deleted': True} for item in existing_items]
            new_items.append({'price': price_id})
            client.Subscription.modify(
                subscription_id,
                items=new_items,
                proration_behavior='create_prorations',
            )
            full = client.Subscription.retrieve(subscription_id, expand=['items.data.price'])
            _upsert_subscription_from_stripe(subscription.customer, full)
        except stripe.StripeError as e:
            logger.error('Failed to change subscription for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to change plan.'}, status=502)

        subscription.refresh_from_db()
        logger.info('Subscription %s changed to price %s for user %s', subscription_id, price_id, request.user.pk)
        return Response(SubscriptionSerializer(subscription).data)


class CartSetupIntentView(APIView):
    """Create a Stripe SetupIntent so the frontend can collect and save a payment method."""
    permission_classes = [AllowAny]

    def post(self, request):
        client = _stripe_client()

        if request.user.is_authenticated:
            try:
                _sc, customer_id = _get_or_create_stripe_customer(request.user, client)
            except stripe.StripeError as e:
                logger.error('CartSetupIntent: customer create failed for user %s: %s', request.user.pk, e, exc_info=True)
                return Response({'error': 'Unable to create billing account.'}, status=502)

            try:
                setup_intent = client.SetupIntent.create(customer=customer_id, usage='off_session')
            except stripe.StripeError as e:
                logger.error('CartSetupIntent: SetupIntent create failed for user %s: %s', request.user.pk, e, exc_info=True)
                return Response({'error': 'Unable to initialize checkout.'}, status=502)

            logger.info('SetupIntent %s created for user %s', setup_intent.id, request.user.pk)
            return Response({'client_secret': setup_intent.client_secret, 'customer_id': customer_id})

        # Guest flow — one-time items only; no DB record created
        email = (request.data.get('email') or '').strip()
        if not email:
            return Response({'error': 'Email is required for guest checkout.'}, status=400)

        try:
            customer = client.Customer.create(email=email, metadata={'guest': 'true'})
            setup_intent = client.SetupIntent.create(customer=customer.id, usage='off_session')
        except stripe.StripeError as e:
            logger.error('CartSetupIntent: guest setup failed for %s: %s', email, e, exc_info=True)
            return Response({'error': 'Unable to initialize checkout.'}, status=502)

        logger.info('Guest SetupIntent %s created for email %s', setup_intent.id, email)
        return Response({'client_secret': setup_intent.client_secret, 'setup_intent_id': setup_intent.id})


class CartExecuteView(APIView):
    """Execute a cart by creating PaymentIntent(s) and Subscription(s) from a saved payment method."""
    permission_classes = [AllowAny]

    def post(self, request):
        payment_method  = request.data.get('payment_method')
        items_data      = request.data.get('items', [])
        setup_intent_id = request.data.get('setup_intent_id')  # guests only

        if not payment_method:
            return Response({'error': 'payment_method is required.'}, status=400)
        if not items_data:
            return Response({'error': 'items must not be empty.'}, status=400)

        price_ids = []
        for item in items_data:
            if 'price_id' not in item:
                return Response({'error': 'Each item must have a price_id.'}, status=400)
            price_ids.append(item['price_id'])

        prices_qs = ProductPrice.objects.filter(stripe_price_id__in=price_ids, is_active=True)
        prices    = {p.stripe_price_id: p for p in prices_qs}
        missing   = [pid for pid in price_ids if pid not in prices]
        if missing:
            return Response({'error': f'Invalid or inactive price IDs: {missing}'}, status=400)

        client = _stripe_client()

        sc = None
        if request.user.is_authenticated:
            try:
                sc          = request.user.stripe_customer
                customer_id = sc.stripe_customer_id
            except StripeCustomer.DoesNotExist:
                return Response({'error': 'No billing account found. Please restart checkout.'}, status=400)
        else:
            # Guest: subscriptions are not supported
            has_recurring = any(
                prices[item['price_id']].price_type == 'recurring'
                for item in items_data
                if item['price_id'] in prices
            )
            if has_recurring:
                return Response(
                    {'error': 'Subscriptions require an account. Please log in or sign up.'},
                    status=403,
                )
            if not setup_intent_id:
                return Response({'error': 'setup_intent_id is required for guest checkout.'}, status=400)
            try:
                setup_intent = client.SetupIntent.retrieve(setup_intent_id)
                customer_id  = setup_intent.customer
                if not customer_id:
                    return Response({'error': 'Invalid checkout session. Please restart.'}, status=400)
                customer = client.Customer.retrieve(customer_id)
                if customer.get('metadata', {}).get('guest') != 'true':
                    return Response({'error': 'Invalid checkout session. Please restart.'}, status=400)
            except stripe.StripeError as e:
                logger.error('CartExecute: guest SetupIntent retrieval failed: %s', e, exc_info=True)
                return Response({'error': 'Invalid checkout session. Please restart.'}, status=400)

        try:
            client.Customer.modify(
                customer_id,
                invoice_settings={'default_payment_method': payment_method},
            )
        except stripe.StripeError as e:
            logger.error('CartExecute: set default PM failed for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to save payment method.'}, status=502)

        one_time_items        = []
        recurring_by_interval = {}

        for item in items_data:
            price    = prices[item['price_id']]
            quantity = max(1, int(item.get('quantity', 1)))
            if price.price_type == 'one_time':
                one_time_items.append((price, quantity))
            else:
                recurring_by_interval.setdefault(price.interval, []).append(
                    (price.stripe_price_id, quantity)
                )

        errors            = []
        transaction_count = 0

        if one_time_items:
            total    = sum(p.amount * qty for p, qty in one_time_items)
            currency = one_time_items[0][0].currency
            grants   = [
                {'slug': p.product.slug, 'days': p.days_granted}
                for p, _qty in one_time_items
                if p.days_granted
            ]
            pi_params = {
                'amount':         total,
                'currency':       currency,
                'customer':       customer_id,
                'payment_method': payment_method,
                'confirm':        True,
                'off_session':    True,
            }
            if grants:
                pi_params['metadata'] = {'grants': json.dumps(grants)}
            try:
                pi = client.PaymentIntent.create(**pi_params)
                transaction_count += 1
                logger.info('PaymentIntent %s created for user %s (amount=%d)', pi.id, request.user.pk, total)
            except stripe.CardError as e:
                err_code = e.error.code if e.error else 'unknown'
                if err_code == 'authentication_required':
                    errors.append({'type': 'one_time', 'error': 'Card authentication required. Please retry with 3D Secure.'})
                else:
                    errors.append({'type': 'one_time', 'error': str(e.user_message or e)})
                logger.error('CartExecute: PaymentIntent failed for user %s: %s', request.user.pk, e)
            except stripe.StripeError as e:
                errors.append({'type': 'one_time', 'error': 'Payment processing failed.'})
                logger.error('CartExecute: PaymentIntent Stripe error for user %s: %s', request.user.pk, e, exc_info=True)

        for interval, interval_items in recurring_by_interval.items():
            sub_items = [{'price': pid, 'quantity': qty} for pid, qty in interval_items]
            try:
                sub = client.Subscription.create(
                    customer=customer_id,
                    items=sub_items,
                    default_payment_method=payment_method,
                )
                transaction_count += 1
                logger.info('Subscription %s created for user %s (interval=%s)', sub.id, request.user.pk, interval)
                if sc is not None:
                    try:
                        full = client.Subscription.retrieve(sub.id, expand=['items.data.price'])
                        local_sub = _upsert_subscription_from_stripe(sc, full)
                        logger.info('Subscription %s mirrored to local DB for user %s', sub.id, request.user.pk)
                        if local_sub.status in ACTIVE_STATUSES:
                            subscription_activated.send(sender=self.__class__, user=sc.user, subscription=local_sub)
                    except Exception as e:
                        logger.error('CartExecute: failed to mirror subscription %s to local DB: %s', sub.id, e, exc_info=True)
            except stripe.StripeError as e:
                errors.append({'type': 'subscription', 'interval': interval, 'error': str(e)})
                logger.error('CartExecute: Subscription create failed for user %s interval=%s: %s', request.user.pk, interval, e, exc_info=True)

        if errors and transaction_count == 0:
            return Response({'status': 'failed', 'errors': errors}, status=402)

        response = {'status': 'processing', 'transaction_count': transaction_count}
        if errors:
            response['partial_errors'] = errors
        return Response(response)


@method_decorator(csrf_exempt, name='dispatch')
class WebhookView(APIView):
    """Receive and process Stripe webhook events."""
    permission_classes = [AllowAny]

    def post(self, request):
        payload   = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
        client = _stripe_client()

        try:
            event = client.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.errors.SignatureVerificationError:
            logger.warning('Stripe webhook signature verification failed')
            return Response({'error': 'Invalid signature.'}, status=400)
        except Exception as e:
            logger.error('Webhook parsing error: %s', e, exc_info=True)
            return Response({'error': 'Invalid payload.'}, status=400)

        event_type = event['type']
        data       = event['data']['object']

        logger.info('Stripe webhook received: %s', event_type)

        event_id = event['id']

        if event_type == 'checkout.session.completed':
            try:
                self._handle_checkout_completed(data)
            except Exception as e:
                logger.error('Error in _handle_checkout_completed for event %s: %s', event_id, e, exc_info=True)
        elif event_type in ('customer.subscription.created', 'customer.subscription.updated'):
            try:
                self._handle_subscription_upsert(data)
            except Exception as e:
                logger.error('Error in _handle_subscription_upsert for event %s: %s', event_id, e, exc_info=True)
        elif event_type == 'customer.subscription.deleted':
            try:
                self._handle_subscription_deleted(data)
            except Exception as e:
                logger.error('Error in _handle_subscription_deleted for event %s: %s', event_id, e, exc_info=True)
        elif event_type == 'payment_intent.succeeded':
            try:
                self._handle_payment_intent_succeeded(data)
            except Exception as e:
                logger.error('Error in _handle_payment_intent_succeeded for event %s: %s', event_id, e, exc_info=True)
        elif event_type == 'payment_intent.payment_failed':
            logger.warning('payment_intent.payment_failed: pi=%s customer=%s', data.get('id'), data.get('customer'))
        elif event_type == 'invoice.payment_action_required':
            try:
                self._handle_invoice_payment_action_required(data)
            except Exception as e:
                logger.error('Error in _handle_invoice_payment_action_required for event %s: %s', event_id, e, exc_info=True)
        else:
            logger.debug('Stripe webhook event not handled: %s (event_id=%s)', event_type, event_id)

        return Response({'status': 'ok'})

    def _handle_checkout_completed(self, session):
        try:
            sc = StripeCustomer.objects.get(stripe_customer_id=session['customer'])
        except StripeCustomer.DoesNotExist:
            logger.warning('checkout.session.completed: no StripeCustomer for %s', session.get('customer'))
            return

        checkout_completed.send(sender=self.__class__, user=sc.user, session=session)
        logger.info('checkout_completed signal fired for user %s', sc.user.pk)

    def _handle_subscription_upsert(self, sub):
        try:
            sc = StripeCustomer.objects.get(stripe_customer_id=sub['customer'])
        except StripeCustomer.DoesNotExist:
            logger.warning('subscription upsert: no StripeCustomer for %s', sub.get('customer'))
            return

        try:
            subscription = _upsert_subscription_from_raw(sc, sub)
        except ValueError as e:
            logger.error('subscription upsert: %s for subscription %s', e, sub.get('id'))
            return
        except Exception as e:
            logger.error('subscription upsert: DB error for subscription %s: %s', sub.get('id'), e, exc_info=True)
            return

        if subscription.status in ACTIVE_STATUSES:
            subscription_activated.send(sender=self.__class__, user=sc.user, subscription=subscription)
        elif subscription.status in ('canceled', 'unpaid', 'paused'):
            subscription_cancelled.send(sender=self.__class__, user=sc.user, subscription=subscription)
        logger.info('Subscription %s upserted for user %s (status=%s)', sub['id'], sc.user.pk, sub['status'])

    def _handle_subscription_deleted(self, sub):
        try:
            subscription = Subscription.objects.get(stripe_subscription_id=sub['id'])
        except Subscription.DoesNotExist:
            logger.warning('subscription.deleted: no local record for %s', sub['id'])
            return

        subscription.status = 'canceled'
        subscription.save(update_fields=['status', 'updated_at'])

        subscription_cancelled.send(
            sender=self.__class__,
            user=subscription.customer.user,
            subscription=subscription,
        )
        logger.info('Subscription %s marked canceled for user %s', sub['id'], subscription.customer.user.pk)

    def _handle_payment_intent_succeeded(self, payment_intent):
        customer_id = payment_intent.get('customer')
        if not customer_id:
            logger.warning('payment_intent.succeeded: no customer on pi %s', payment_intent.get('id'))
            return
        try:
            sc = StripeCustomer.objects.get(stripe_customer_id=customer_id)
        except StripeCustomer.DoesNotExist:
            logger.warning('payment_intent.succeeded: no StripeCustomer for %s', customer_id)
            return

        payment_completed.send(sender=self.__class__, user=sc.user, payment_intent=payment_intent)
        logger.info('payment_completed signal fired for user %s (pi=%s)', sc.user.pk, payment_intent.get('id'))

        grants_json = (payment_intent.get('metadata') or {}).get('grants')
        if grants_json:
            try:
                grants = json.loads(grants_json)
            except (json.JSONDecodeError, TypeError):
                logger.error('payment_intent.succeeded: malformed grants metadata in pi %s', payment_intent.get('id'))
                grants = []
            for grant in grants:
                slug = grant.get('slug')
                if not slug:
                    continue
                try:
                    product = Product.objects.get(slug=slug)
                except Product.DoesNotExist:
                    logger.warning('payment_intent.succeeded: product slug %r not found (pi=%s)', slug, payment_intent.get('id'))
                    continue
                license_grant_requested.send(
                    sender=self.__class__,
                    user=sc.user,
                    product_id=product.pk,
                    stripe_payment_intent_id=payment_intent.get('id'),
                )
                logger.info('license_grant_requested sent for user %s product %s (pi=%s)', sc.user.pk, product.pk, payment_intent.get('id'))

    def _handle_invoice_payment_action_required(self, invoice):
        customer_id        = invoice.get('customer')
        hosted_invoice_url = invoice.get('hosted_invoice_url')
        if not customer_id:
            logger.warning('invoice.payment_action_required: no customer in event')
            return
        try:
            sc = StripeCustomer.objects.get(stripe_customer_id=customer_id)
        except StripeCustomer.DoesNotExist:
            logger.warning('invoice.payment_action_required: no StripeCustomer for %s', customer_id)
            return
        if hosted_invoice_url:
            try:
                from .emails import send_payment_action_required_email
                send_payment_action_required_email(sc.user, hosted_invoice_url)
            except Exception as e:
                logger.error('invoice.payment_action_required: email failed for user %s: %s', sc.user.pk, e, exc_info=True)
        logger.info('invoice.payment_action_required handled for user %s (invoice=%s)', sc.user.pk, invoice.get('id'))


class AdminProductListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        products = Product.objects.all()
        return Response(AdminProductSerializer(products, many=True, context={'request': request}).data)

    def post(self, request):
        serializer = AdminProductSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class AdminProductDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        serializer = AdminProductSerializer(product, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        product.delete()
        return Response(status=204)


class AdminSubscriptionListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        subs = Subscription.objects.select_related('customer__user').all().order_by('-updated_at')
        return Response(AdminSubscriptionSerializer(subs, many=True).data)


class AdminSubscriptionSyncView(APIView):
    """Check and fix sync state between Stripe subscriptions and the local DB."""
    permission_classes = [IsAdminUser]

    def _fetch_all_stripe_subs(self, client):
        """Return dict stripe_sub_id -> stripe_sub for every subscription in Stripe."""
        subs = {}
        params = {'limit': 100, 'status': 'all'}
        while True:
            page = client.Subscription.list(**params)
            for sub in page.data:
                subs[sub['id']] = sub
            if not page.has_more:
                break
            params['starting_after'] = page.data[-1].id
        return subs

    def _build_issues(self, stripe_subs, local_customers):
        """Compare Stripe subscriptions against local DB records and return issue list."""
        stripe_by_customer = {}
        for sub in stripe_subs.values():
            cid = sub['customer'] if isinstance(sub['customer'], str) else sub['customer']['id']
            stripe_by_customer.setdefault(cid, []).append(sub)

        issues = []
        for sc in local_customers:
            customer_stripe = stripe_by_customer.get(sc.stripe_customer_id, [])
            stripe_by_id    = {s['id']: s for s in customer_stripe}
            active_stripe   = {s['id'] for s in customer_stripe if s['status'] not in ('canceled', 'incomplete_expired')}

            local_sub_ids = set()
            for local_sub in sc.subscriptions.all():
                local_sub_ids.add(local_sub.stripe_subscription_id)
                stripe_match = stripe_by_id.get(local_sub.stripe_subscription_id)
                if stripe_match is None:
                    issues.append({
                        'type': 'orphaned',
                        'description': 'Local record exists but subscription not found in Stripe — will be marked canceled.',
                        'user_email': sc.user.email,
                        'stripe_subscription_id': local_sub.stripe_subscription_id,
                        'local_status': local_sub.status,
                        'stripe_status': None,
                    })
                elif stripe_match['status'] != local_sub.status:
                    issues.append({
                        'type': 'status_mismatch',
                        'description': f'Status differs: local={local_sub.status}, Stripe={stripe_match["status"]}.',
                        'user_email': sc.user.email,
                        'stripe_subscription_id': local_sub.stripe_subscription_id,
                        'local_status': local_sub.status,
                        'stripe_status': stripe_match['status'],
                    })

            for sub_id in active_stripe:
                if sub_id not in local_sub_ids:
                    issues.append({
                        'type': 'missing_local',
                        'description': 'Active Stripe subscription has no local DB record.',
                        'user_email': sc.user.email,
                        'stripe_subscription_id': sub_id,
                        'local_status': None,
                        'stripe_status': stripe_by_id[sub_id]['status'],
                    })

        return issues

    def get(self, request):
        client = _stripe_client()
        try:
            stripe_subs = self._fetch_all_stripe_subs(client)
        except stripe.StripeError as e:
            logger.error('AdminSubscriptionSync GET: Stripe fetch failed: %s', e, exc_info=True)
            return Response({'error': 'Unable to fetch subscriptions from Stripe.'}, status=502)

        local_customers = StripeCustomer.objects.select_related('user').prefetch_related('subscriptions').all()
        issues = self._build_issues(stripe_subs, local_customers)

        return Response({
            'issues': issues,
            'stripe_total': len(stripe_subs),
            'local_total': Subscription.objects.count(),
        })

    def post(self, request):
        client = _stripe_client()
        try:
            stripe_subs = self._fetch_all_stripe_subs(client)
        except stripe.StripeError as e:
            logger.error('AdminSubscriptionSync POST: Stripe fetch failed: %s', e, exc_info=True)
            return Response({'error': 'Unable to fetch subscriptions from Stripe.'}, status=502)

        stripe_by_customer = {}
        for sub in stripe_subs.values():
            cid = sub['customer'] if isinstance(sub['customer'], str) else sub['customer']['id']
            stripe_by_customer.setdefault(cid, []).append(sub)

        local_customers = StripeCustomer.objects.select_related('user').prefetch_related('subscriptions').all()
        fixed      = 0
        fix_errors = []
        debug_rows = []

        for sc in local_customers:
            customer_stripe = stripe_by_customer.get(sc.stripe_customer_id, [])
            stripe_by_id    = {s['id']: s for s in customer_stripe}
            active_stripe   = {s['id'] for s in customer_stripe if s['status'] not in ('canceled', 'incomplete_expired')}

            local_sub_ids = set()
            for local_sub in sc.subscriptions.all():
                local_sub_ids.add(local_sub.stripe_subscription_id)
                row = {
                    'stripe_customer_id': sc.stripe_customer_id,
                    'user_email':         sc.user.email,
                    'subscription_id':    local_sub.stripe_subscription_id,
                    'action':             'none',
                }
                stripe_match = stripe_by_id.get(local_sub.stripe_subscription_id)
                if stripe_match is None:
                    local_sub.status = 'canceled'
                    local_sub.save(update_fields=['status', 'updated_at'])
                    fixed += 1
                    row['action'] = 'marked_canceled'
                    logger.info('AdminSubscriptionSync: marked orphaned sub %s as canceled for user %s', local_sub.stripe_subscription_id, sc.user.pk)
                elif stripe_match['status'] != local_sub.status:
                    try:
                        full    = client.Subscription.retrieve(local_sub.stripe_subscription_id, expand=['items.data.price'])
                        updated = _upsert_subscription_from_stripe(sc, full)
                        if updated.status in ACTIVE_STATUSES:
                            subscription_activated.send(sender=self.__class__, user=sc.user, subscription=updated)
                        elif updated.status in ('canceled', 'unpaid', 'paused'):
                            subscription_cancelled.send(sender=self.__class__, user=sc.user, subscription=updated)
                        fixed += 1
                        row['action'] = 'status_updated'
                        logger.info('AdminSubscriptionSync: updated sub %s for user %s', local_sub.stripe_subscription_id, sc.user.pk)
                    except Exception as e:
                        fix_errors.append({'subscription': local_sub.stripe_subscription_id, 'error': str(e)})
                        row['action'] = f'error: {e}'
                        logger.error('AdminSubscriptionSync: update failed for sub %s: %s', local_sub.stripe_subscription_id, e, exc_info=True)
                else:
                    row['action'] = f'no_change (local={local_sub.status} matches stripe)'
                debug_rows.append(row)

            for sub_id in active_stripe:
                if sub_id not in local_sub_ids:
                    row = {
                        'stripe_customer_id': sc.stripe_customer_id,
                        'user_email':         sc.user.email,
                        'subscription_id':    sub_id,
                        'action':             'none',
                    }
                    try:
                        full    = client.Subscription.retrieve(sub_id, expand=['items.data.price'])
                        created = _upsert_subscription_from_stripe(sc, full)
                        if created.status in ACTIVE_STATUSES:
                            subscription_activated.send(sender=self.__class__, user=sc.user, subscription=created)
                        fixed += 1
                        row['action'] = 'created'
                        logger.info('AdminSubscriptionSync: created local record for sub %s user %s', full.id, sc.user.pk)
                    except Exception as e:
                        fix_errors.append({'subscription': sub_id, 'error': str(e)})
                        row['action'] = f'error: {e}'
                        logger.error('AdminSubscriptionSync: failed to create record for sub %s: %s', sub_id, e, exc_info=True)
                    debug_rows.append(row)

        return Response({'fixed': fixed, 'errors': fix_errors, 'debug': debug_rows})


def _ensure_stripe_product(product):
    """Create or update the Stripe Product for a local Product. Returns the stripe_product_id."""
    client = _stripe_client()
    params = {
        'name': product.name,
        'description': product.description or None,
        'metadata': {'local_id': str(product.pk)},
    }
    if product.stripe_product_id:
        stripe_product = client.Product.modify(product.stripe_product_id, **params)
    else:
        stripe_product = client.Product.create(**params)
        product.stripe_product_id = stripe_product.id
        try:
            product.save(update_fields=['stripe_product_id'])
        except Exception as e:
            logger.critical(
                'DB save failed for Stripe product %s (local product %s) — manual link required: %s',
                stripe_product.id, product.pk, e,
                exc_info=True,
            )
            raise
    return product.stripe_product_id


class AdminProductSyncView(APIView):
    """Push local product name/description to Stripe, creating the Stripe Product if needed."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        try:
            _ensure_stripe_product(product)
        except stripe.StripeError as e:
            logger.error('Stripe sync failed for product %s: %s', pk, e, exc_info=True)
            return Response({'error': str(e)}, status=502)
        return Response(AdminProductSerializer(product, context={'request': request}).data)


class AdminProductPriceListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, product_pk):
        prices = ProductPrice.objects.filter(product_id=product_pk)
        return Response(AdminProductPriceSerializer(prices, many=True).data)

    def post(self, request, product_pk):
        product = get_object_or_404(Product, pk=product_pk)
        serializer = AdminProductPriceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data       = serializer.validated_data
        price_type = data['price_type']
        client     = _stripe_client()

        try:
            stripe_product_id = _ensure_stripe_product(product)
            stripe_params = {
                'product':     stripe_product_id,
                'unit_amount': data['amount'],
                'currency':    data['currency'],
            }
            if price_type == 'recurring':
                stripe_params['recurring'] = {'interval': data['interval']}
            stripe_price = client.Price.create(**stripe_params)
        except stripe.StripeError as e:
            logger.error('Stripe price creation failed for product %s: %s', product_pk, e, exc_info=True)
            return Response({'error': str(e)}, status=502)

        try:
            price = serializer.save(product=product, stripe_price_id=stripe_price.id)
        except IntegrityError:
            try:
                _stripe_client().Price.modify(stripe_price.id, active=False)
            except stripe.StripeError as cleanup_err:
                logger.critical(
                    'Failed to archive orphaned Stripe price %s after IntegrityError — manual cleanup required: %s',
                    stripe_price.id, cleanup_err,
                    exc_info=True,
                )
            if price_type == 'one_time':
                msg = 'A one-time price already exists for this product.'
            else:
                msg = f'A {data["interval"]}ly price already exists for this product.'
            return Response({'error': msg}, status=400)

        logger.info('Created Stripe price %s for product %s', stripe_price.id, product_pk)
        return Response(AdminProductPriceSerializer(price).data, status=201)


class AdminProductPriceDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, product_pk, pk):
        price = get_object_or_404(ProductPrice, pk=pk, product_id=product_pk)
        serializer = AdminProductPriceSerializer(price, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, product_pk, pk):
        price = get_object_or_404(ProductPrice, pk=pk, product_id=product_pk)
        if price.stripe_price_id:
            try:
                _stripe_client().Price.modify(price.stripe_price_id, active=False)
                logger.info('Archived Stripe price %s', price.stripe_price_id)
            except stripe.StripeError as e:
                logger.warning('Could not archive Stripe price %s: %s', price.stripe_price_id, e)
        price.delete()
        return Response(status=204)


_ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


class AdminProductImageListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, product_pk):
        images = ProductImage.objects.filter(product_id=product_pk)
        return Response(ProductImageSerializer(images, many=True, context={'request': request}).data)

    def post(self, request, product_pk):
        product    = get_object_or_404(Product, pk=product_pk)
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'error': 'No image file provided.'}, status=400)

        ext = os.path.splitext(image_file.name)[1].lower()
        if ext not in _ALLOWED_IMAGE_EXTENSIONS:
            return Response(
                {'error': f'Unsupported file type. Allowed: {", ".join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}'},
                status=400,
            )

        image = ProductImage.objects.create(product=product, image=image_file)
        logger.info('Uploaded image %s for product %s', image.pk, product_pk)
        return Response(ProductImageSerializer(image, context={'request': request}).data, status=201)


class AdminProductImageDetailView(APIView):
    permission_classes = [IsAdminUser]

    def delete(self, request, product_pk, pk):
        image = get_object_or_404(ProductImage, pk=pk, product_id=product_pk)
        image.image.delete(save=False)
        image.delete()
        logger.info('Deleted image %s from product %s', pk, product_pk)
        return Response(status=204)

