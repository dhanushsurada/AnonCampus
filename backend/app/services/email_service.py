"""
Email service — handles outgoing transactional emails (e.g. password resets).
Supports standard SMTP (Gmail SMTP, Amazon SES, SendGrid, custom college mail relays).
Fails gracefully with non-blocking logging if SMTP is not configured.
"""
import smtplib
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("anoncampus.email")


def _send_smtp_sync(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.info(
            f"[DEV/MOCK EMAIL] SMTP credentials not set in environment. "
            f"Would have delivered email to: {to_email}"
        )
        return False

    sender = settings.EMAILS_FROM_EMAIL or settings.SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{sender}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            if settings.SMTP_TLS:
                server.starttls()

        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.sendmail(sender, [to_email], msg.as_string())
        server.quit()
        logger.info(f"Password reset email dispatched successfully to {to_email}")
        return True
    except Exception as exc:
        logger.error(f"Failed to dispatch email to {to_email} via SMTP: {exc}")
        return False


async def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """
    Sends password reset email asynchronously via thread pool.
    """
    reset_url = f"{settings.FRONTEND_URL}/auth/reset-password?token={reset_token}"
    subject = "AnonCampus — Reset Your Password"

    text_body = f"""Hello,

A request was made to reset your password on AnonCampus.

To set a new password, click or visit this link:
{reset_url}

This link is valid for 30 minutes. If you did not make this request, you can safely ignore this message.

— AnonCampus Security
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080A0F; color: #E2E8F0; padding: 24px; }}
    .card {{ max-width: 520px; margin: 0 auto; background-color: #0F1420; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 32px; }}
    .header {{ font-size: 20px; font-weight: bold; color: #00D4FF; margin-bottom: 16px; }}
    .btn {{ display: inline-block; background-color: #00D4FF; color: #080A0F; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 20px 0; font-size: 14px; }}
    .footer {{ font-size: 12px; color: #64748B; margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">AnonCampus Security</div>
    <p>Hello,</p>
    <p>A request was received to reset your AnonCampus password. Click the button below to choose your new password:</p>
    <p><a href="{reset_url}" class="btn">Reset Password</a></p>
    <p style="font-size: 13px; color: #94A3B8;">Or copy and paste this link in your browser:<br><span style="color: #00D4FF; word-break: break-all;">{reset_url}</span></p>
    <div class="footer">
      This link expires in 30 minutes. If you did not make this request, you can safely ignore this message.
    </div>
  </div>
</body>
</html>
"""

    return await asyncio.to_thread(_send_smtp_sync, to_email, subject, html_body, text_body)
