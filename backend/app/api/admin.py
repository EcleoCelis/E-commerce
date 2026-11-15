from pathlib import Path
import re
import uuid
from flask import Blueprint, current_app, g, request
from werkzeug.utils import secure_filename

from backend.app.admin.customers import (
    CustomerAdminError,
    get_admin_customer_detail,
    list_admin_customers,
    revoke_admin_customer_sessions,
    update_admin_customer_status,
)
from backend.app.admin.payments import (
    PaymentAdminError,
    list_admin_payments,
    reconcile_admin_payment,
    refund_admin_payment,
)
from backend.app.admin.settings import (
    SettingsAdminError,
    get_store_config,
    list_admin_audit_logs,
    list_staff_accounts,
    update_staff_role_or_create,
    update_store_config,
)
from backend.app.admin.serializers import serialize_admin_category, serialize_admin_product
from backend.app.admin.service import (
    AdminCategoryError,
    AdminProductError,
    create_admin_category,
    create_admin_product,
    get_admin_product_by_slug,
    get_category_by_slug,
    list_admin_categories,
    list_admin_products,
    parse_admin_product_filters,
    update_admin_category,
    update_admin_category_status,
    delete_admin_category,
    update_admin_product,
    delete_admin_product,
    execute_bulk_product_action,
    list_product_inventory_movements,
    update_admin_product_quantity,
    update_admin_product_status,
)
from backend.app.admin.validation import (
    validate_bulk_product_payload,
    validate_category_payload,
    validate_category_status_payload,
    validate_product_inventory_payload,
    validate_product_payload,
    validate_product_status_payload,
)
from backend.app.auth.decorators import roles_required
from backend.app.auth.rbac import Role, StaffRole
from backend.app.core.responses import error_response, success_response
from backend.app.core.security.uploads import ImageUploadError, process_and_save_image
from backend.app.extensions import db
from backend.app.models import Order, Product, User
from backend.app.trust.serializers import (
    serialize_product_report,
    serialize_review,
)
from backend.app.trust.service import (
    TrustError,
    list_admin_product_reports,
    list_admin_reviews,
    update_admin_product_report_status,
    update_admin_review_status,
)
from backend.app.trust.validation import (
    parse_report_filters,
    parse_review_filters,
    validate_report_status_payload,
    validate_review_status_payload,
)


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def validation_error_response(errors):

    return error_response(
        message="Request validation failed.",
        status_code=422,
        code="validation_error",
        details=errors,
    )


def admin_product_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )


def admin_category_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )


def trust_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )



@admin_bp.get("/categories")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def categories():
    return success_response(
        data=[
            serialize_admin_category(category, product_count=product_count)
            for category, product_count in list_admin_categories()
        ],
        meta={"scope": "admin"},
    )


@admin_bp.post("/categories")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def create_category():
    data, errors = validate_category_payload(request.get_json(silent=True), partial=False)
    if errors:
        return validation_error_response(errors)

    try:
        category = create_admin_category(data, actor=g.current_user)
    except AdminCategoryError as error:
        return admin_category_error_response(error)

    return success_response(
        data=serialize_admin_category(category, product_count=0),
        message="Category created.",
        status_code=201,
    )


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif"}


@admin_bp.post("/categories/upload-image")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def upload_category_image():
    file = request.files.get("image") or request.files.get("file")
    try:
        result = process_and_save_image(file, subfolder="categories", base_stem="category")
    except ImageUploadError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data={"image_url": result["image_url"], "filename": result["filename"]},
        message="Category image uploaded successfully.",
        status_code=201,
    )


@admin_bp.put("/categories/<slug>")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def update_category(slug):
    category = get_category_by_slug(slug)
    if category is None:
        return error_response(
            message="Category was not found.",
            status_code=404,
            code="category_not_found",
        )

    data, errors = validate_category_payload(request.get_json(silent=True), partial=True)
    if errors:
        return validation_error_response(errors)

    try:
        category = update_admin_category(category, data, actor=g.current_user)
    except AdminCategoryError as error:
        return admin_category_error_response(error)

    return success_response(
        data=serialize_admin_category(category, product_count=len(category.products)),
        message="Category updated.",
    )


@admin_bp.patch("/categories/<slug>/status")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def update_category_status(slug):
    category = get_category_by_slug(slug)
    if category is None:
        return error_response(
            message="Category was not found.",
            status_code=404,
            code="category_not_found",
        )

    data, errors = validate_category_status_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    category = update_admin_category_status(category, data["is_active"])
    return success_response(
        data=serialize_admin_category(category, product_count=len(category.products)),
        message="Category status updated.",
    )


