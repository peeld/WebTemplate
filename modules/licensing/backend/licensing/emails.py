"""
licensing/emails.py — Trial and license-related transactional emails.
"""

import logging
from django.conf import settings
from core.emails import send_email, base_html

logger = logging.getLogger(__name__)

APP_NAME = getattr(settings, 'APP_NAME', 'App')


def send_trial_email(email, install_token, product_name):
    """
    Email a single-use install token for a newly created trial license.

    Args:
        email:         recipient address
        install_token: raw (unhashed) install token — shown once
        product_name:  display name of the trialed product
    """
    subject = f'Your {product_name} trial'
    text_body = (
        f'Your 30-day trial of {product_name} is ready.\n\n'
        f'Install token: {install_token}\n\n'
        'Enter this token in the app to activate your trial. '
        'It works once and expires in 7 days if unused.\n\n'
        f'The {APP_NAME} team'
    )

    html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        Your trial is ready
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 32px 0;">
        Enter this install token in {product_name} to activate your 30-day trial.
      </p>

      <div style="text-align:center;margin:0 0 32px 0;">
        <div style="display:inline-block;background:rgba(200,90,26,0.15);border:2px solid rgba(200,90,26,0.4);border-radius:12px;padding:20px 40px;">
          <p style="color:#8899aa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px 0;">Install token</p>
          <p style="color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.15em;margin:0;">{install_token}</p>
        </div>
      </div>

      <p style="color:#8899aa;font-size:13px;line-height:1.7;margin:0;">
        This token works once and expires in <strong style="color:#ffffff;">7 days</strong>
        if not used. If you didn't request this trial you can ignore this email.
      </p>
    """

    send_email(email, subject, text_body, base_html(subject, html_content))
    logger.info('Trial email queued', extra={'email': email, 'product': product_name})
