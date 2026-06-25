from django.urls import path
from .views import (
    CartSetupIntentView, CartExecuteView,
    CheckoutView, PortalView, PricesView, ProductsView, SubscriptionView, WebhookView,
    CancelSubscriptionView, ResumeSubscriptionView,
    AdminProductListView, AdminProductDetailView, AdminSubscriptionListView, AdminSubscriptionSyncView,
    AdminProductPriceListView, AdminProductPriceDetailView, AdminProductSyncView,
    AdminProductImageListView, AdminProductImageDetailView,
)

app_name = 'billing'

urlpatterns = [
    path('cart/setup-intent/',         CartSetupIntentView.as_view(),   name='cart-setup-intent'),
    path('cart/execute/',              CartExecuteView.as_view(),       name='cart-execute'),
    path('products/',                  ProductsView.as_view(),          name='products'),
    path('prices/',                    PricesView.as_view(),            name='prices'),
    path('checkout/',                  CheckoutView.as_view(),          name='checkout'),
    path('subscription/',              SubscriptionView.as_view(),      name='subscription'),
    path('subscription/cancel/',       CancelSubscriptionView.as_view(), name='subscription-cancel'),
    path('subscription/resume/',       ResumeSubscriptionView.as_view(), name='subscription-resume'),
    path('portal/',                    PortalView.as_view(),            name='portal'),
    path('webhook/',                   WebhookView.as_view(),           name='webhook'),
    path('admin/products/',            AdminProductListView.as_view(),  name='admin-products'),
    path('admin/products/<int:pk>/',          AdminProductDetailView.as_view(),  name='admin-product-detail'),
    path('admin/products/<int:pk>/sync/',     AdminProductSyncView.as_view(),    name='admin-product-sync'),
    path('admin/products/<int:product_pk>/prices/',         AdminProductPriceListView.as_view(),  name='admin-product-prices'),
    path('admin/products/<int:product_pk>/prices/<int:pk>/', AdminProductPriceDetailView.as_view(), name='admin-product-price-detail'),
    path('admin/subscriptions/',       AdminSubscriptionListView.as_view(),     name='admin-subscriptions'),
    path('admin/subscriptions/sync/', AdminSubscriptionSyncView.as_view(),     name='admin-subscriptions-sync'),
    path('admin/products/<int:product_pk>/images/',          AdminProductImageListView.as_view(),   name='admin-product-images'),
    path('admin/products/<int:product_pk>/images/<int:pk>/', AdminProductImageDetailView.as_view(), name='admin-product-image-detail'),
]
