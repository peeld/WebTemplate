from django.urls import path

from .views import (
    AdminLicenseListView,
    AdminVendorDetailView,
    AdminVendorInvoiceDetailView,
    AdminVendorInvoiceListView,
    AdminVendorListView,
    AdminVendorPoolDetailView,
    AdminVendorPoolListView,
    InstallTokenExchangeView,
    InstallTokenView,
    LicenseActivateView,
    LicenseCheckView,
    LicenseKeyView,
    LicenseMachineView,
    MachineCheckinView,
    TrialRequestView,
    VendorPoolListView,
    VendorTokenDetailView,
    VendorTokenView,
)

app_name = 'licensing'

urlpatterns = [
    path('keys/',                           LicenseKeyView.as_view(),           name='keys'),
    path('keys/<uuid:key>/machines/',       LicenseMachineView.as_view(),       name='key-machines'),
    path('install-tokens/',                 InstallTokenView.as_view(),         name='install-tokens'),
    path('install-token/exchange/',         InstallTokenExchangeView.as_view(), name='install-token-exchange'),
    path('trial/request/',                  TrialRequestView.as_view(),         name='trial-request'),
    path('activate/',                       LicenseActivateView.as_view(),      name='activate'),
    path('checkin/',                        LicenseCheckView.as_view(),         name='checkin'),
    path('machine-checkin/',               MachineCheckinView.as_view(),       name='machine-checkin'),
    path('admin/licenses/',                 AdminLicenseListView.as_view(),     name='admin-licenses'),
    # Vendor endpoints (any authenticated org member)
    path('vendor/pools/',                                    VendorPoolListView.as_view(),       name='vendor-pools'),
    path('vendor/pools/<int:pk>/tokens/',                    VendorTokenView.as_view(),          name='vendor-pool-tokens'),
    path('vendor/pools/<int:pk>/tokens/<int:token_pk>/',     VendorTokenDetailView.as_view(),    name='vendor-pool-token-detail'),
    # Admin vendor/invoice endpoints (is_staff)
    path('admin/vendors/',                              AdminVendorListView.as_view(),         name='admin-vendor-list'),
    path('admin/vendors/<int:pk>/',                     AdminVendorDetailView.as_view(),       name='admin-vendor-detail'),
    path('admin/vendors/<int:vpk>/pools/',              AdminVendorPoolListView.as_view(),     name='admin-vendor-pool-list'),
    path('admin/vendors/<int:vpk>/pools/<int:pk>/',     AdminVendorPoolDetailView.as_view(),   name='admin-vendor-pool-detail'),
    path('admin/vendors/<int:vpk>/invoices/',           AdminVendorInvoiceListView.as_view(),  name='admin-vendor-invoice-list'),
    path('admin/vendors/<int:vpk>/invoices/<int:pk>/',  AdminVendorInvoiceDetailView.as_view(),name='admin-vendor-invoice-detail'),
]
