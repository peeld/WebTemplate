import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
APP_NAME = getattr(settings, 'APP_NAME', 'App')


def _base_html(title, content):
    return f"""<!DOCTYPE html>
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
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;">{APP_NAME}</span>
            </td>
          </tr>
          <tr>
            <td style="background:#112240;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;">
              {content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="color:#8899aa;font-size:12px;margin:0;">
                &copy; 2026 Peel Software Development LLC - All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_email(to, subject, text_body, html_body):
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    if not from_email:
        raise ImproperlyConfigured('DEFAULT_FROM_EMAIL is not configured.')
    msg = EmailMultiAlternatives(subject=subject, body=text_body, from_email=from_email, to=[to])
    msg.attach_alternative(html_body, 'text/html')
    return msg.send(fail_silently=False)


def send_org_invite(invite, org, invited_by):
    accept_url = f'{FRONTEND_URL}/orgs/invite/{invite.token}'
    subject = f"You've been invited to join {org.name} on {APP_NAME}"

    text_body = (
        f'Hi,\n\n'
        f'{invited_by.username} has invited you to join {org.name} on {APP_NAME}.\n\n'
        f'Accept this invitation:\n{accept_url}\n\n'
        'This link expires in 7 days.\n\n'
        f'The {APP_NAME} team'
    )

    html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        You're invited!
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 32px 0;">
        <strong style="color:#ffffff;">{invited_by.username}</strong> has invited you to join
        <strong style="color:#ffffff;">{org.name}</strong> on {APP_NAME}.
      </p>
      <div style="text-align:center;margin:0 0 32px 0;">
        <a href="{accept_url}"
           style="display:inline-block;background:#c85a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Accept invitation &rarr;
        </a>
      </div>
      <p style="color:#8899aa;font-size:13px;line-height:1.7;margin:0;">
        This invitation expires in <strong style="color:#ffffff;">7 days</strong>.
        If you weren't expecting this, you can safely ignore it.
      </p>
    """

    try:
        _send_email(invite.email, subject, text_body, _base_html(subject, html_content))
        logger.debug('Org invite sent', extra={'org_id': org.id, 'email': invite.email})
    except Exception as e:
        logger.error(
            'Failed to send org invite to %s for org %s: %s',
            invite.email, org.id, e,
            exc_info=True,
        )
        raise
