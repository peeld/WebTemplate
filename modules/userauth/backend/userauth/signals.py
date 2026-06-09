# Signal handlers and signal definitions for the userauth module.
# Import this module only via UserauthConfig.ready() — never import directly.

from django.dispatch import Signal

# Fired after a new user account is created via email/password registration.
# Keyword args: user (User instance)
# Listeners: profile module, analytics, welcome-email hooks.
user_registered = Signal()

# Fired after email verification succeeds (either code or link path).
# Keyword args: user (User instance)
# Listeners: welcome-email hooks, onboarding flows.
user_email_verified = Signal()
