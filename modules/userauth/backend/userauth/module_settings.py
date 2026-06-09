"""
userauth/module_settings.py — Settings required by the userauth module.

The install script merges these into core/backend/core/settings/base.py (or
development.py / production.py as appropriate). This file is the authoritative
record of what the module needs — update it whenever module dependencies change.

INSTRUCTIONS
────────────
1. INSTALLED_APPS — add to core settings:

    INSTALLED_APPS += [
        # allauth
        'django.contrib.sites',
        'allauth',
        'allauth.account',
        'allauth.socialaccount',
        'allauth.socialaccount.providers.google',
        # dj-rest-auth
        'dj_rest_auth',
        'dj_rest_auth.registration',
        # JWT support
        'rest_framework_simplejwt',
    ]
    SITE_ID = 1

2. MIDDLEWARE — insert after SessionMiddleware:

    MIDDLEWARE += ['allauth.account.middleware.AccountMiddleware']

3. REST_FRAMEWORK — update DEFAULT_AUTHENTICATION_CLASSES:

    REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'] = [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ]

4. SIMPLE_JWT config (add to settings):

    from datetime import timedelta
    SIMPLE_JWT = {
        'ACCESS_TOKEN_LIFETIME':  timedelta(hours=1),
        'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
        'ROTATE_REFRESH_TOKENS':  True,
    }

5. allauth / dj-rest-auth config:

    ACCOUNT_EMAIL_REQUIRED        = True
    ACCOUNT_AUTHENTICATION_METHOD = 'username'
    ACCOUNT_EMAIL_VERIFICATION    = 'none'  # handled by userauth module itself
    REST_USE_JWT                  = True
    JWT_AUTH_COOKIE               = None    # stateless JWT — no cookie

6. reCAPTCHA keys (set via environment variables):

    RECAPTCHA_SITE_KEY   = os.environ.get('RECAPTCHA_SITE_KEY', '')
    RECAPTCHA_SECRET_KEY = os.environ.get('RECAPTCHA_SECRET_KEY', '')
    # For Enterprise reCAPTCHA also set:
    # RECAPTCHA_PROJECT_ID = os.environ.get('RECAPTCHA_PROJECT_ID', '')

7. Frontend URL (used in email links):

    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

8. Google OAuth keys:

    SOCIALACCOUNT_PROVIDERS = {
        'google': {
            'APP': {
                'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
                'secret':    os.environ.get('GOOGLE_CLIENT_SECRET', ''),
                'key':       '',
            },
            'SCOPE': ['profile', 'email'],
            'AUTH_PARAMS': {'access_type': 'online'},
        }
    }

9. Root URLs — add to core/backend/core/urls.py:

    from userauth.root_urls import urlpatterns as userauth_root_urls
    urlpatterns += userauth_root_urls
"""
