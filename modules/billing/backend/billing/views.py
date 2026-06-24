import logging
import os

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

from .models import Product, ProductImage, ProductPrice, StripeCustomer, Subscription
from .serializers import ProductSerializer, SubscriptionSerializer, AdminProductSerializer, AdminProductPriceSerializer, AdminSubscriptionSerializer, ProductImageSerializer
from .signals import checkout_completed, subscription_activated, subscription_cancelled, payment_completed

logger = logging.getLogger(__name__)


def _stripe_client():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _get_or_create_stripe_customer(user, client):
    """Return (StripeCustomer, customer_id). Creates Stripe Customer if needed. Raises stripe.StripeError."""
    try:
        sc = user.stripe_customer
        return sc, sc.stripe_customer_id
    except StripeCustomer.DoesNotExist:
        customer = client.Customer.create(
            email=user.email,
            metadata={'user_id': str(user.pk)},
        )
        sc = StripeCustomer.objects.create(
            user=user,
            stripe_customer_id=customer.id,
        )
        logger.info('Created Stripe customer %s for user %s', customer.id, user.pk)
        return sc, customer.id


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
    """Return the current subscription for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            subscription = request.user.stripe_customer.subscription
            return Response(SubscriptionSerializer(subscription).data)
        except (StripeCustomer.DoesNotExist, Subscription.DoesNotExist):
            return Response({'status': 'none'})


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


class CartSetupIntentView(APIView):
    """Create a Stripe SetupIntent so the frontend can collect and save a payment method."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        client = _stripe_client()
        try:
            _sc, customer_id = _get_or_create_stripe_customer(request.user, client)
        except stripe.StripeError as e:
            logger.error('CartSetupIntent: customer create failed for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to create billing account.'}, status=502)

        try:
            setup_intent = client.SetupIntent.create(
                customer=customer_id,
                usage='off_session',
            )
        except stripe.StripeError as e:
            logger.error('CartSetupIntent: SetupIntent create failed for user %s: %s', request.user.pk, e, exc_info=True)
            return Response({'error': 'Unable to initialize checkout.'}, status=502)

        logger.info('SetupIntent %s created for user %s', setup_intent.id, request.user.pk)
        return Response({'client_secret': setup_intent.client_secret, 'customer_id': customer_id})


class CartExecuteView(APIView):
    """Execute a cart by creating PaymentIntent(s) and Subscription(s) from a saved payment method."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payment_method = request.data.get('payment_method')
        items_data     = request.data.get('items', [])

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

        try:
            customer_id = request.user.stripe_customer.stripe_customer_id
        except StripeCustomer.DoesNotExist:
            return Response({'error': 'No billing account found. Please restart checkout.'}, status=400)

        client = _stripe_client()

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
            try:
                pi = client.PaymentIntent.create(
                    amount=total,
                    currency=currency,
                    customer=customer_id,
                    payment_method=payment_method,
                    confirm=True,
                    off_session=True,
                )
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

        if event_type == 'checkout.session.completed':
            try:
                self._handle_checkout_completed(data)
            except Exception as e:
                logger.error('Error in _handle_checkout_completed for event %s: %s', event.get('id'), e, exc_info=True)
        elif event_type in ('customer.subscription.created', 'customer.subscription.updated'):
            try:
                self._handle_subscription_upsert(data)
            except Exception as e:
                logger.error('Error in _handle_subscription_upsert for event %s: %s', event.get('id'), e, exc_info=True)
        elif event_type == 'customer.subscription.deleted':
            try:
                self._handle_subscription_deleted(data)
            except Exception as e:
                logger.error('Error in _handle_subscription_deleted for event %s: %s', event.get('id'), e, exc_info=True)
        elif event_type == 'payment_intent.succeeded':
            try:
                self._handle_payment_intent_succeeded(data)
            except Exception as e:
                logger.error('Error in _handle_payment_intent_succeeded for event %s: %s', event.get('id'), e, exc_info=True)
        elif event_type == 'payment_intent.payment_failed':
            logger.warning('payment_intent.payment_failed: pi=%s customer=%s', data.get('id'), data.get('customer'))
        elif event_type == 'invoice.payment_action_required':
            try:
                self._handle_invoice_payment_action_required(data)
            except Exception as e:
                logger.error('Error in _handle_invoice_payment_action_required for event %s: %s', event.get('id'), e, exc_info=True)
        else:
            logger.debug('Stripe webhook event not handled: %s (event_id=%s)', event_type, event.get('id'))

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

        period_end = timezone.datetime.fromtimestamp(
            sub['current_period_end'], tz=timezone.utc
        )
        try:
            price_id   = sub['items']['data'][0]['price']['id']
            product_id = sub['items']['data'][0]['price']['product']
        except (KeyError, IndexError) as e:
            logger.error('subscription upsert: malformed items for subscription %s: %s', sub.get('id'), e, exc_info=True)
            return

        try:
            subscription, _ = Subscription.objects.update_or_create(
                customer=sc,
                defaults={
                    'stripe_subscription_id': sub['id'],
                    'stripe_price_id':        price_id,
                    'stripe_product_id':      product_id,
                    'status':                 sub['status'],
                    'current_period_end':     period_end,
                    'cancel_at_period_end':   sub['cancel_at_period_end'],
                },
            )
        except Exception as e:
            logger.error('subscription upsert: DB error for subscription %s: %s', sub.get('id'), e, exc_info=True)
            return

        subscription_activated.send(sender=self.__class__, user=sc.user, subscription=subscription)
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
