from django.urls import path
from .views import CheckoutView, PortalView, PricesView, SubscriptionView, WebhookView

app_name = 'billing'

urlpatterns = [
    path('prices/',       PricesView.as_view(),       name='prices'),
    path('checkout/',     CheckoutView.as_view(),      name='checkout'),
    path('subscription/', SubscriptionView.as_view(),  name='subscription'),
    path('portal/',       PortalView.as_view(),         name='portal'),
    path('webhook/',      WebhookView.as_view(),        name='webhook'),
]