@admin_bp.delete("/categories/<slug>")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def delete_category(slug):
    category = get_category_by_slug(slug)
    if category is None:
        return error_response(
            message="Category was not found.",
            status_code=404,
            code="category_not_found",
        )

    try:
        delete_admin_category(category, actor=g.current_user)
    except AdminCategoryError as error:
        return admin_category_error_response(error)

    return success_response(
        data={"slug": slug},
        message="Category deleted.",
    )


@admin_bp.get("/products")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def products():
    filters, errors = parse_admin_product_filters(request.args)
    if errors:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    products = list_admin_products(filters)
    return success_response(
        data=[serialize_admin_product(product) for product in products],
        meta={"count": len(products), "scope": "admin"},
    )


@admin_bp.post("/products")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def create_product():
    data, errors = validate_product_payload(request.get_json(silent=True), partial=False)
    if errors:
        return validation_error_response(errors)

    try:
        product = create_admin_product(g.current_user, data, actor=g.current_user)
    except AdminProductError as error:
        return admin_product_error_response(error)

    return success_response(
        data=serialize_admin_product(product),
        message="Product created.",
        status_code=201,
    )


@admin_bp.get("/products/<slug>")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def product_detail(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    return success_response(data=serialize_admin_product(product))


@admin_bp.put("/products/<slug>")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def update_product(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    data, errors = validate_product_payload(request.get_json(silent=True), partial=True)
    if errors:
        return validation_error_response(errors)

    try:
        product = update_admin_product(product, data, actor=g.current_user)
    except AdminProductError as error:
        return admin_product_error_response(error)

    return success_response(
        data=serialize_admin_product(product),
        message="Product updated.",
    )


@admin_bp.patch("/products/<slug>/status")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def update_product_status(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    data, errors = validate_product_status_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        product = update_admin_product_status(product, data["status"])
    except AdminProductError as error:
        return admin_product_error_response(error)

    return success_response(
        data=serialize_admin_product(product),
        message="Product status updated.",
    )


@admin_bp.patch("/products/<slug>/inventory")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def update_product_inventory(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    payload = request.get_json(silent=True)
    data, errors = validate_product_inventory_payload(payload)
    if errors:
        return validation_error_response(errors)

    reason = payload.get("reason") if isinstance(payload, dict) else None
    try:
        product = update_admin_product_quantity(
            product,
            data["quantity"],
            actor=g.current_user,
            reason=reason or "manual_adjustment",
        )
    except AdminProductError as error:
        return admin_product_error_response(error)

    return success_response(
        data=serialize_admin_product(product),
        message="Product inventory updated.",
    )


@admin_bp.get("/products/<slug>/movements")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def get_product_inventory_movements(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    movements = list_product_inventory_movements(product)
    return success_response(
        data={
            "product": {
                "id": product.id,
                "slug": product.slug,
                "title": product.title,
                "quantity": product.quantity,
                "status": product.status,
            },
            "movements": movements,
        },
        meta={"count": len(movements)},
    )


@admin_bp.post("/products/upload-image")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def upload_product_image():
    file = request.files.get("image") or request.files.get("file")
    try:
        result = process_and_save_image(file, subfolder="products", base_stem="product")
    except ImageUploadError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data={"image_url": result["image_url"], "filename": result["filename"]},
        message="Product image uploaded successfully.",
        status_code=201,
    )


@admin_bp.delete("/products/<slug>")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def delete_product(slug):
    product = get_admin_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    deleted_info, _ = delete_admin_product(product, actor=g.current_user)
    return success_response(
        data={"slug": deleted_info["slug"], "deleted": True},
        message="Product permanently deleted.",
    )


@admin_bp.post("/products/bulk")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def bulk_update_products():
    data, errors = validate_bulk_product_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        result = execute_bulk_product_action(
            slugs=data["slugs"],
            action=data["action"],
            status=data["status"],
            actor=g.current_user,
        )
    except AdminProductError as error:
        return admin_product_error_response(error)

    message = (
        f"Permanently deleted {result['deleted_count']} product(s)."
        if data["action"] == "delete"
        else f"Bulk action applied to {result['affected_count']} product(s)."
    )
    return success_response(
        data=result,
        message=message,
    )


@admin_bp.get("/reviews")
@roles_required(Role.ADMIN.value)
def admin_reviews():
    filters, errors = parse_review_filters(request.args)
    if errors:
        return validation_error_response(errors)

    reviews = list_admin_reviews(filters)
    return success_response(
        data=[serialize_review(review, include_admin_fields=True) for review in reviews],
        meta={"count": len(reviews), "scope": "admin"},
    )


@admin_bp.patch("/reviews/<int:review_id>/status")
@roles_required(Role.ADMIN.value)
def admin_update_review_status(review_id):
    data, errors = validate_review_status_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        review = update_admin_review_status(review_id, data["status"])
    except TrustError as error:
        return trust_error_response(error)

    return success_response(
        data=serialize_review(review, include_admin_fields=True),
        message="Review status updated.",
    )


@admin_bp.get("/reports")
@roles_required(Role.ADMIN.value)
def admin_reports():
    filters, errors = parse_report_filters(request.args)
    if errors:
        return validation_error_response(errors)

    reports = list_admin_product_reports(filters)
    return success_response(
        data=[serialize_product_report(report) for report in reports],
        meta={"count": len(reports), "scope": "admin"},
    )


@admin_bp.patch("/reports/<int:report_id>/status")
@roles_required(Role.ADMIN.value)
def admin_update_report_status(report_id):
    data, errors = validate_report_status_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        report = update_admin_product_report_status(report_id, data["status"], g.current_user)
    except TrustError as error:
        return trust_error_response(error)

    return success_response(
        data=serialize_product_report(report),
        message="Product report status updated.",
    )


@admin_bp.post("/products/import-csv")
@roles_required(Role.ADMIN.value, StaffRole.CATALOG_MANAGER.value)
def admin_import_products_csv():
    file = request.files.get("file") or request.files.get("csv")
    csv_text = None
    if file:
        csv_text = file.read()
    elif request.is_json:
        csv_text = (request.get_json(silent=True) or {}).get("csv_data")
    elif request.data:
        csv_text = request.data

    if not csv_text:
        return error_response(
            message="Please provide a CSV file or CSV text to import.",
            status_code=400,
            code="missing_csv_data",
        )

    from backend.app.admin.csv_import import CsvImportError, execute_csv_product_import
    try:
        summary = execute_csv_product_import(csv_text, g.current_user)
    except CsvImportError as exc:
        return error_response(
            message=exc.message,
            status_code=422,
            code="csv_import_error",
            details={"errors": exc.errors},
        )

    return success_response(
        data=summary,
        message=f"Successfully imported {summary['imported_count']} product(s).",
        status_code=201,
    )


@admin_bp.get("/search")
@roles_required(Role.ADMIN.value)
def admin_global_search():
    raw_q = (request.args.get("q") or "").strip()
    clean_q = raw_q.lstrip("#").strip()
    if len(clean_q) < 1:
        return success_response(
            data={"query": raw_q, "orders": [], "products": [], "customers": []},
            message="Empty search query.",
        )

    pattern = f"%{clean_q}%"
    orders = (
        Order.query.filter(
            db.or_(
                Order.order_number.ilike(pattern),
                Order.user.has(
                    db.or_(
                        User.email.ilike(pattern),
                        User.first_name.ilike(pattern),
                        User.last_name.ilike(pattern),
                    )
                ),
            )
        )
        .order_by(Order.placed_at.desc(), Order.id.desc())
        .limit(5)
        .all()
    )

    products = (
        Product.query.filter(
            db.or_(
                Product.title.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.brand.ilike(pattern),
                Product.slug.ilike(pattern),
            )
        )
        .order_by(Product.updated_at.desc(), Product.id.desc())
        .limit(5)
        .all()
    )

    customers = (
        User.query.filter(
            User.role == Role.BUYER.value,
            db.or_(
                User.email.ilike(pattern),
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
                User.phone.ilike(pattern),
            ),
        )
        .order_by(User.created_at.desc(), User.id.desc())
        .limit(5)
        .all()
    )

    return success_response(
        data={
            "query": clean_q,
            "orders": [
                {
                    "order_number": o.order_number,
                    "status": o.status,
                    "payment_status": o.payment_status,
                    "total": round((o.total_cents or 0) / 100, 2),
                    "buyer_name": f"{o.user.first_name} {o.user.last_name}".strip() if o.user else "Guest",
                    "buyer_email": o.user.email if o.user else "",
                }
                for o in orders
            ],
            "products": [
                {
                    "id": p.id,
                    "slug": p.slug,
                    "title": p.title,
                    "sku": p.sku,
                    "status": p.status,
                    "quantity": p.quantity,
                    "price": round((p.price_cents or 0) / 100, 2),
                }
                for p in products
            ],
            "customers": [
                {
                    "id": u.id,
                    "name": f"{u.first_name} {u.last_name}".strip(),
                    "email": u.email,
                    "status": u.status,
                }
                for u in customers
            ],
        },
        message="Global search results retrieved.",
    )


@admin_bp.get("/customers")
@roles_required(Role.ADMIN.value)
def admin_list_customers():
    filters = {
        "q": request.args.get("q", ""),
        "status": request.args.get("status", "all"),
        "sort": request.args.get("sort", "recent"),
        "page": request.args.get("page", 1),
        "per_page": request.args.get("per_page", 20),
    }
    return success_response(
        data=list_admin_customers(filters),
        message="Customers retrieved.",
    )


@admin_bp.get("/customers/<int:customer_id>")
@roles_required(Role.ADMIN.value)
def admin_customer_detail(customer_id):
    try:
        detail = get_admin_customer_detail(customer_id)
    except CustomerAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(data=detail, message="Customer details retrieved.")


@admin_bp.patch("/customers/<int:customer_id>/status")
@roles_required(Role.ADMIN.value)
def admin_update_customer_status(customer_id):
    payload = request.get_json(silent=True) or {}
    try:
        customer = update_admin_customer_status(customer_id, payload.get("status"), g.current_user)
    except CustomerAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(
        data=customer,
        message=f"Customer account status updated to {customer['status']}.",
    )


@admin_bp.post("/customers/<int:customer_id>/revoke-sessions")
@roles_required(Role.ADMIN.value)
def admin_revoke_customer_sessions(customer_id):
    try:
        result = revoke_admin_customer_sessions(customer_id, g.current_user)
    except CustomerAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(
        data=result,
        message=f"Revoked {result['revoked_count']} active session(s).",
    )


@admin_bp.get("/payments")
@roles_required(Role.ADMIN.value)
def admin_list_payments():
    filters = {
        "q": request.args.get("q", ""),
        "status": request.args.get("status", "all"),
        "method": request.args.get("method", "all"),
        "page": request.args.get("page", 1),
        "per_page": request.args.get("per_page", 25),
    }
    return success_response(data=list_admin_payments(filters), message="Payments retrieved.")


@admin_bp.post("/payments/<int:payment_id>/reconcile")
@roles_required(Role.ADMIN.value)
def admin_reconcile_payment(payment_id):
    try:
        payment = reconcile_admin_payment(payment_id)
    except PaymentAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(data=payment, message="Payment transaction reconciled.")


@admin_bp.post("/payments/<int:payment_id>/refund")
@roles_required(Role.ADMIN.value)
def admin_refund_payment(payment_id):
    payload = request.get_json(silent=True) or {}
    raw_amount = payload.get("amount")
    amount_cents = None
    if raw_amount is not None and raw_amount != "":
        try:
            amount_cents = int(round(float(raw_amount) * 100))
        except (TypeError, ValueError):
            return validation_error_response({"amount": ["Refund amount must be a valid number."]})

    reason = (payload.get("reason") or "requested_by_customer").strip()
    try:
        result = refund_admin_payment(payment_id, amount_cents=amount_cents, reason=reason, actor=g.current_user)
    except PaymentAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(
        data=result,
        message=f"Refund executed ({result.get('refund_id') or 'recorded'}).",
    )


@admin_bp.get("/settings")
@roles_required(Role.ADMIN.value)
def admin_get_settings():
    return success_response(data=get_store_config(), message="Store settings retrieved.")


@admin_bp.patch("/settings")
@roles_required(Role.ADMIN.value)
def admin_update_settings():
    payload = request.get_json(silent=True) or {}
    try:
        updated = update_store_config(payload, actor=g.current_user)
    except SettingsAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(data=updated, message="Store settings saved.")


@admin_bp.get("/staff")
@roles_required(Role.ADMIN.value)
def admin_list_staff():
    return success_response(data=list_staff_accounts(), message="Staff accounts retrieved.")


@admin_bp.post("/staff")
@roles_required(Role.ADMIN.value)
def admin_save_staff_member():
    payload = request.get_json(silent=True) or {}
    try:
        member = update_staff_role_or_create(payload, actor=g.current_user)
    except SettingsAdminError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)
    return success_response(data=member, message=f"Staff role saved for {member['email']}.")


@admin_bp.get("/audit-logs")
@roles_required(Role.ADMIN.value)
def admin_list_audit_logs():
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 30))))
    action_filter = request.args.get("action")
    return success_response(
        data=list_admin_audit_logs(page=page, per_page=per_page, action_filter=action_filter),
        message="Audit logs retrieved.",
    )


