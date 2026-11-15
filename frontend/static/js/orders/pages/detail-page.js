(function () {
    function renderOrderItem(item, isDelivered) {
        return `
            <article class="orders-line-item">
                <div>
                    <h2>${this.escapeHtml(item.product_title)}</h2>
                    <p>Qty ${this.escapeHtml(item.quantity)} | ${this.formatPrice(item.unit_price)}</p>
                    ${isDelivered && item.product_slug ? `
                        <div class="mt-2">
                            <a href="/?view=pdp&id=${encodeURIComponent(item.product_slug)}#pdp-reviews-section" class="orders-secondary-button" style="display:inline-flex; align-items:center; justify-content:center; font-size: 0.72rem; text-decoration: none;">
                                Review Delivered Item
                            </a>
                        </div>
                    ` : ""}
                </div>
                <strong>${this.formatPrice(item.line_total)}</strong>
            </article>
        `;
    }


    function renderAddress(order) {
        const shipping = order?.shipping_record;
        if (!shipping) {
            return "<p>No shipping address is attached to this order.</p>";
        }

        return `
            <p>
                <strong>${this.escapeHtml(shipping.recipient_name)}</strong><br>
                ${this.escapeHtml(shipping.phone)}<br>
                ${this.escapeHtml(shipping.address_line1)}${shipping.address_line2 ? `, ${this.escapeHtml(shipping.address_line2)}` : ""}<br>
                ${this.escapeHtml(shipping.city)}, ${this.escapeHtml(shipping.province)} ${this.escapeHtml(shipping.postal_code)}<br>
                ${this.escapeHtml(shipping.country)}
            </p>
        `;
    }

    function renderTrackingPanel(order) {
        const shipping = order?.shipping_record;
        const trackingNumber = shipping?.tracking_number || "Not assigned yet";
        const trackingSteps = [
            { key: "not_ready", label: "Order Confirmed" },
            { key: "ready", label: "Ready For Fulfillment" },
            { key: "shipped", label: "Shipped" },
            { key: "delivered", label: "Delivered" },
        ];
        const currentIndex = Math.max(0, trackingSteps.findIndex((step) => step.key === order.shipping_status));
        const steps = trackingSteps.map((step, index) => `
            <li class="${index <= currentIndex ? "is-active" : ""}">
                <span>${this.escapeHtml(step.label)}</span>
            </li>
        `).join("");

        return `
            <section class="orders-panel orders-tracking-panel" aria-label="Fulfillment tracking">
                <div class="orders-panel-header">
                    <h2>Tracking</h2>
                    ${this.statusBadge(order.shipping_status)}
                </div>
                <div class="orders-tracking-body">
                    <p><strong>Tracking Number</strong><br>${this.escapeHtml(trackingNumber)}</p>
                    <ol class="orders-tracking-steps">
                        ${steps}
                    </ol>
                </div>
            </section>
        `;
    }

    function formatPaymentMethod(method) {
        const labels = {
            cash_on_delivery: "Cash On Delivery",
            gcash_pending: "GCash Reference Pending",
            credit_debit_card: "Credit / Debit Card (Stripe)",
            stripe: "Credit / Debit Card (Stripe)",
        };
        if (!method) return "Cash On Delivery";
        return labels[method] || String(method).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function renderPaymentPanel(order) {
        const payments = Array.isArray(order?.payments) ? order.payments : [];
        const latestPayment = payments[0] || null;
        const method = latestPayment?.method || "cash_on_delivery";
        const status = order?.payment_status || latestPayment?.status || "pending";
        const referenceNumber = latestPayment?.reference_number || "Not assigned yet";
        const canCompleteGcash = (
            order?.status !== "cancelled"
            && status === "pending"
            && method === "gcash_pending"
        );
        const canCompleteStripe = (
            order?.status !== "cancelled"
            && status !== "paid"
            && status !== "refunded"
            && (method === "credit_debit_card" || method === "stripe")
        );
        const discountAmount = Number(order?.discount?.amount || 0);

        return `
            <section class="orders-panel orders-payment-panel" aria-label="Payment details">
                <div class="orders-panel-header">
                    <h2>Payment</h2>
                    ${this.statusBadge(status)}
                </div>
                <div class="orders-payment-grid">
                    <div>
                        <span>Method</span>
                        <strong>${this.escapeHtml(formatPaymentMethod(method))}</strong>
                    </div>
                    <div>
                        <span>Reference</span>
                        <strong>${this.escapeHtml(referenceNumber)}</strong>
                    </div>
                    <div>
                        <span>Total Paid / Due</span>
                        <strong>${this.formatPrice(order.total)}</strong>
                    </div>
                    ${discountAmount > 0 ? `
                        <div>
                            <span>Coupon (${this.escapeHtml(order.coupon_code || "Applied")})</span>
                            <strong>-${this.formatPrice(order.discount)}</strong>
                        </div>
                    ` : ""}
                </div>
                ${canCompleteGcash ? `
                    <form class="orders-payment-confirm-form" onsubmit="ordersApp.confirmOrderPayment(event, '${this.escapeAttribute(order.order_number)}')">
                        <p>Transfer <strong>${this.formatPrice(order.total)}</strong> via GCash and enter your transaction reference number to verify payment.</p>
                        <div class="orders-payment-confirm-controls">
                            <input type="text" name="reference_number" placeholder="GCash Ref # (optional)" maxlength="64" autocomplete="off">
                            <button type="submit" class="orders-primary-button" ${this.actionDisabledAttribute()}>Complete GCash Payment</button>
                        </div>
                    </form>
                ` : ""}
                ${canCompleteStripe ? `
                    <div class="orders-payment-confirm-form">
                        <p>${status === "failed"
                            ? `Previous card attempt failed for <strong>${this.formatPrice(order.total)}</strong>. Retry securely on Stripe Checkout.`
                            : `Complete your card payment of <strong>${this.formatPrice(order.total)}</strong> on Stripe Checkout.`}</p>
                        <div class="orders-payment-confirm-controls">
                            <button type="button" class="orders-primary-button" onclick="ordersApp.payWithStripe('${this.escapeAttribute(order.order_number)}')" ${this.actionDisabledAttribute()}>
                                Pay with Stripe Checkout
                            </button>
                        </div>
                    </div>
                ` : ""}
            </section>
        `;
    }

    function renderCancellationAction(order) {
        const canCancel = ["pending", "confirmed"].includes(order.status) && order.shipping_status === "not_ready";
        if (!canCancel) {
            return `<p class="orders-cancel-note">Cancellation is available only before fulfillment begins.</p>`;
        }

        return `
            <button type="button" class="orders-danger-button" onclick="ordersApp.cancelOrder('${this.escapeAttribute(order.order_number)}')" ${this.actionDisabledAttribute()}>
                Cancel Order
            </button>
        `;
    }

    function renderReturnSection(order, currentReturn) {
        const isEligible = ["delivered", "shipped"].includes(order?.status);
        if (!currentReturn && !isEligible) {
            return "";
        }

        if (currentReturn) {
            return `
                <section class="orders-panel" aria-label="Return and refund status">
                    <div class="orders-panel-header">
                        <h2>Return Request #${this.escapeHtml(currentReturn.return_number)}</h2>
                        ${this.statusBadge(currentReturn.status)}
                    </div>
                    <div class="orders-payment-grid">
                        <div>
                            <span>Reason</span>
                            <strong>${this.escapeHtml(currentReturn.reason)}</strong>
                        </div>
                        <div>
                            <span>Refund Amount</span>
                            <strong>${this.formatPrice(currentReturn.refund_amount || { amount: (currentReturn.refund_amount_cents || 0) / 100 })}</strong>
                        </div>
                        <div>
                            <span>Details</span>
                            <strong>${this.escapeHtml(currentReturn.description)}</strong>
                        </div>
                        ${currentReturn.admin_notes ? `
                            <div>
                                <span>Resolution Notes</span>
                                <strong>${this.escapeHtml(currentReturn.admin_notes)}</strong>
                            </div>
                        ` : ""}
                    </div>
                </section>
            `;
        }

        return `
            <section class="orders-panel" aria-label="Request a return or refund">
                <div class="orders-panel-header">
                    <h2>Need a Return or Refund?</h2>
                </div>
                <form class="orders-payment-confirm-form" onsubmit="ordersApp.submitReturnRequest(event, '${this.escapeAttribute(order.order_number)}')">
                    <p>If your secondhand item arrived damaged or significantly differed from its listing, submit a return request for review.</p>
                    <div class="orders-payment-confirm-controls" style="flex-direction:column; align-items:stretch; gap:0.75rem;">
                        <select name="reason" required style="padding:0.65rem 0.75rem; border:1px solid var(--orders-border, #d7cec1); border-radius:6px; background:#fff;">
                            <option value="damaged">Item arrived damaged or defective</option>
                            <option value="not_as_described">Significantly different from description</option>
                            <option value="wrong_item">Wrong item delivered</option>
                            <option value="changed_mind">Other / buyer request</option>
                        </select>
                        <textarea name="description" rows="3" required maxlength="2000" placeholder="Describe what happened with this item..." style="padding:0.65rem 0.75rem; border:1px solid var(--orders-border, #d7cec1); border-radius:6px;"></textarea>
                        <button type="submit" class="orders-secondary-button" ${this.actionDisabledAttribute()}>Submit Return Request</button>
                    </div>
                </form>
            </section>
        `;
    }

    function renderDetailPage() {
        const order = this.state.currentOrder;
        if (!order) {
            return this.renderPageTemplate("detail", {
                ordersStatus: this.renderOrdersStatus(),
                orderNumber: "Order Detail",
                itemCount: 0,
                orderItems: "",
                orderTotal: this.formatPrice({ amount: 0 }),
                orderStatus: "Not loaded",
                paymentStatus: "Not loaded",
                shippingStatus: "Not loaded",
                placedAt: "Not loaded",
                shippingAddress: "",
                paymentPanel: "",
                trackingPanel: "",
                returnSection: "",
                cancellationAction: "",
            });
        }

        const isDelivered = order.shipping_status === "delivered" || order.status === "delivered";

        return this.renderPageTemplate("detail", {
            ordersStatus: this.renderOrdersStatus(),
            orderNumber: this.escapeHtml(order.order_number),
            itemCount: order.item_count || (order.items || []).length,
            orderItems: (order.items || []).map((item) => renderOrderItem.call(this, item, isDelivered)).join(""),
            orderTotal: this.formatPrice(order.total),

            orderStatus: this.statusBadge(order.status),
            paymentStatus: this.statusBadge(order.payment_status),
            shippingStatus: this.statusBadge(order.shipping_status),
            placedAt: this.escapeHtml(this.formatDate(order.placed_at)),
            shippingAddress: renderAddress.call(this, order),
            paymentPanel: renderPaymentPanel.call(this, order),
            trackingPanel: renderTrackingPanel.call(this, order),
            returnSection: renderReturnSection.call(this, order, this.state.currentReturn),
            cancellationAction: renderCancellationAction.call(this, order),
        });
    }

    window.SecondMarketOrdersPages = window.SecondMarketOrdersPages || {};
    window.SecondMarketOrdersPages.renderDetailPage = renderDetailPage;
})();
