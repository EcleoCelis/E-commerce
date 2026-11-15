from flask import Blueprint, g, request

from backend.app.auth.decorators import login_required
from backend.app.auth.service import (
    AuthError,
    create_user_address,
    delete_user_address,
    list_user_addresses,
    set_default_user_address,
    update_user_address,
)
from backend.app.auth.validation import validate_address_payload
from backend.app.core.responses import error_response, success_response


addresses_bp = Blueprint("addresses", __name__, url_prefix="/addresses")


def auth_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )


def validation_error_response(errors):
    return error_response(
        message="Address validation failed.",
        status_code=422,
        code="validation_error",
        details=errors,
    )


@addresses_bp.get("")
@login_required
def get_addresses():
    addresses = list_user_addresses(g.current_user.id)
    return success_response(
        data={"addresses": [a.to_dict() for a in addresses]},
        message="Addresses loaded successfully.",
    )


@addresses_bp.post("")
@login_required
def create_address():
    data, errors = validate_address_payload(request.get_json(silent=True), partial=False)
    if errors:
        return validation_error_response(errors)

    address = create_user_address(g.current_user.id, data)
    return success_response(
        data=address.to_dict(),
        message="Address saved successfully.",
        status_code=201,
    )


@addresses_bp.patch("/<int:address_id>")
@login_required
def update_address(address_id):
    data, errors = validate_address_payload(request.get_json(silent=True), partial=True)
    if errors:
        return validation_error_response(errors)

    try:
        address = update_user_address(address_id, g.current_user.id, data)
    except AuthError as exc:
        return auth_error_response(exc)

    return success_response(
        data=address.to_dict(),
        message="Address updated successfully.",
    )


@addresses_bp.delete("/<int:address_id>")
@login_required
def delete_address(address_id):
    try:
        delete_user_address(address_id, g.current_user.id)
    except AuthError as exc:
        return auth_error_response(exc)

    return success_response(
        data={"deleted": True},
        message="Address deleted successfully.",
    )


@addresses_bp.post("/<int:address_id>/set-default")
@login_required
def set_default(address_id):
    try:
        address = set_default_user_address(address_id, g.current_user.id)
    except AuthError as exc:
        return auth_error_response(exc)

    return success_response(
        data=address.to_dict(),
        message="Default address updated.",
    )
