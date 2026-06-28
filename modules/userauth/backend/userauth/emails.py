"""
userauth/emails.py — Auth-related transactional emails.

send_email and base_html live in core.emails and are re-exported here
for backwards compatibility.
"""

import logging
from django.conf import settings
from core.emails import send_email, base_html  # noqa: F401 — re-exported

logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
APP_NAME     = getattr(settings, 'APP_NAME', 'App')


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
        logger.warning('Cannot send verification email: %s', e, extra={'user_id': getattr(user, 'id', None)})
        raise

    except Exception as e:
        logger.error(
            'Unexpected error sending verification email to user %s',
            getattr(user, 'id', 'unknown'),
            extra={'email': getattr(user, 'email', 'unknown')},
            exc_info=True,
        )
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
        logger.warning('Cannot send password reset email: %s', e, extra={'user_id': getattr(user, 'id', None)})
        raise

    except Exception as e:
        logger.error(
            'Unexpected error sending password reset email to user %s',
            getattr(user, 'id', 'unknown'),
            extra={'email': getattr(user, 'email', 'unknown')},
            exc_info=True,
        )
        raise
