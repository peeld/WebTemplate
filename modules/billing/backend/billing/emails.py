import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

APP_NAME = getattr(settings, 'APP_NAME', 'App')


def send_payment_action_required_email(user, hosted_invoice_url):
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    if not from_email:
        logger.warning('DEFAULT_FROM_EMAIL not set; skipping payment action required email for user %s', user.pk)
        return

    subject = f'Action required: complete your {APP_NAME} payment'
    text_body = (
        f'Hi {user.username},\n\n'
        'Your subscription payment requires additional authentication (3D Secure).\n\n'
        f'Complete it here: {hosted_invoice_url}\n\n'
        f'The {APP_NAME} team'
    )
    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <h2 style="margin:0 0 16px;">Action required: complete your payment</h2>
    <p>Hi {user.username},</p>
    <p>Your subscription payment requires additional authentication (3D Secure) before it can be processed.</p>
    <p style="margin:24px 0;">
      <a href="{hosted_invoice_url}"
         style="background:#c85a1a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;">
        Complete payment &rarr;
      </a>
    </p>
    <p style="color:#888;font-size:12px;">If you did not initiate this charge, please contact support immediately.</p>
  </div>
</body>
</html>"""

    msg = EmailMultiAlternatives(subject=subject, body=text_body, from_email=from_email, to=[user.email])
    msg.attach_alternative(html_body, 'text/html')
    msg.send(fail_silently=False)
    logger.info('payment_action_required email sent to user %s', user.pk)
