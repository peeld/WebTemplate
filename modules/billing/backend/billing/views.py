import logging

import stripe
from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StripeCustomer, Subscription
from .serializers import SubscriptionSerializer
from .signals import checkout_completed, subscription_activated, subscription_cancelled

logger = logging.getLogger(__name__)


def _stripe_client():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class PricesView(APIView):
    """Return all active prices with their product names."""
    permission_classes = [AllowAny]

    def get(self, request):
        client = _stripe_client()
        try:
            prices = client.Price.list(active=True, expand=['data.product'])
        except stripe.StripeError as e:
            logger.error('Stripe error fetching prices: %s', e)
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
                logger.error('Failed to create Stripe customer for user %s: %s', request.user.pk, e)
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
            logger.error('Failed to create checkout session for user %s: %s', request.user.pk, e)
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
            logger.error('Failed to create portal session for user %s: %s', request.user.pk, e)
            return Response({'error': 'Unable to open billing portal.'}, status=502)

        return Response({'url': session.url})


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
            logger.error('Webhook parsing error: %s', e)
            return Response({'error': 'Invalid payload.'}, status=400)

        event_type = event['type']
        data       = event['data']['object']

        logger.info('Stripe webhook received: %s', event_type)

        if event_type == 'checkout.session.completed':
            self._handle_checkout_completed(data)
        elif event_type in ('customer.subscription.created', 'customer.subscription.updated'):
            self._handle_subscription_upsert(data)
        elif event_type == 'customer.subscription.deleted':
            self._handle_subscription_deleted(data)

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
        price_id   = sub['items']['data'][0]['price']['id']
        product_id = sub['items']['data'][0]['price']['product']

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
