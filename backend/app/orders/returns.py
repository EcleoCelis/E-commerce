import uuid
from backend.app.checkout.payment_service import PaymentServiceError, payment_service
from backend.app.communication import create_notification, email_service, notify_admins
from backend.app.extensions import db
from backend.app.models.base import utc_now
from backend.app.models.commerce import (
    Order,
    OrderStatus,
    Payment,
    PaymentStatus,
    ReturnRequest,
    ReturnStatus,
)


class ReturnError(Exception):
    def __init__(self, message, code="return_error", status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def create_return_request(order_number: str, user_id: int, reason: str, description: str) -> ReturnRequest:
    order = Order.query.filter_by(order_number=order_number, user_id=user_id).one_or_none()
    if not order:
        raise ReturnError("Order was not found.", code="order_not_found", status_code=404)

    # Valid statuses for return: delivered or shipped
    if order.status not in (OrderStatus.DELIVERED.value, OrderStatus.SHIPPED.value):
        raise ReturnError(
            f"Returns are only permitted for delivered orders. Current order status: {order.status}.",
            code="order_not_eligible_for_return",
        )

    # Check for existing active return request
    existing = ReturnRequest.query.filter_by(order_id=order.id).filter(
        ReturnRequest.status.in_([ReturnStatus.REQUESTED.value, ReturnStatus.APPROVED.value])
    ).first()
    if existing:
        raise ReturnError("An active return request already exists for this order.", code="duplicate_return_request")

    cleaned_reason = (reason or "").strip()
    cleaned_desc = (description or "").strip()
    if not cleaned_reason:
        raise ReturnError("A return reason is required.", code="missing_reason")
    if not cleaned_desc:
        raise ReturnError("A description of the issue is required.", code="missing_description")

    return_number = f"RET-{uuid.uuid4().hex[:8].upper()}"
    return_req = ReturnRequest(
        return_number=return_number,
        order_id=order.id,
        user_id=user_id,
        reason=cleaned_reason,
        description=cleaned_desc,
        status=ReturnStatus.REQUESTED.value,
        refund_amount_cents=order.total_cents,
    )
    db.session.add(return_req)
    db.session.commit()

    # Create notifications
    create_notification(
        user_id=user_id,
        title="Return Request Submitted",
        message=f"Return request #{return_number} for order #{order_number} has been received and is under review.",
        notif_type="order",
        data={"return_number": return_number, "order_number": order_number},
    )

    notify_admins(
        title="New Return Request",
        message=f"Buyer submitted return request #{return_number} for order #{order_number}: {cleaned_reason}",
        notif_type="operational",
        data={"return_number": return_number, "order_number": order_number},
    )

    return return_req


def list_buyer_returns(user_id: int):
    returns = ReturnRequest.query.filter_by(user_id=user_id).order_by(ReturnRequest.created_at.desc()).all()
    return [r.to_dict() for r in returns]


def get_buyer_order_return(order_number: str, user_id: int):
    order = Order.query.filter_by(order_number=order_number, user_id=user_id).one_or_none()
    if not order:
        return None
    ret = ReturnRequest.query.filter_by(order_id=order.id).order_by(ReturnRequest.created_at.desc()).first()
    return ret.to_dict() if ret else None


def list_admin_returns(status: str = None, page: int = 1, per_page: int = 20):
    query = ReturnRequest.query
    if status and status != "all":
        query = query.filter_by(status=status)
    query = query.order_by(ReturnRequest.created_at.desc())

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "returns": [r.to_dict() for r in items],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def update_return_status(return_number: str, status: str, admin_notes: str = None, refund_amount_cents: int = None) -> ReturnRequest:
    return_req = ReturnRequest.query.filter_by(return_number=return_number).one_or_none()
    if not return_req:
        raise ReturnError("Return request was not found.", code="return_not_found", status_code=404)

    valid_statuses = {s.value for s in ReturnStatus}
    if status not in valid_statuses:
        raise ReturnError(f"Invalid return status '{status}'.", code="invalid_status")

    return_req.status = status
    if admin_notes is not None and admin_notes.strip():
        return_req.admin_notes = admin_notes.strip()

    order = return_req.order
    if refund_amount_cents is not None:
        if refund_amount_cents < 0 or (order and refund_amount_cents > int(order.total_cents or 0)):
            max_amount = (order.total_cents / 100) if order else 0
            raise ReturnError(
                f"Refund amount must be between ₱0.00 and order total (₱{max_amount:,.2f}).",
                code="invalid_refund_amount",
                status_code=422,
            )
        return_req.refund_amount_cents = int(refund_amount_cents)

    refund_result = None
    if status in (ReturnStatus.REFUNDED.value, ReturnStatus.COMPLETED.value):
        try:
            refund_result = payment_service.issue_refund(
                order,
                amount_cents=return_req.refund_amount_cents,
                reason="requested_by_customer",
                commit=False,
            )
        except PaymentServiceError as exc:
            db.session.rollback()
            raise ReturnError(exc.message, code=exc.code, status_code=exc.status_code)

        if refund_result and refund_result.get("gateway") == "stripe" and refund_result.get("refund_id"):
            gateway_note = f"Stripe refund {refund_result['refund_id']}"
            if return_req.admin_notes:
                if refund_result["refund_id"] not in return_req.admin_notes:
                    return_req.admin_notes = f"{return_req.admin_notes} ({gateway_note})"
            else:
                return_req.admin_notes = gateway_note

    db.session.commit()

    # Notify buyer
    formatted_amount = f"₱{return_req.refund_amount_cents / 100:,.2f}"
    status_msg = f"Your return #{return_number} has been updated to {status.upper()}."
    if status in (ReturnStatus.REFUNDED.value, ReturnStatus.COMPLETED.value):
        if refund_result and refund_result.get("gateway") == "stripe" and refund_result.get("refund_id"):
            status_msg += f" A Stripe refund of {formatted_amount} ({refund_result['refund_id']}) has been issued."
        else:
            status_msg += f" A refund of {formatted_amount} has been processed."

    create_notification(
        user_id=return_req.user_id,
        title=f"Return #{return_number} {status.title()}",
        message=status_msg,
        notif_type="order",
        data={"return_number": return_number, "order_number": order.order_number},
    )

    if order.user and order.user.email:
        email_service.send_email(
            to_email=order.user.email,
            subject=f"Update on your Return #{return_number} | SecondMarket",
            body_text=status_msg,
        )

    return return_req
