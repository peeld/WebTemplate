from django.urls import path
from .views import (
    CartSetupIntentView, CartExecuteView,
    CheckoutView, PortalView, PricesView, ProductsView, SubscriptionView, WebhookView,
    CancelSubscriptionView, ResumeSubscriptionView, ChangeSubscriptionView,
    AdminProductListView, AdminProductDetailView, AdminSubscriptionListView, AdminSubscriptionSyncView,
    AdminLicenseListView,
    AdminProductPriceListView, AdminProductPriceDetailView, AdminProductSyncView,
    AdminProductImageListView, AdminProductImageDetailView,
    LicenseActivateView, LicenseCheckinView, MachineCheckinView, LicenseMachineListView, LicenseMachineDeactivateView,
    LicenseListView, InstallTokenCreateView, InstallTokenExchangeView,
)

app_name = 'billing'

urlpatterns = [
    path('cart/setup-intent/',         CartSetupIntentView.as_view(),   name='cart-setup-intent'),
    path('cart/execute/',              CartExecuteView.as_view(),       name='cart-execute'),
    path('products/',                  ProductsView.as_view(),          name='products'),
    path('prices/',                    PricesView.as_view(),            name='prices'),
    path('checkout/',                  CheckoutView.as_view(),          name='checkout'),
    path('subscription/',              SubscriptionView.as_view(),      name='subscription'),
    path('subscription/cancel/',       CancelSubscriptionView.as_view(),  name='subscription-cancel'),
    path('subscription/resume/',       ResumeSubscriptionView.as_view(),  name='subscription-resume'),
    path('subscription/change/',       ChangeSubscriptionView.as_view(),  name='subscription-change'),
    path('portal/',                    PortalView.as_view(),            name='portal'),
    path('webhook/',                   WebhookView.as_view(),           name='webhook'),
    path('admin/products/',            AdminProductListView.as_view(),  name='admin-products'),
    path('admin/products/<int:pk>/',          AdminProductDetailView.as_view(),  name='admin-product-detail'),
    path('admin/products/<int:pk>/sync/',     AdminProductSyncView.as_view(),    name='admin-product-sync'),
    path('admin/products/<int:product_pk>/prices/',         AdminProductPriceListView.as_view(),  name='admin-product-prices'),
    path('admin/products/<int:product_pk>/prices/<int:pk>/', AdminProductPriceDetailView.as_view(), name='admin-product-price-detail'),
    path('admin/subscriptions/',       AdminSubscriptionListView.as_view(),     name='admin-subscriptions'),
    path('admin/subscriptions/sync/', AdminSubscriptionSyncView.as_view(),     name='admin-subscriptions-sync'),
    path('admin/licenses/',            AdminLicenseListView.as_view(),          name='admin-licenses'),
    path('admin/products/<int:product_pk>/images/',          AdminProductImageListView.as_view(),   name='admin-product-images'),
    path('admin/products/<int:product_pk>/images/<int:pk>/', AdminProductImageDetailView.as_view(), name='admin-product-image-detail'),

    path('license/',                                     LicenseListView.as_view(),               name='license-list'),
    path('license/activate/',                            LicenseActivateView.as_view(),           name='license-activate'),
    path('license/checkin/',                             LicenseCheckinView.as_view(),             name='license-checkin'),
    path('license/machine-checkin/',                     MachineCheckinView.as_view(),             name='license-machine-checkin'),
    path('license/machines/',                            LicenseMachineListView.as_view(),         name='license-machines'),
    path('license/machines/<str:machine_id_hash>/',      LicenseMachineDeactivateView.as_view(),   name='license-machine-deactivate'),
    path('license/install-token/exchange/',              InstallTokenExchangeView.as_view(),       name='license-install-token-exchange'),
    path('license/<int:pk>/install-token/',              InstallTokenCreateView.as_view(),         name='license-install-token-create'),
]
