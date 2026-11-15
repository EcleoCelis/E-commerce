import csv
import io
import re
from backend.app.admin.service import AdminProductError
from backend.app.extensions import db
from backend.app.models import Category, Product, ProductCondition, ProductStatus


class CsvImportError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or []


def sanitize_formula_injection(value: str) -> str:
    """Protect against spreadsheet formula injection (=, +, -, @, tab, cr)."""
    if not value or not isinstance(value, str):
        return value
    cleaned = value.strip()
    if cleaned and cleaned[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + cleaned
    return cleaned


def parse_and_validate_csv_products(file_or_text, admin_user):
    if isinstance(file_or_text, (bytes, bytearray)):
        file_or_text = file_or_text.decode("utf-8-sig", errors="replace")

    if isinstance(file_or_text, str):
        stream = io.StringIO(file_or_text)
    else:
        # FileStorage or binary stream
        raw = file_or_text.read()
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8-sig", errors="replace")
        stream = io.StringIO(raw)

    reader = csv.reader(stream)
    rows = list(reader)
    if not rows:
        raise CsvImportError("The CSV file is completely empty.")

    header = [h.strip().lower() for h in rows[0]]
    if len(header) < 2:
        raise CsvImportError("CSV header must contain at least Title and Price columns.")

    def find_col(aliases):
        for alias in aliases:
            for idx, h in enumerate(header):
                if alias in h:
                    return idx
        return -1

    title_idx = find_col(["title", "name", "product"])
    sku_idx = find_col(["sku", "item_code"])
    cat_idx = find_col(["category"])
    cond_idx = find_col(["condition"])
    price_idx = find_col(["price", "unit_price"])
    qty_idx = find_col(["quantity", "qty", "stock"])
    desc_idx = find_col(["description", "desc"])
    status_idx = find_col(["status"])

    if title_idx == -1:
        raise CsvImportError("Missing required 'Title' column in CSV header.")
    if price_idx == -1:
        raise CsvImportError("Missing required 'Price' column in CSV header.")

    categories = {c.slug: c for c in Category.query.all()}
    categories_by_name = {c.name.lower(): c for c in Category.query.all()}
    default_category = next(iter(categories.values()), None) if categories else None

    allowed_conditions = {
        "new": ProductCondition.NEW_OTHER.value,
        "new other": ProductCondition.NEW_OTHER.value,
        "brand new": ProductCondition.NEW_OTHER.value,
        "new_other": ProductCondition.NEW_OTHER.value,
        "like new": ProductCondition.LIKE_NEW.value,
        "like_new": ProductCondition.LIKE_NEW.value,
        "good": ProductCondition.GOOD.value,
        "lightly used": ProductCondition.GOOD.value,
        "fair": ProductCondition.FAIR.value,
        "well used": ProductCondition.FAIR.value,
        "for repair": ProductCondition.FOR_REPAIR.value,
        "for_repair": ProductCondition.FOR_REPAIR.value,
    }

    products_to_create = []
    errors = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if not row or not any(field.strip() for field in row):
            continue

        raw_title = row[title_idx].strip() if title_idx < len(row) else ""
        if not raw_title:
            errors.append(f"Row {row_idx}: Title cannot be empty.")
            continue

        title = sanitize_formula_injection(raw_title)

        # Price parsing
        raw_price = row[price_idx].strip() if price_idx < len(row) else ""
        try:
            # Clean currency symbols
            price_val = float(re.sub(r"[^\d.]", "", raw_price))
            if price_val <= 0:
                raise ValueError()
            price_cents = int(round(price_val * 100))
        except Exception:
            errors.append(f"Row {row_idx}: Invalid price '{raw_price}'. Must be a positive number.")
            continue

        # Quantity parsing
        raw_qty = row[qty_idx].strip() if qty_idx != -1 and qty_idx < len(row) else "1"
        try:
            quantity = max(0, int(re.sub(r"[^\d]", "", raw_qty) or "1"))
        except Exception:
            quantity = 1

        # Category parsing
        raw_cat = row[cat_idx].strip().lower() if cat_idx != -1 and cat_idx < len(row) else ""
        matched_cat = categories.get(raw_cat) or categories_by_name.get(raw_cat) or default_category

        # Condition parsing
        raw_cond = row[cond_idx].strip().lower() if cond_idx != -1 and cond_idx < len(row) else "good"
        condition = allowed_conditions.get(raw_cond, ProductCondition.GOOD.value)

        # SKU & Slug
        raw_sku = row[sku_idx].strip() if sku_idx != -1 and sku_idx < len(row) else ""
        sku = sanitize_formula_injection(raw_sku) or None

        slug_base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "item"
        import secrets
        slug = f"{slug_base}-{secrets.token_hex(3)}"

        # Status
        raw_status = row[status_idx].strip().lower() if status_idx != -1 and status_idx < len(row) else "available"
        status = ProductStatus.AVAILABLE.value if raw_status in ("available", "active") else ProductStatus.DRAFT.value

        # Description
        raw_desc = row[desc_idx].strip() if desc_idx != -1 and desc_idx < len(row) else ""
        description = sanitize_formula_injection(raw_desc) or f"Secondhand {title} in {condition} condition."

        products_to_create.append({
            "title": title,
            "slug": slug,
            "sku": sku,
            "price_cents": price_cents,
            "quantity": quantity,
            "category_id": matched_cat.id if matched_cat else None,
            "condition": condition,
            "status": status,
            "description": description,
            "seller_id": admin_user.id,
        })

    return products_to_create, errors


def execute_csv_product_import(file_or_text, admin_user):
    products_data, errors = parse_and_validate_csv_products(file_or_text, admin_user)
    if not products_data and errors:
        raise CsvImportError("Failed to import products due to validation errors.", errors=errors)

    imported = []
    try:
        for pdata in products_data:
            product = Product(
                title=pdata["title"],
                slug=pdata["slug"],
                sku=pdata["sku"],
                price_cents=pdata["price_cents"],
                quantity=pdata["quantity"],
                category_id=pdata["category_id"],
                condition=pdata["condition"],
                status=pdata["status"],
                description=pdata["description"],
                seller_id=pdata["seller_id"],
            )
            db.session.add(product)
            imported.append(product)

        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        raise CsvImportError(f"Database error during batch import: {exc}")

    return {
        "imported_count": len(imported),
        "failed_count": len(errors),
        "errors": errors,
    }
