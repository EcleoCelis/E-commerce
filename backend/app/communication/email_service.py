import html
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import quote

from flask import current_app, has_app_context, has_request_context, request


logger = logging.getLogger("secondmarket.email")


class TransactionalEmailService:
    def __init__(self):
        self.sent_emails = []  # In-memory queue for testing/audit

    @staticmethod
    def _resolve_public_base_url(base_url: str = "") -> str:
        candidate = (base_url or "").strip()
        if not candidate and has_app_context():
            candidate = str(current_app.config.get("APP_PUBLIC_BASE_URL") or "").strip()
        if not candidate:
            candidate = os.getenv("APP_PUBLIC_BASE_URL", "").strip()
        if not candidate and has_request_context():
            candidate = request.url_root.strip()
        return candidate.rstrip("/")

    @staticmethod
    def _is_production_runtime() -> bool:
        if has_app_context():
            if current_app.config.get("TESTING") or current_app.config.get("DEBUG"):
                return False
            return str(current_app.config.get("ENV_NAME", "")).lower() == "production"
        return os.getenv("FLASK_ENV", "").lower() == "production"

    def send_email(self, to_email: str, subject: str, body_text: str, body_html: str = None) -> bool:
        record = {
            "to": to_email,
            "subject": subject,
            "text": body_text,
            "html": body_html,
        }
        self.sent_emails.append(record)

        smtp_host = os.getenv("SMTP_HOST", "").strip()
        if smtp_host:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = os.getenv("EMAIL_FROM", "no-reply@secondmarket.local").strip()
                msg["To"] = to_email

                msg.attach(MIMEText(body_text, "plain", "utf-8"))
                if body_html:
                    msg.attach(MIMEText(body_html, "html", "utf-8"))

                port = int(os.getenv("SMTP_PORT", "587"))
                timeout = float(os.getenv("SMTP_TIMEOUT", "15"))
                use_ssl = os.getenv("SMTP_USE_SSL", "").lower() == "true" or port == 465
                use_tls = not use_ssl and os.getenv("SMTP_USE_TLS", "true").lower() == "true"

                smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
                with smtp_cls(smtp_host, port, timeout=timeout) as server:
                    if use_tls:
                        server.starttls()
                    username = os.getenv("SMTP_USER", "").strip()
                    password = os.getenv("SMTP_PASS", "").strip()
                    if username and password:
                        server.login(username, password)
                    server.sendmail(msg["From"], [to_email], msg.as_string())

                logger.info("Sent email to %s: %s", to_email, subject)
                return True
            except Exception as exc:
                logger.error("Failed to send email to %s via SMTP: %s", to_email, exc)
                return False

        if self._is_production_runtime():
            logger.warning(
                "SMTP_HOST is not configured in production; email to %s (%s) was not delivered.",
                to_email,
                subject,
            )
            return False

        logger.info("[DEV/MOCK EMAIL] To: %s | Subject: %s | Body: %s...", to_email, subject, body_text[:120])
        return True

    def send_order_confirmation(self, user_email: str, order_number: str, total_amount: str):
        subject = f"Order Confirmed — #{order_number} | SecondMarket"
        text = (
            f"Thank you for your order!\n\n"
            f"Order Reference: {order_number}\n"
            f"Total: {total_amount}\n\n"
            f"You can track your order status anytime at /orders.\n"
            f"— The SecondMarket Team"
        )
        return self.send_email(user_email, subject, text)

    def send_shipping_update(self, user_email: str, order_number: str, tracking_number: str):
        subject = f"Your Order #{order_number} Has Shipped! | SecondMarket"
        text = (
            f"Great news! Your secondhand items are on their way.\n\n"
            f"Order Reference: {order_number}\n"
            f"Tracking Number: {tracking_number}\n\n"
            f"Track your package at /orders.\n"
            f"— The SecondMarket Team"
        )
        return self.send_email(user_email, subject, text)

    def send_password_reset(self, user_email: str, reset_token: str, base_url: str = ""):
        subject = "Password Reset Request | SecondMarket"
        public_base_url = self._resolve_public_base_url(base_url)
        reset_path = f"/login.html?reset_token={quote(reset_token, safe='')}"
        reset_url = f"{public_base_url}{reset_path}" if public_base_url else reset_path

        text = (
            "You requested a password reset for your SecondMarket account.\n\n"
            f"Open this link to choose a new password (expires in 60 minutes):\n{reset_url}\n\n"
            f"Or paste this reset token on the Reset Password page:\n{reset_token}\n\n"
            "If you did not request this, please disregard this message.\n"
            "— The SecondMarket Team"
        )
        escaped_url = html.escape(reset_url, quote=True)
        escaped_token = html.escape(reset_token)
        body_html = (
            "<div style=\"font-family:Arial,sans-serif;color:#2E2B26;line-height:1.6;max-width:560px;\">"
            "<h2 style=\"margin:0 0 12px;\">Reset Your SecondMarket Password</h2>"
            "<p>You requested a password reset for your SecondMarket account. This link expires in 60 minutes.</p>"
            f"<p style=\"margin:20px 0;\"><a href=\"{escaped_url}\" "
            "style=\"display:inline-block;background:#4A4236;color:#FFFFFF;text-decoration:none;"
            "padding:12px 20px;border-radius:6px;font-weight:bold;\">Choose New Password</a></p>"
            "<p>Or paste this reset token on the Reset Password page:</p>"
            f"<p style=\"background:#F4F1EB;padding:10px 12px;border-radius:6px;font-family:monospace;\">{escaped_token}</p>"
            "<p style=\"color:#6E614D;font-size:13px;\">If you did not request this, please ignore this email.</p>"
            "</div>"
        )
        return self.send_email(user_email, subject, text, body_html=body_html)


email_service = TransactionalEmailService()
