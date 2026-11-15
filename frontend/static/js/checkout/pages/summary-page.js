(function () {
    const PAYMENT_METHOD_CATALOG = {
        cash_on_delivery: {
            title: "Cash On Delivery",
            description: "Pay cash directly to the courier upon physical delivery of your item.",
            nextStepNote: "Order will be confirmed immediately; payment remains pending until collected on delivery.",
        },
        gcash_pending: {
            title: "GCash Reference Pending",
            description: "Transfer the total via GCash and enter your transaction reference number to verify payment.",
            nextStepNote: "After placing the order, enter your GCash transaction reference to confirm payment.",
        },
        credit_debit_card: {
            title: "Credit / Debit Card (Stripe)",
            description: "Pay securely via Stripe Hosted Checkout using Visa, Mastercard, or Stripe Test Cards.",
            nextStepNote: "You will be redirected to Stripe's secure checkout page right after placing the order.",
        },
    };

    function formatPaymentMethodLabel(method) {
        if (!method) return "Cash On Delivery";
        return PAYMENT_METHOD_CATALOG[method]?.title
            || String(method).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function formatOrderDate(isoString) {
        if (!isoString) return "Just placed";
        const parsed = new Date(isoString);
        if (Number.isNaN(parsed.getTime())) return isoString;
        return parsed.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    function renderConfirmationPanel() {
        const confirmation = this.state.orderConfirmation;
        if (!confirmation || !confirmation.order) return "";

        const order = confirmation.order || {};
        const payment = confirmation.payment || {};
        const method = payment.method || order.payment_method || "cash_on_delivery";
        const status = payment.status || order.payment_status || "pending";
        const statusLabel = status === "paid"
            ? "Paid"
            : status === "failed"
                ? "Failed"
                : method === "cash_on_delivery"
                    ? "Pending Collection (COD)"
                    : "Pending Verification";
        const instructions = payment.intent?.instructions || "";
        const isPendingGcash = method === "gcash_pending" && status === "pending" && order.status !== "cancelled";
        const isPendingStripe = (method === "credit_debit_card" || method === "stripe")
            && status !== "paid"
            && status !== "refunded"
            && order.status !== "cancelled";
        const gcashMobile = this.state.user?.payment_preferences?.gcash_mobile || "";

        return `
            <div class="checkout-confirmation-panel" aria-live="polite">
                <span>Order Confirmed</span>
                <strong>${this.escapeHtml(order.order_number)}</strong>
                <p>Total: ${this.formatPrice(order.total)}</p>
                <div class="checkout-confirmation-payment">
                    <span class="checkout-payment-badge is-${this.escapeAttribute(status)}">${this.escapeHtml(statusLabel)}</span>
                    <small>${this.escapeHtml(formatPaymentMethodLabel(method))}</small>
                </div>
                ${payment.reference_number ? `<p class="checkout-confirmation-ref">Reference: <code>${this.escapeHtml(payment.reference_number)}</code></p>` : ""}
                ${isPendingStripe ? `
                    <div class="checkout-gcash-form">
                        <p class="checkout-gcash-note">${this.escapeHtml(instructions || "Complete your card payment securely on Stripe Checkout.")}</p>
                        <button type="button" class="checkout-primary-button" onclick="checkoutApp.payWithStripe('${this.escapeAttribute(order.order_number)}')" ${this.actionDisabledAttribute()}>
                            Pay with Stripe Checkout
                        </button>
                    </div>
                ` : ""}
                ${isPendingGcash ? `
                    <form class="checkout-gcash-form" onsubmit="checkoutApp.confirmOrderPayment(event, '${this.escapeAttribute(order.order_number)}')">
                        <p class="checkout-gcash-note">${this.escapeHtml(instructions || "Enter your GCash transaction reference number after transferring the order total.")}</p>
                        ${gcashMobile ? `<p class="checkout-gcash-note">Saved GCash mobile: <strong>${this.escapeHtml(gcashMobile)}</strong></p>` : ""}
                        <label class="checkout-gcash-input-group">
                            <input type="text" name="reference_number" placeholder="GCash Ref # (e.g. GCASH-123456)" maxlength="64" autocomplete="off">
                            <button type="submit" class="checkout-primary-button" ${this.actionDisabledAttribute()}>Confirm GCash Payment</button>
                        </label>
                    </form>
                ` : ""}
                <a href="/orders?order=${this.escapeAttribute(order.order_number)}" class="checkout-secondary-link">View Order</a>
            </div>
        `;
    }

    function renderConfirmationPage() {
        const confirmation = this.state.orderConfirmation;
        if (this.state.confirmationLoading) {
            return this.renderPageTemplate("confirmation", {
                confirmationHeading: "Loading Order Confirmation",
                confirmationBody: `
                    <section class="checkout-state-panel" aria-live="polite">
                        <h2>Retrieving Order Record</h2>
                        <p>Verifying your order details from the server...</p>
                    </section>
                `,
            });
        }

        if (!confirmation || !confirmation.order) {
            return this.renderPageTemplate("confirmation", {
                confirmationHeading: "Order Confirmation Unavailable",
                confirmationBody: `
                    <section class="checkout-state-panel" aria-live="polite">
                        <h2>We could not find that order confirmation</h2>
                        <p>${this.escapeHtml(this.state.confirmationError || "Open your customer order history to verify all placed orders.")}</p>
                        <div class="checkout-confirm-actions-row">
                            <a href="/orders" class="checkout-primary-button">View Order History</a>
                            <a href="/" class="checkout-secondary-link">Browse Marketplace</a>
                        </div>
                    </section>
                `,
            });
        }

        const order = confirmation.order || {};
        const items = confirmation.items || order.items || [];
        const payment = confirmation.payment || {};
        const shipping = confirmation.shipping_address || order.shipping_record || null;
        const method = payment.method || "cash_on_delivery";
        const payStatus = payment.status || order.payment_status || "pending";
        const isCancelled = order.status === "cancelled";
        const isPendingGcash = !isCancelled && method === "gcash_pending" && payStatus === "pending";
        const isPendingStripe = !isCancelled
            && (method === "credit_debit_card" || method === "stripe")
            && payStatus !== "paid"
            && payStatus !== "refunded";
        const gcashMobile = this.state.user?.payment_preferences?.gcash_mobile || "";
        const instructions = payment.intent?.instructions
            || "Transfer the exact order total via GCash, then enter your GCash reference number below to mark this payment verified.";
        const payStatusText = payStatus === "paid"
            ? "Paid"
            : payStatus === "failed"
                ? "Payment Failed"
                : payStatus === "refunded"
                    ? "Refunded"
                    : method === "cash_on_delivery"
                        ? "Pending Collection (COD)"
                        : "Pending Payment Verification";
        const discountAmt = Number(order.discount?.amount || 0);

        const itemsHtml = items.map((item) => `
            <div class="checkout-confirm-item">
                <div>
                    <strong>${this.escapeHtml(item.product_title)}</strong>
                    <span>Qty ${this.escapeHtml(item.quantity)} &times; ${this.formatPrice(item.unit_price)}</span>
                </div>
                <strong>${this.formatPrice(item.line_total)}</strong>
            </div>
        `).join("");

        const shippingHtml = shipping
            ? `
                <p class="checkout-confirm-address">
                    <strong>${this.escapeHtml(shipping.recipient_name)}</strong><br>
                    ${this.escapeHtml(shipping.phone)}<br>
                    ${this.escapeHtml(shipping.address_line1)}${shipping.address_line2 ? `, ${this.escapeHtml(shipping.address_line2)}` : ""}<br>
                    ${this.escapeHtml(shipping.city)}, ${this.escapeHtml(shipping.province)} ${this.escapeHtml(shipping.postal_code)}<br>
                    ${this.escapeHtml(shipping.country || "Philippines")}
                </p>
            `
            : `<p class="checkout-confirm-address">Shipping record pending.</p>`;

        const bodyHtml = `
            <div class="checkout-confirm-banner ${isCancelled ? "is-cancelled" : ""}" role="status" aria-live="polite">
                <div class="checkout-confirm-banner-main">
                    <span class="checkout-confirm-pill">${this.escapeHtml(isCancelled ? "Order Cancelled" : "Order Placed")}</span>
                    <h2>Order #${this.escapeHtml(order.order_number)}</h2>
                    <p>Placed on ${this.escapeHtml(formatOrderDate(order.placed_at))}</p>
                </div>
                <div class="checkout-confirm-banner-badges">
                    <div>
                        <span>Order Status</span>
                        <strong>${this.escapeHtml(String(order.status || "confirmed").toUpperCase())}</strong>
                    </div>
                    <div>
                        <span>Payment Status</span>
                        <strong>${this.escapeHtml(payStatusText)}</strong>
                    </div>
                </div>
            </div>

            <div class="checkout-layout">
                <div class="checkout-confirm-main-col">
                    <section class="checkout-panel">
                        <div class="checkout-panel-header">
                            <h2>Items Ordered (${items.length})</h2>
                        </div>
                        <div class="checkout-confirm-items-list">
                            ${itemsHtml}
                        </div>
                    </section>

                    <div class="checkout-confirm-meta-grid">
                        <section class="checkout-panel checkout-confirm-card-pad">
                            <h3>Delivery Address</h3>
                            ${shippingHtml}
                        </section>

                        <section class="checkout-panel checkout-confirm-card-pad">
                            <h3>Payment Details</h3>
                            <p class="checkout-confirm-address">
                                <strong>Method:</strong> ${this.escapeHtml(formatPaymentMethodLabel(method))}<br>
                                <strong>Status:</strong> <span class="checkout-payment-badge is-${this.escapeAttribute(payStatus)}">${this.escapeHtml(payStatusText)}</span><br>
                                ${payment.reference_number ? `<strong>Reference:</strong> <code>${this.escapeHtml(payment.reference_number)}</code>` : ""}
                            </p>
                        </section>
                    </div>

                    ${isPendingStripe ? `
                        <section class="checkout-panel checkout-confirm-card-pad" aria-label="Complete card payment via Stripe">
                            <h3>${payStatus === "failed" ? "Retry Card Payment via Stripe" : "Complete Card Payment via Stripe"}</h3>
                            <p class="checkout-gcash-note">
                                ${this.state.stripeCancelled
                                    ? "Your previous Stripe Checkout session was cancelled before payment completed. Click below to finish paying securely by card."
                                    : this.escapeHtml(payment.intent?.instructions || "Proceed to Stripe's hosted test checkout page to pay securely by card.")}
                            </p>
                            <div class="checkout-confirm-actions-row">
                                <button type="button" class="checkout-primary-button" onclick="checkoutApp.payWithStripe('${this.escapeAttribute(order.order_number)}')" ${this.actionDisabledAttribute()}>
                                    Pay with Stripe Checkout
                                </button>
                            </div>
                        </section>
                    ` : ""}

                    ${isPendingGcash ? `
                        <section class="checkout-panel checkout-confirm-card-pad" aria-label="Complete GCash payment">
                            <h3>Complete GCash Payment</h3>
                            <p class="checkout-gcash-note">${this.escapeHtml(instructions)}</p>
                            ${gcashMobile ? `<p class="checkout-gcash-note">Saved GCash mobile: <strong>${this.escapeHtml(gcashMobile)}</strong></p>` : ""}
                            <form class="checkout-gcash-inline-form" onsubmit="checkoutApp.confirmOrderPayment(event, '${this.escapeAttribute(order.order_number)}')">
                                <input type="text" name="reference_number" placeholder="Enter GCash Ref # (or leave blank to generate sandbox ref)" maxlength="64" autocomplete="off">
                                <button type="submit" class="checkout-primary-button" ${this.actionDisabledAttribute()}>Confirm GCash Payment</button>
                            </form>
                        </section>
                    ` : ""}
                </div>

                <aside class="checkout-summary-card" aria-label="Confirmed totals">
                    <p class="checkout-eyebrow">Payment Summary</p>
                    <div class="checkout-summary-breakdown">
                        <div class="checkout-summary-row">
                            <span>Subtotal</span>
                            <strong>${this.formatPrice(order.subtotal)}</strong>
                        </div>
                        ${discountAmt > 0 ? `
                            <div class="checkout-summary-row checkout-summary-discount">
                                <span>Discount${order.coupon_code ? ` (${this.escapeHtml(order.coupon_code)})` : ""}</span>
                                <span>-${this.formatPrice(order.discount)}</span>
                            </div>
                        ` : ""}
                        <div class="checkout-summary-row">
                            <span>Shipping</span>
                            <span>${Number(order.shipping?.amount || 0) === 0 ? "Complimentary" : this.formatPrice(order.shipping)}</span>
                        </div>
                        <div class="checkout-summary-row checkout-summary-total">
                            <span>Total</span>
                            <strong>${this.formatPrice(order.total)}</strong>
                        </div>
                    </div>
                    <a href="/orders?order=${this.escapeAttribute(order.order_number)}" class="checkout-primary-button">View Order Details</a>
                    <a href="/" class="checkout-secondary-link">Continue Shopping</a>
                </aside>
            </div>
        `;

        return this.renderPageTemplate("confirmation", {
            confirmationHeading: isPendingGcash
                ? "Order Placed — Complete Payment"
                : "Order Placed Successfully",
            confirmationBody: bodyHtml,
        });
    }

    function renderSavedAddressesSelector() {
        const addresses = this.state.addresses || [];
        if (!addresses.length) {
            return `
                <div class="checkout-field checkout-field-wide checkout-saved-address-banner">
                    <span>No saved delivery addresses yet. Enter your delivery details below or <a href="/profile?tab=addresses">save addresses in your profile</a>.</span>
                </div>
            `;
        }

        const selectedId = this.state.selectedAddressId;
        return `
            <div class="checkout-field checkout-field-wide checkout-saved-addresses" aria-label="Saved delivery addresses">
                <div class="checkout-saved-addresses__header">
                    <span>Select Delivery Address</span>
                </div>
                <div class="checkout-address-pills">
                    ${addresses.map((addr) => {
                        const isSelected = selectedId !== null && Number(selectedId) === Number(addr.id);
                        return `
                            <button
                                type="button"
                                onclick="checkoutApp.selectSavedAddress(${addr.id})"
                                class="checkout-address-pill ${isSelected ? "is-active" : ""}"
                                aria-pressed="${isSelected ? "true" : "false"}"
                            >
                                <strong>${this.escapeHtml(addr.label || "Home")}${addr.is_default ? " (Default)" : ""}</strong>
                                <span>${this.escapeHtml(addr.recipient_name)} &bull; ${this.escapeHtml(addr.city)}</span>
                                <small>${this.escapeHtml(addr.street_line1 || addr.address_line1 || "")}</small>
                            </button>
                        `;
                    }).join("")}
                    <button
                        type="button"
                        onclick="checkoutApp.selectSavedAddress(null)"
                        class="checkout-address-pill ${selectedId === null ? "is-active" : ""}"
                        aria-pressed="${selectedId === null ? "true" : "false"}"
                    >
                        <strong>+ Custom Address</strong>
                        <span>Enter manually below</span>
                    </button>
                </div>
            </div>
        `;
    }

    function renderSaveAddressToggle() {
        if (this.state.selectedAddressId !== null) {
            return "";
        }
        return `
            <label class="checkout-checkbox-field checkout-field-wide">
                <input type="checkbox" name="save_address" value="1">
                <span>Save this delivery address to my SecondMarket address book</span>
            </label>
        `;
    }

    function getEnabledPaymentMethods() {
        const supported = ["cash_on_delivery", "gcash_pending", "credit_debit_card"];
        const enabledRaw = this.state.user?.payment_preferences?.enabled_methods;
        const enabled = Array.isArray(enabledRaw)
            ? enabledRaw.filter((item) => supported.includes(item))
            : [];
        return enabled.length ? enabled : supported;
    }

    function getActivePaymentMethod() {
        const optionsList = getEnabledPaymentMethods.call(this);
        const draftChoice = this.state.draftForm?.payment_method || this.state.selectedPaymentMethod;
        if (draftChoice && optionsList.includes(draftChoice)) {
            return draftChoice;
        }
        if (this.state.preferredPaymentMethod && optionsList.includes(this.state.preferredPaymentMethod)) {
            return this.state.preferredPaymentMethod;
        }
        return optionsList[0];
    }

    function renderPaymentMethodOptions() {
        const optionsList = getEnabledPaymentMethods.call(this);
        const activeMethod = getActivePaymentMethod.call(this);
        const preferred = this.state.preferredPaymentMethod;

        return optionsList.map((method) => {
            const meta = PAYMENT_METHOD_CATALOG[method] || {
                title: formatPaymentMethodLabel(method),
                description: "",
            };
            const isChecked = method === activeMethod;
            const isPreferred = method === preferred;
            return `
                <label class="checkout-payment-card ${isChecked ? "is-selected" : ""}">
                    <input
                        type="radio"
                        name="payment_method"
                        value="${this.escapeAttribute(method)}"
                        ${isChecked ? "checked" : ""}
                        onchange="checkoutApp.selectPaymentMethod('${this.escapeAttribute(method)}')"
                    >
                    <div class="checkout-payment-card-body">
                        <div class="checkout-payment-card-top">
                            <strong>${this.escapeHtml(meta.title)}</strong>
                            ${isPreferred ? `<span class="checkout-mini-pill">Saved Default</span>` : ""}
                            ${method === "credit_debit_card" && this.state.stripeConfigured === false
                                ? `<span class="checkout-mini-pill">Needs Stripe Key</span>`
                                : ""}
                        </div>
                        <p>${this.escapeHtml(meta.description)}</p>
                    </div>
                </label>
            `;
        }).join("");
    }

    function renderPaymentMethodHint() {
        const gcashMobile = this.state.user?.payment_preferences?.gcash_mobile;
        if (gcashMobile) {
            return `<small class="checkout-field-hint">Saved GCash number: ${this.escapeHtml(gcashMobile)}. No separate billing address is required.</small>`;
        }
        return `<small class="checkout-field-hint">Only verified storefront payment methods are shown. No separate billing address is required.</small>`;
    }

    function renderSummaryItems(items) {
        if (!items.length) {
            return `<p class="checkout-summary-note">Your bag is currently empty.</p>`;
        }
        return items.map((item) => `
            <div class="checkout-summary-item">
                <div class="checkout-summary-item-info">
                    <strong>${this.escapeHtml(item.product.title)}</strong>
                    <span>Qty ${this.escapeHtml(item.quantity)} &times; ${this.formatPrice(item.unit_price)}</span>
                </div>
                <strong>${this.formatPrice(item.line_total)}</strong>
            </div>
        `).join("");
    }

    function renderCouponSection(hasItems) {
        if (!hasItems) return "";

        const applied = this.state.appliedCoupon;
        if (applied) {
            return `
                <div class="checkout-coupon-applied">
                    <div>
                        <strong>${this.escapeHtml(applied.code)}</strong>
                        <span>-${this.formatPrice(applied.discount_amount || 0)}</span>
                    </div>
                    <button type="button" class="checkout-coupon-remove" onclick="checkoutApp.removeCouponCode()" ${this.actionDisabledAttribute()}>Remove</button>
                </div>
            `;
        }

        return `
            <form class="checkout-coupon-form" onsubmit="checkoutApp.applyCouponCode(event)">
                <label class="sr-only" for="checkout-coupon-input">Promo or coupon code</label>
                <input
                    id="checkout-coupon-input"
                    type="text"
                    name="coupon_code"
                    value="${this.escapeAttribute(this.state.couponInput || "")}"
                    placeholder="Promo or coupon code"
                    maxlength="40"
                    autocomplete="off"
                >
                <button type="submit" class="checkout-secondary-button" ${this.actionDisabledAttribute()}>Apply</button>
            </form>
        `;
    }

    function renderSummaryPage() {
        const cart = this.state.cart || { items: [], total_items: 0, subtotal: { amount: 0 } };
        const items = cart.items || [];
        const hasItems = items.length > 0;
        const hasStockIssue = Boolean(cart.has_unavailable_items || items.some((i) => i.has_stock_issue));
        const subtotalAmount = typeof cart.subtotal === "object" && cart.subtotal !== null ? Number(cart.subtotal.amount || 0) : Number(cart.subtotal || 0);
        const rawDiscount = hasItems && this.state.appliedCoupon ? Number(this.state.appliedCoupon.discount_amount || 0) : 0;
        const discountAmount = Math.min(subtotalAmount, Math.max(0, rawDiscount));
        const shippingAmount = hasItems ? (subtotalAmount >= 3000 ? 0 : 45) : 0;
        const shippingLabel = hasItems ? (shippingAmount === 0 ? "Complimentary" : this.formatPrice(shippingAmount)) : "—";
        const orderTotal = hasItems
            ? this.formatPrice(Math.max(0, subtotalAmount - discountAmount) + shippingAmount)
            : this.formatPrice(0);
        const discountRow = discountAmount > 0
            ? `
                <div class="checkout-summary-row checkout-summary-discount">
                    <span>Discount (${this.escapeHtml(this.state.appliedCoupon.code)})</span>
                    <span>-${this.formatPrice(discountAmount)}</span>
                </div>
            `
            : "";

        const activeMethod = getActivePaymentMethod.call(this);
        const paymentNextStepNote = PAYMENT_METHOD_CATALOG[activeMethod]?.nextStepNote
            || "Totals verified authoritatively before confirmation.";
        const summaryAlertBanner = hasStockIssue
            ? `
                <div class="checkout-inline-alert is-warning" role="alert">
                    <strong>Inventory Update:</strong> An item in your bag is out of stock or exceeds available units. <button type="button" class="checkout-inline-link-btn" onclick="checkoutApp.navigate('cart')">Return to Cart</button> to resolve it.
                </div>
            `
            : "";

        return this.renderPageTemplate("summary", {
            cartStatus: this.renderCartStatus(),
            summaryAlertBanner,
            savedAddressesSelector: renderSavedAddressesSelector.call(this),
            saveAddressToggle: renderSaveAddressToggle.call(this),
            paymentMethodOptions: renderPaymentMethodOptions.call(this),
            paymentMethodHint: renderPaymentMethodHint.call(this),
            summaryItems: renderSummaryItems.call(this, items),
            couponSection: renderCouponSection.call(this, hasItems),
            discountRow,
            cartTotalItems: cart.total_items || 0,
            cartSubtotal: this.formatPrice(cart.subtotal),
            shippingLabel,
            orderTotal,
            paymentNextStepNote,
            placeOrderLabel: this.state.submittingOrder ? "Placing Order..." : "Place Order",
            checkoutDisabled: hasItems && !hasStockIssue && !this.state.actionLoading && !this.state.submittingOrder ? "" : "disabled",
            confirmationPanel: renderConfirmationPanel.call(this),
        });
    }

    window.SecondMarketCheckoutPages = window.SecondMarketCheckoutPages || {};
    window.SecondMarketCheckoutPages.renderSummaryPage = renderSummaryPage;
    window.SecondMarketCheckoutPages.renderConfirmationPanel = renderConfirmationPanel;
    window.SecondMarketCheckoutPages.renderConfirmationPage = renderConfirmationPage;
})();
