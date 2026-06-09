"""
userauth/emails.py — Email utilities and auth-related transactional emails

Contains:
  - base_html / send_email: shared infrastructure (importable by other modules)
  - send_verification_email: signup verification code + link
  - send_password_reset: password reset link

APP_NAME and branding are read from Django settings so they can be customised
per deployment without editing this file.
"""

import logging
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

try:
    import sentry_sdk
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
APP_NAME     = getattr(settings, 'APP_NAME', 'App')


def base_html(title, content):
    """Wrap content in the standard branded HTML email shell."""
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0a1628;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;">
                {APP_NAME}
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#112240;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;">
              {content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="color:#8899aa;font-size:12px;margin:0;">
                &copy; 2026 Peel Software Development LLC - All rights reserved.<br>
                <a href="{{{{ unsubscribe_url }}}}" style="color:#8899aa;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_email(to, subject, text_body, html_body):
    """
    Core send function — all emails go through here.

    Raises:
        ImproperlyConfigured: If DEFAULT_FROM_EMAIL is not set.
        ValueError: If 'to' is empty or wrong type.
    """
    try:
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
        if not from_email:
            raise ImproperlyConfigured(
                'DEFAULT_FROM_EMAIL is not configured. Set it in Django settings.'
            )

        if isinstance(to, str):
            recipients = [to]
        elif isinstance(to, (list, tuple)):
            recipients = list(to)
        else:
            raise ValueError(f'Invalid recipient type: {type(to)}. Expected str or list.')

        if not recipients:
            raise ValueError('Recipient list cannot be empty.')

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=from_email,
            to=recipients,
        )
        msg.attach_alternative(html_body, 'text/html')
        result = msg.send(fail_silently=False)

        logger.info(
            'Email sent successfully',
            extra={'subject': subject, 'to': recipients, 'result': result},
        )
        return result

    except ImproperlyConfigured as e:
        logger.critical(f'Email configuration error: {e}', exc_info=True)
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise

    except ValueError as e:
        logger.warning(f'Invalid email recipient: {e}', exc_info=True)
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise

    except Exception as e:
        logger.error(
            f'Failed to send email: {e}',
            extra={'subject': subject, 'recipients': to, 'error_type': type(e).__name__},
            exc_info=True,
        )
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise


# ── Auth transactional emails ────────────────────────────────────────────────

def send_verification_email(user, token, code):
    """
    Send email verification code + link on signup.

    Args:
        user:  Django User
        token: UUID verification token (for link-click path)
        code:  6-digit code (for inline form path)
    """
    try:
        if not getattr(user, 'email', None):
            raise ValueError(f'User {user.id} has no valid email address.')
        if not token:
            raise ValueError('Verification token is missing or empty.')
        if not code:
            raise ValueError('Verification code is missing or empty.')

        verify_url = f'{FRONTEND_URL}/verify-email/{token}'
        subject = f'Verify your {APP_NAME} account'
        text_body = (
            f'Hi {user.username},\n\n'
            f'Your verification code is: {code}\n\n'
            f'Or click this link: {verify_url}\n\n'
            'Expires in 24 hours.\n\n'
        )

        html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        Verify your email
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 32px 0;">
        Enter this code to activate your account, {user.username}.
      </p>

      <div style="text-align:center;margin:0 0 32px 0;">
        <div style="display:inline-block;background:rgba(200,90,26,0.15);border:2px solid rgba(200,90,26,0.4);border-radius:12px;padding:20px 40px;">
          <p style="color:#8899aa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px 0;">Verification code</p>
          <p style="color:#ffffff;font-size:36px;font-weight:700;letter-spacing:0.2em;margin:0;">{code}</p>
        </div>
      </div>

      <p style="color:#8899aa;font-size:13px;line-height:1.7;margin:0 0 20px 0;">
        This code expires in <strong style="color:#ffffff;">24 hours</strong>.
        If you didn't create an account you can ignore this email.
      </p>

      <p style="color:#8899aa;font-size:13px;margin:0 0 20px 0;">
        Or click the button below to verify automatically:
      </p>

      <div style="text-align:center;margin:0 0 8px 0;">
        <a href="{verify_url}"
           style="display:inline-block;background:#c85a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Verify my email &rarr;
        </a>
      </div>
    """

        send_email(user.email, subject, text_body, base_html(subject, html_content))

        try:
            token_prefix = str(token)[:8] if token else None
        except Exception:
            token_prefix = '(error reading token)'
        logger.debug('Verification email queued', extra={'user_id': user.id, 'token_prefix': token_prefix})

    except ValueError as e:
        logger.warning(f'Cannot send verification email: {e}', extra={'user_id': getattr(user, 'id', None)})
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_message(f'Verification email failed: {e}', level='warning')
        raise

    except Exception as e:
        logger.error(
            f'Unexpected error sending verification email to user {getattr(user, "id", "unknown")}',
            extra={'email': getattr(user, 'email', 'unknown')},
            exc_info=True,
        )
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise


def send_password_reset(user, token):
    """
    Send password reset link email.

    Args:
        user:  Django User
        token: UUID reset token
    """
    try:
        if not getattr(user, 'email', None):
            raise ValueError(f'User {user.id} has no valid email address.')
        if not token:
            raise ValueError('Password reset token is missing or empty.')

        reset_url = f'{FRONTEND_URL}/reset-password/{token}'
        subject = f'Reset your {APP_NAME} password'
        text_body = (
            f'Hi {user.username},\n\n'
            f'As a reminder, your username is: {user.username}\n\n'
            'Reset your password:\n'
            f'{reset_url}\n\n'
            'This link expires in 1 hour.\n\n'
            f'The {APP_NAME} team'
        )

        html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        Password reset
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 32px 0;">
        We received a request to reset your password.
      </p>

      <p style="color:#ccd6e0;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
        As a reminder, your username is
        <strong style="color:#ffffff;">{user.username}</strong>.
      </p>

      <p style="color:#ccd6e0;font-size:14px;line-height:1.7;margin:0 0 28px 0;">
        Click the button below to choose a new password. This link expires in
        <strong style="color:#ffffff;">1 hour</strong>.
      </p>

      <a href="{reset_url}"
         style="display:inline-block;background:#c85a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;margin:0 0 28px 0;">
        Reset password &rarr;
      </a>

      <p style="color:#8899aa;font-size:12px;margin:0;">
        If you didn't request this you can safely ignore this email.
        Your password won't change.
      </p>
    """

        send_email(user.email, subject, text_body, base_html(subject, html_content))

        try:
            token_prefix = str(token)[:8] if token else None
        except Exception:
            token_prefix = '(error reading token)'
        logger.debug('Password reset email queued', extra={'user_id': user.id, 'token_prefix': token_prefix})

    except ValueError as e:
        logger.warning(f'Cannot send password reset email: {e}', extra={'user_id': getattr(user, 'id', None)})
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_message(f'Password reset email failed: {e}', level='warning')
        raise

    except Exception as e:
        logger.error(
            f'Unexpected error sending password reset email to user {getattr(user, "id", "unknown")}',
            extra={'email': getattr(user, 'email', 'unknown')},
            exc_info=True,
        )
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise
