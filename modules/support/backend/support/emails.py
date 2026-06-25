import logging
from django.conf import settings
from django.contrib.auth import get_user_model

from userauth.emails import base_html, send_email

logger = logging.getLogger(__name__)

APP_NAME = getattr(settings, 'APP_NAME', 'App')
FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')


def _staff_emails():
    User = get_user_model()
    return list(
        User.objects.filter(models_filter=None, is_active=True)
        .filter(models.Q(is_staff=True) | models.Q(is_superuser=True))
        .values_list('email', flat=True)
    )


def _staff_email_list():
    from django.db.models import Q
    User = get_user_model()
    return list(
        User.objects.filter(is_active=True)
        .filter(Q(is_staff=True) | Q(is_superuser=True))
        .exclude(email='')
        .values_list('email', flat=True)
    )


def send_ticket_created(ticket):
    """Email all staff when a new support ticket is opened."""
    try:
        recipients = _staff_email_list()
        if not recipients:
            logger.warning('No staff recipients found for ticket created notification')
            return

        ticket_url = f'{FRONTEND_URL}/support/tickets/{ticket.pk}'
        subject = f'[{APP_NAME}] New support ticket: {ticket.title}'
        text_body = (
            f'A new support ticket has been submitted.\n\n'
            f'Ticket #{ticket.pk}: {ticket.title}\n'
            f'User: {ticket.user.username}\n'
            f'Priority: {ticket.get_priority_display()}\n\n'
            f'{ticket.description}\n\n'
            f'View ticket: {ticket_url}'
        )
        html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        New Support Ticket
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 24px 0;">
        Submitted by <strong style="color:#ffffff;">{ticket.user.username}</strong>
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tr>
          <td style="color:#8899aa;font-size:13px;padding:6px 0;width:90px;">Ticket</td>
          <td style="color:#ffffff;font-size:13px;padding:6px 0;">#{ticket.pk}</td>
        </tr>
        <tr>
          <td style="color:#8899aa;font-size:13px;padding:6px 0;">Title</td>
          <td style="color:#ffffff;font-size:13px;padding:6px 0;">{ticket.title}</td>
        </tr>
        <tr>
          <td style="color:#8899aa;font-size:13px;padding:6px 0;">Priority</td>
          <td style="color:#ffffff;font-size:13px;padding:6px 0;">{ticket.get_priority_display()}</td>
        </tr>
      </table>

      <p style="color:#ccd6e0;font-size:14px;line-height:1.7;margin:0 0 28px 0;white-space:pre-wrap;">{ticket.description}</p>

      <a href="{ticket_url}"
         style="display:inline-block;background:#c85a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        View Ticket &rarr;
      </a>
    """
        send_email(recipients, subject, text_body, base_html(subject, html_content))
    except Exception:
        logger.error('Failed to send ticket_created email for ticket %s', ticket.pk, exc_info=True)


def send_new_message(message):
    """Email the appropriate party when a new message is posted on a ticket."""
    try:
        ticket = message.ticket
        ticket_url = f'{FRONTEND_URL}/support/tickets/{ticket.pk}'

        if message.is_staff_reply:
            recipient = ticket.user.email
            if not recipient:
                logger.warning('Ticket owner %s has no email; skipping notification', ticket.user_id)
                return
            subject = f'[{APP_NAME}] Staff replied to your ticket: {ticket.title}'
            text_body = (
                f'Hi {ticket.user.username},\n\n'
                f'A staff member has replied to your support ticket #{ticket.pk}.\n\n'
                f'{message.body}\n\n'
                f'View ticket: {ticket_url}'
            )
            who = 'A staff member'
        else:
            recipients = _staff_email_list()
            if not recipients:
                logger.warning('No staff recipients for new message on ticket %s', ticket.pk)
                return
            recipient = recipients
            subject = f'[{APP_NAME}] New reply on ticket #{ticket.pk}: {ticket.title}'
            text_body = (
                f'{message.author.username} replied on ticket #{ticket.pk}.\n\n'
                f'{message.body}\n\n'
                f'View ticket: {ticket_url}'
            )
            who = message.author.username

        html_content = f"""
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 8px 0;">
        New Reply
      </h1>
      <p style="color:#8899aa;font-size:15px;margin:0 0 24px 0;">
        <strong style="color:#ffffff;">{who}</strong> replied on
        <a href="{ticket_url}" style="color:#c85a1a;">ticket #{ticket.pk}: {ticket.title}</a>
      </p>

      <div style="background:rgba(255,255,255,0.04);border-left:3px solid #c85a1a;padding:16px 20px;margin:0 0 28px 0;border-radius:0 8px 8px 0;">
        <p style="color:#ccd6e0;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">{message.body}</p>
      </div>

      <a href="{ticket_url}"
         style="display:inline-block;background:#c85a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        View Ticket &rarr;
      </a>
    """
        send_email(recipient, subject, text_body, base_html(subject, html_content))
    except Exception:
        logger.error('Failed to send new_message email for message %s', message.pk, exc_info=True)
