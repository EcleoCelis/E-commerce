from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from backend.app.extensions import db
from backend.app.models import Cart, CartItem, CartStatus, Product


class CartError(Exception):
    def __init__(self, message, status_code=400, code="cart_error", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


def sync_cart_item_prices(cart):
    """Synchronize active cart item unit prices with live product prices.

    Returns a list of dicts describing any items whose price changed since being added.
    """
    changes = []
    dirty = False
    for item in cart.items:
        product = item.product
        if product is None:
            continue
        if item.unit_price_cents != product.price_cents:
            changes.append({
                "product_slug": product.slug,
                "product_title": product.title,
                "previous_price_cents": item.unit_price_cents,
                "current_price_cents": product.price_cents,
            })
            item.unit_price_cents = product.price_cents
            dirty = True

    if dirty:
        db.session.commit()

    return changes


def get_or_create_active_cart(user):
    cart = (
        Cart.query.options(
            selectinload(Cart.items).selectinload(CartItem.product),
            selectinload(Cart.items).selectinload(CartItem.product).selectinload(Product.category),
            selectinload(Cart.items).selectinload(CartItem.product).selectinload(Product.images),
        )
        .filter_by(user_id=user.id, status=CartStatus.ACTIVE.value)
        .order_by(Cart.created_at.desc(), Cart.id.desc())
        .first()
    )

    if cart is not None:
        sync_cart_item_prices(cart)
        return cart

    cart = Cart(user=user, status=CartStatus.ACTIVE.value)
    db.session.add(cart)
    db.session.commit()
    return cart


def get_product_for_cart(product_slug):
    return (
        Product.query.options(
            selectinload(Product.category),
            selectinload(Product.images),
        )
        .filter_by(slug=product_slug)
        .one_or_none()
    )


def find_cart_item(cart, product):
    return next((item for item in cart.items if item.product_id == product.id), None)


def ensure_product_can_be_purchased(product, requested_quantity):
    if product is None:
        raise CartError(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    is_category_active = product.category is not None and bool(product.category.is_active)
    if not product.is_available or not is_category_active:
        raise CartError(
            message="Product is not available for checkout.",
            status_code=409,
            code="product_unavailable",
            details={"product_slug": [product.slug]},
        )

    if requested_quantity > product.quantity:
        raise CartError(
            message="Requested quantity is not available.",
            status_code=409,
            code="insufficient_stock",
            details={"quantity": [f"Only {product.quantity} item(s) are available."]},
        )


def add_cart_item(user, product_slug, quantity):
    cart = get_or_create_active_cart(user)
    product = get_product_for_cart(product_slug)
    ensure_product_can_be_purchased(product, quantity)

    item = find_cart_item(cart, product)
    if item is None:
        item = CartItem(
            cart=cart,
            product=product,
            quantity=quantity,
            unit_price_cents=product.price_cents,
        )
        db.session.add(item)
    else:
        next_quantity = item.quantity + quantity
        ensure_product_can_be_purchased(product, next_quantity)
        item.quantity = next_quantity

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        cart = get_or_create_active_cart(user)
        product = get_product_for_cart(product_slug)
        item = find_cart_item(cart, product)
        if item is None:
            raise
        next_quantity = item.quantity + quantity
        ensure_product_can_be_purchased(product, next_quantity)
        item.quantity = next_quantity
        db.session.commit()
    return cart


def update_cart_item_quantity(user, product_slug, quantity):
    cart = get_or_create_active_cart(user)
    product = get_product_for_cart(product_slug)
    ensure_product_can_be_purchased(product, quantity)

    item = find_cart_item(cart, product)
    if item is None:
        raise CartError(
            message="Product is not in your cart.",
            status_code=404,
            code="cart_item_not_found",
        )

    item.quantity = quantity
    db.session.commit()
    return cart


def remove_cart_item(user, product_slug):
    cart = get_or_create_active_cart(user)
    product = get_product_for_cart(product_slug)
    if product is None:
        raise CartError(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    item = find_cart_item(cart, product)
    if item is None:
        raise CartError(
            message="Product is not in your cart.",
            status_code=404,
            code="cart_item_not_found",
        )

    db.session.delete(item)
    db.session.commit()
    return cart
