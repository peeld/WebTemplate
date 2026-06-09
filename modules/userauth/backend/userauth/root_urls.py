"""
userauth/root_urls.py — URL patterns that MUST be mounted at the Django root.

allauth and dj-rest-auth hardcode their callback/redirect URLs and cannot be
nested under /api/userauth/. Include these in core/backend/core/urls.py:

    from userauth.root_urls import urlpatterns as userauth_root_urls
    urlpatterns += userauth_root_urls

See module_settings.py for the required INSTALLED_APPS and settings.
"""

from django.urls import include, path

urlpatterns = [
    # dj-rest-auth: password change, logout, /user/ endpoint
    path('auth/', include('dj_rest_auth.urls')),
    # dj-rest-auth registration (allauth-backed)
    path('auth/registration/', include('dj_rest_auth.registration.urls')),
    # allauth: OAuth callback redirects, account management
    path('accounts/', include('allauth.urls')),
]
