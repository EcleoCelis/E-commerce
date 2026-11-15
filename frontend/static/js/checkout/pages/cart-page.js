(function () {
    function renderAvailabilityTag(item) {
        const available = item.is_available !== false;
        const maxQty = Number(item.max_quantity || 0);
        if (!available || maxQty <= 0) {
            return `<span class="checkout-item-tag is-danger">Unavailable &bull; Remove before checkout</span>`;
        }
        if (item.quantity > maxQty) {
            return `<span class="checkout-item-tag is-danger">Only ${maxQty} in stock &bull; Adjust qty</span>`;
        }
        if (maxQty <= 2) {
            return `<span class="checkout-item-tag is-warning">Low stock &bull; ${maxQty} available</span>`;
        }
        return `<span class="checkout-item-tag is-ok">In stock</span>`;
    }

    function formatConditionLabel(condition) {
        const map = {
            new_other: "New Other",
            like_new: "Like New",
            good: "Good",
            fair: "Fair",
            for_repair: "For Repair",
        };
        const raw = String(condition || "good").toLowerCase();
        return map[raw] || raw.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function renderCartItem(item) {
        const imageUrl = item.product.primary_image?.url || "/static/productImages/bags/young-girl-with-gray-student-backpack.jpg";
        const imageAlt = item.product.primary_image?.alt_text || item.product.title;
        const disabled = this.actionDisabledAttribute();
        const slugAttr = this.escapeAttribute(item.product.slug);
        const maxQty = Math.max(1, Number(item.max_quantity || 1));
        const canDecrease = item.quantity > 1 && !this.state.actionLoading;
        const canIncrease = item.is_available !== false && item.quantity < maxQty && !this.state.actionLoading;
        const pdpUrl = `/?view=pdp&id=${encodeURIComponent(item.product.slug)}`;

        return `
            <article class="checkout-cart-item ${item.has_stock_issue ? "has-issue" : ""}">
                <a href="${pdpUrl}" class="checkout-cart-thumb-link">
                    <img src="${this.escapeAttribute(imageUrl)}" alt="${this.escapeAttribute(imageAlt)}" class="checkout-cart-thumb">
                </a>
                <div class="checkout-cart-info">
                    <h2><a href="${pdpUrl}">${this.escapeHtml(item.product.title)}</a></h2>
                    <p>${this.escapeHtml(item.product.category?.name || "Secondhand item")} &bull; ${this.escapeHtml(formatConditionLabel(item.product.condition))}</p>
                    <p class="checkout-cart-unit-price">Unit price: ${this.formatPrice(item.unit_price)}</p>
                    ${renderAvailabilityTag(item)}
                </div>
                <div class="checkout-cart-meta">
                    <strong class="checkout-cart-line-total">${this.formatPrice(item.line_total)}</strong>
                    <form class="checkout-quantity-form" onsubmit="checkoutApp.updateCartItemQuantity(event, '${slugAttr}')">
                        <div class="checkout-stepper" role="group" aria-label="Quantity for ${this.escapeAttribute(item.product.title)}">
                            <button
                                data-checkout-action
                                type="button"
                                class="checkout-stepper-btn"
                                onclick="checkoutApp.changeCartItemQuantity('${slugAttr}', ${item.quantity - 1})"
                                ${canDecrease ? "" : "disabled"}
                                aria-label="Decrease quantity"
                            >&minus;</button>
                            <input
                                data-checkout-action
                                name="quantity"
                                type="number"
                                min="1"
                                max="${maxQty}"
                                step="1"
                                value="${item.quantity}"
                                aria-label="Quantity"
                                onchange="this.form.requestSubmit()"
                                ${disabled}
                            >
                            <button
                                data-checkout-action
                                type="button"
                                class="checkout-stepper-btn"
                                onclick="checkoutApp.changeCartItemQuantity('${slugAttr}', ${item.quantity + 1})"
                                ${canIncrease ? "" : "disabled"}
                                aria-label="Increase quantity"
                            >+</button>
                        </div>
                        <button data-checkout-action type="submit" class="checkout-qty-apply-btn" ${disabled}>Update</button>
                    </form>
                    <button data-checkout-action type="button" class="checkout-remove-button" onclick="checkoutApp.removeCartItem('${slugAttr}')" ${disabled}>Remove</button>
                </div>
            </article>
        `;
    }

    function renderCartPage() {
        const cart = this.state.cart || { items: [], total_items: 0, subtotal: { amount: 0 } };
        const items = cart.items || [];
        const hasStockIssue = Boolean(cart.has_unavailable_items || items.some((i) => i.has_stock_issue));
        const cartItems = items.map((item) => renderCartItem.call(this, item)).join("") || `
            <div class="checkout-empty-state">
                <h2>Your cart is empty</h2>
                <p>Add a secondhand item from the marketplace before checking out.</p>
                <a href="/" class="checkout-primary-button">Browse Marketplace</a>
            </div>
        `;

        const subtotalAmount = typeof cart.subtotal === "object" && cart.subtotal !== null ? Number(cart.subtotal.amount || 0) : Number(cart.subtotal || 0);
        const shippingAmount = items.length === 0 ? 0 : (subtotalAmount >= 3000 ? 0 : 45);
        const shippingLabel = items.length === 0 ? "—" : (shippingAmount === 0 ? "Complimentary" : this.formatPrice(shippingAmount));
        const estimatedTotal = items.length === 0 ? this.formatPrice(0) : this.formatPrice(subtotalAmount + shippingAmount);
        const remainingForFreeShipping = Math.max(0, 3000 - subtotalAmount);
        const shippingProgressNote = items.length === 0
            ? "Add items to preview shipping and totals."
            : shippingAmount === 0
                ? `${cart.total_items || 0} item(s). Complimentary express delivery unlocked.`
                : `${cart.total_items || 0} item(s). Add ${this.formatPrice(remainingForFreeShipping)} more for complimentary shipping.`;
        const cartAlertBanner = hasStockIssue
            ? `
                <div class="checkout-inline-alert is-warning" role="alert">
                    <strong>Action Needed Before Checkout:</strong> One or more items in your bag changed availability or exceed current stock. Remove or adjust highlighted items to proceed.
                </div>
            `
            : "";

        return this.renderPageTemplate("cart", {
            cartStatus: this.renderCartStatus(),
            cartAlertBanner,
            cartItems,
            cartItemCount: items.length,
            cartTotalItems: cart.total_items || 0,
            cartSubtotal: this.formatPrice(cart.subtotal),
            cartShippingEstimate: shippingLabel,
            cartEstimatedTotal: estimatedTotal,
            shippingProgressNote,
            checkoutDisabled: items.length > 0 && !hasStockIssue && !this.state.actionLoading ? "" : "disabled",
        });
    }

    window.SecondMarketCheckoutPages = window.SecondMarketCheckoutPages || {};
    window.SecondMarketCheckoutPages.renderCartPage = renderCartPage;
})();
