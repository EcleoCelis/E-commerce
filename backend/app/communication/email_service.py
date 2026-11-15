import logging
import os
from flask import current_app


logger = logging.getLogger("secondmarket.email")


class TransactionalEmailService:
    def __init__(self):
        self.sent_emails = []  # In-memory queue for testing/audit

    def send_email(self, to_email: str, subject: str, body_text: str, body_html: str = None) -> bool:
        record = {
            "to": to_email,
            "subject": subject,
            "text": body_text,
            "html": body_html,
        }
        self.sent_emails.append(record)

        smtp_host = os.getenv("SMTP_HOST")
        if smtp_host:
            try:
                import smtplib
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText

                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = os.getenv("EMAIL_FROM", "no-reply@secondmarket.local")
                msg["To"] = to_email

                msg.attach(MIMEText(body_text, "plain"))
                if body_html:
                    msg.attach(MIMEText(body_html, "html"))

                port = int(os.getenv("SMTP_PORT", "587"))
                server = smtplib.SMTP(smtp_host, port)
                if os.getenv("SMTP_USE_TLS", "true").lower() == "true":
                    server.starttls()
                username = os.getenv("SMTP_USER")
                password = os.getenv("SMTP_PASS")
                if username and password:
                    server.login(username, password)
                server.sendmail(msg["From"], [to_email], msg.as_string())
                server.quit()
                logger.info(f"Sent email to {to_email}: {subject}")
                return True
            except Exception as exc:
                logger.error(f"Failed to send email to {to_email} via SMTP: {exc}")
                return False

        logger.info(f"[DEV/MOCK EMAIL] To: {to_email} | Subject: {subject} | Body: {body_text[:120]}...")
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

    def send_password_reset(self, user_email: str, reset_token: str):
        subject = "Password Reset Request | SecondMarket"
        text = (
            f"You requested a password reset for your SecondMarket account.\n\n"
            f"Your reset token is: {reset_token}\n\n"
            f"If you did not request this, please disregard this message.\n"
            f"— The SecondMarket Team"
        )
        return self.send_email(user_email, subject, text)


email_service = TransactionalEmailService()
