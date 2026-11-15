(function () {
    function optionList(options, selectedValue) {
        return options.map((option) => `
            <option value="${option.value}" ${option.value === selectedValue ? "selected" : ""}>${option.label}</option>
        `).join("");
    }

    function formatOrderDate(isoString) {
        if (!isoString) return "—";
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function formatFullDateTime(isoString) {
        if (!isoString) return "—";
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const month = monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
    }

    function renderPaymentBadge(status) {
        const s = (status || "").toLowerCase();
        if (s === "paid") {
            return `<span class="admin-pill-badge admin-pill-paid"><span class="admin-pill-dot"></span>Paid</span>`;
        }
        if (s === "pending") {
            return `<span class="admin-pill-badge admin-pill-pending"><span class="admin-pill-dot"></span>Pending</span>`;
        }
        if (s === "refunded") {
            return `<span class="admin-pill-badge admin-pill-refunded">Refunded</span>`;
        }
        if (s === "failed") {
            return `<span class="admin-pill-badge admin-pill-failed">Failed</span>`;
        }
        return `<span class="admin-pill-badge admin-pill-neutral">${status || "Unknown"}</span>`;
    }

    function renderFulfillmentBadge(order) {
        const ship = (order.shipping_status || "").toLowerCase();
        const ord = (order.status || "").toLowerCase();

        if (ord === "cancelled") {
            return `<span class="admin-pill-badge admin-pill-cancelled">Cancelled</span>`;
        }
        if (ship === "delivered" || ord === "delivered") {
            return `<span class="admin-pill-badge admin-pill-delivered"><span class="admin-pill-dot"></span>Delivered</span>`;
        }
        if (ship === "shipped" || ord === "shipped") {
            return `<span class="admin-pill-badge admin-pill-shipped"><span class="admin-pill-dot"></span>Shipped</span>`;
        }
        if (ship === "ready" || ord === "processing") {
            return `<span class="admin-pill-badge admin-pill-ready"><span class="admin-pill-dot"></span>Packing</span>`;
        }
        return `<span class="admin-pill-badge admin-pill-unfulfilled"><span class="admin-pill-dot"></span>Unfulfilled</span>`;
    }

    function renderOrderRows(paginatedOrders) {
        const orders = paginatedOrders || this.state.orders || [];
        const disabled = this.actionDisabledAttribute();

        return orders.map((order) => {
            const itemCount = order.item_count || (order.items ? order.items.length : 1);
            const itemsText = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
            const isChecked = (this.state.selectedOrderNumbers || []).includes(order.order_number);

            return `
            <tr class="${isChecked ? 'is-selected' : ''}">
                <td>
                    <input type="checkbox" class="admin-checkbox admin-row-checkbox" data-order-number="${this.escapeAttribute(order.order_number)}" ${isChecked ? "checked" : ""} onchange="adminApp.toggleSelectOrderRow(this, '${this.escapeAttribute(order.order_number)}')" aria-label="Select order ${this.escapeAttribute(order.order_number)}">
                </td>
                <td>
                    <a href="javascript:void(0)" class="admin-order-id-link" onclick="adminApp.loadAdminOrder('${this.escapeAttribute(order.order_number)}')" title="View order #${this.escapeAttribute(order.order_number)}">
                        #${this.escapeHtml(order.order_number)}
                    </a>
                </td>
                <td>
                    <div class="admin-cell-customer">
                        <strong class="admin-customer-name">${this.escapeHtml(order.buyer?.name || "Customer")}</strong>
                        <span class="admin-customer-email">${this.escapeHtml(order.buyer?.email || "No email")}</span>
                    </div>
                </td>
                <td>
                    <span class="admin-order-date">${this.escapeHtml(formatOrderDate(order.placed_at || order.created_at))}</span>
                </td>
                <td>
                    <span class="admin-order-items-count">${this.escapeHtml(itemsText)}</span>
                </td>
                <td>
                    <strong class="admin-order-total-cell">${this.formatPrice(order.total)}</strong>
                </td>
                <td>
                    ${renderPaymentBadge(order.payment_status)}
                </td>
                <td>
                    ${renderFulfillmentBadge(order)}
                </td>
                <td class="text-right">
                    <div class="admin-table-actions">
                        <button data-admin-action type="button" class="admin-action-icon-btn" title="View Details" aria-label="View Details" onclick="adminApp.loadAdminOrder('${this.escapeAttribute(order.order_number)}')" ${disabled}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button data-admin-action type="button" class="admin-action-icon-btn" title="Print Packing Slip" aria-label="Print Packing Slip" onclick="adminApp.printPackingSlip('${this.escapeAttribute(order.order_number)}')" ${disabled}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join("") || this.emptyTableRow("No orders match the selected filters.", 9);
    }

    function renderOrderItems(order) {
        return (order.items || []).map((item) => {
            const imgUrl = item.product_image_url || "";
            const imageHtml = imgUrl ? `
                <img src="${this.escapeAttribute(imgUrl)}" alt="${this.escapeAttribute(item.product_title)}" class="admin-order-item-img" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'admin-order-item-placeholder\\'><svg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg></div>'">
            ` : `
                <div class="admin-order-item-placeholder">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                </div>
            `;

            const conditionPart = item.condition ? `${this.escapeHtml(item.condition.charAt(0).toUpperCase() + item.condition.slice(1))} • ` : "";
            const skuPart = item.sku ? `SKU: ${this.escapeHtml(item.sku)} • ` : (item.product_id ? `SKU: PRD-${this.escapeHtml(item.product_id)} • ` : "");

            return `
            <div class="admin-order-product-row">
                <div class="admin-order-item-media">
                    ${imageHtml}
                </div>
                <div class="admin-order-item-info">
                    <h5 class="admin-order-item-name">${this.escapeHtml(item.product_title)}</h5>
                    <p class="admin-order-item-subtext">${conditionPart}${skuPart}Qty: ${this.escapeHtml(item.quantity)}</p>
                </div>
                <div class="admin-order-item-price-col">
                    <strong>${this.formatPrice(item.line_total)}</strong>
                </div>
            </div>
            `;
        }).join("");
    }

    function renderShippingAddress(order) {
        const shipping = order.shipping_record;
        if (!shipping) return "<p class='admin-text-muted'>No shipping address is attached to this order.</p>";

        return `
            <div class="admin-address-block">
                <p class="admin-address-name"><strong>${this.escapeHtml(shipping.recipient_name || order.buyer?.name || "Recipient")}</strong></p>
                <p class="admin-address-text">
                    ${this.escapeHtml(shipping.address_line1 || "")}${shipping.address_line2 ? `, ${this.escapeHtml(shipping.address_line2)}` : ""}<br>
                    ${this.escapeHtml(shipping.city || "")}${shipping.province ? `, ${this.escapeHtml(shipping.province)}` : ""} ${this.escapeHtml(shipping.postal_code || "")}<br>
                    ${this.escapeHtml(shipping.country || "Philippines")}
                </p>
            </div>
        `;
    }

    function renderOrderDetail() {
        const order = this.state.currentOrder;
        if (!order) {
            return `
                <div id="admin-order-drawer-backdrop" class="admin-drawer-backdrop" style="display:none;" onclick="adminApp.closeOrderDetailDrawer()"></div>
                <aside id="admin-order-detail" class="admin-order-detail admin-order-drawer" style="display:none;" tabindex="-1" aria-hidden="true">
                    <div class="admin-drawer-header">
                        <h3 class="admin-drawer-title">Order Details</h3>
                        <button type="button" class="admin-drawer-close-btn" onclick="adminApp.closeOrderDetailDrawer()" aria-label="Close drawer">×</button>
                    </div>
                    <div class="admin-detail-empty">
                        <p>Select an order to review buyer details, ordered products, fulfillment controls, and timeline.</p>
                    </div>
                </aside>
            `;
        }

        const isCancelled = order.status === "cancelled";
        const isShipped = order.shipping_status === "shipped" || order.status === "shipped";
        const isDelivered = order.shipping_status === "delivered" || order.status === "delivered";
        const isPaid = order.payment_status === "paid";
        const isReady = order.shipping_status === "ready" || order.status === "processing";
        const shipping = order.shipping_record;

        return `
            <div id="admin-order-drawer-backdrop" class="admin-drawer-backdrop active" onclick="adminApp.closeOrderDetailDrawer()"></div>
            <aside id="admin-order-detail" class="admin-order-detail admin-order-drawer active" tabindex="-1" aria-labelledby="admin-drawer-heading" role="dialog" aria-modal="true">
                <!-- Drawer Header -->
                <div class="admin-drawer-header">
                    <div class="admin-drawer-header-left">
                        <div class="admin-drawer-title-row">
                            <h2 id="admin-drawer-heading" class="admin-drawer-title">Order #${this.escapeHtml(order.order_number)}</h2>
                            ${renderFulfillmentBadge(order)}
                        </div>
                        <p class="admin-drawer-subtitle">Placed on ${this.escapeHtml(formatFullDateTime(order.placed_at || order.created_at))}</p>
                    </div>
                    <button type="button" class="admin-drawer-close-btn" onclick="adminApp.closeOrderDetailDrawer()" aria-label="Close drawer">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <!-- Drawer Scrollable Body -->
                <div class="admin-drawer-body">
                    <!-- Section: Customer & Delivery -->
                    <div class="admin-drawer-card">
                        <div class="admin-card-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admin-card-icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span class="admin-card-title">CUSTOMER &amp; DELIVERY</span>
                        </div>
                        <div class="admin-card-body">
                            <div class="admin-customer-info">
                                <h4 class="admin-customer-name">${this.escapeHtml(order.buyer?.name || "Customer")}</h4>
                                <div class="admin-info-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>${this.escapeHtml(order.buyer?.email || "No email")}</span>
                                </div>
                                <div class="admin-info-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    <span>${this.escapeHtml(shipping?.phone || order.buyer?.phone || "No phone provided")}</span>
                                </div>
                                <div class="admin-info-item admin-info-address">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                    <div>
                                        ${this.escapeHtml(shipping?.address_line1 || "No street address")}${shipping?.address_line2 ? `, ${this.escapeHtml(shipping.address_line2)}` : ""}<br>
                                        ${this.escapeHtml(shipping?.city || "")}${shipping?.province ? `, ${this.escapeHtml(shipping.province)}` : ""} ${this.escapeHtml(shipping?.postal_code || "")}<br>
                                        ${this.escapeHtml(shipping?.country || "Philippines")}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Ordered Products -->
                    <div class="admin-drawer-card">
                        <div class="admin-card-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admin-card-icon"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                            <span class="admin-card-title">ORDERED PRODUCTS</span>
                        </div>
                        <div class="admin-card-body admin-ordered-products-list">
                            ${renderOrderItems.call(this, order)}
                        </div>
                    </div>

                    <!-- Section: Cost Breakdown -->
                    <div class="admin-drawer-card admin-cost-card">
                        <div class="admin-cost-row">
                            <span>Subtotal</span>
                            <span>${this.formatPrice(order.subtotal || order.total)}</span>
                        </div>
                        <div class="admin-cost-row">
                            <span>Shipping</span>
                            <span>${order.shipping && order.shipping.amount_cents > 0 ? this.formatPrice(order.shipping) : '₱0.00'}</span>
                        </div>
                        <div class="admin-cost-row">
                            <span>Payment Status</span>
                            <span>${renderPaymentBadge(order.payment_status)}</span>
                        </div>
                        <div class="admin-cost-divider"></div>
                        <div class="admin-cost-row admin-cost-total">
                            <strong>Total</strong>
                            <strong class="admin-total-purple">${this.formatPrice(order.total)}</strong>
                        </div>
                    </div>

                    <!-- Section: Fulfillment Controls -->
                    <div class="admin-drawer-card">
                        <div class="admin-card-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admin-card-icon"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                            <span class="admin-card-title">FULFILLMENT CONTROLS</span>
                        </div>
                        <div class="admin-card-body admin-controls-body">
                            ${isCancelled ? `
                                <div class="admin-cancelled-notice">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    <span>This order has been cancelled and products returned to inventory.</span>
                                </div>
                            ` : `
                                <div class="admin-fulfillment-actions">
                                    ${!isPaid ? `
                                        <button type="button" class="admin-btn admin-btn-action-outline" style="width: 100%; justify-content: center; border-color: #10b981; color: #047857; background: #ecfdf5;" onclick="adminApp.markOrderAsPaid('${this.escapeAttribute(order.order_number)}')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            <span>Mark Payment as Paid</span>
                                        </button>
                                    ` : ""}

                                    ${!isReady && !isShipped && !isDelivered ? `
                                        <button type="button" class="admin-btn admin-btn-action-dark" onclick="adminApp.markOrderAsPacking('${this.escapeAttribute(order.order_number)}')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                            <span>Mark as Packing</span>
                                        </button>
                                    ` : ""}

                                    ${!isShipped && !isDelivered ? `
                                        <button type="button" class="admin-btn admin-btn-action-primary" onclick="adminApp.promptOrderShipping('${this.escapeAttribute(order.order_number)}')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                                            <span>Mark as Shipped &amp; Add Tracking</span>
                                        </button>
                                        ${this.state.shippingFormOpenForOrder === order.order_number ? `
                                            <form class="admin-inline-shipping-form" onsubmit="adminApp.submitOrderShippingForm(event, '${this.escapeAttribute(order.order_number)}')">
                                                <div class="admin-field">
                                                    <span>Courier / Carrier</span>
                                                    <select name="carrier" class="admin-select-control">
                                                        <option value="J&T Express">J&amp;T Express</option>
                                                        <option value="LBC Express">LBC Express</option>
                                                        <option value="Flash Express">Flash Express</option>
                                                        <option value="Ninja Van">Ninja Van</option>
                                                        <option value="GrabExpress">GrabExpress / Lalamove</option>
                                                        <option value="">Other / Direct Tracking #</option>
                                                    </select>
                                                </div>
                                                <div class="admin-field">
                                                    <span>Tracking Number <strong class="admin-required">*</strong></span>
                                                    <input id="admin-inline-tracking-input" name="tracking_number" type="text" required value="${this.escapeAttribute(shipping?.tracking_number || ('TRK-' + Date.now().toString().slice(-6)))}" placeholder="e.g. JT-94827165">
                                                </div>
                                                <div class="admin-field">
                                                    <span>Tracking URL (Optional)</span>
                                                    <input name="tracking_url" type="url" value="${this.escapeAttribute(shipping?.tracking_url || '')}" placeholder="https://tracking.example.com/...">
                                                </div>
                                                <div class="admin-inline-shipping-actions">
                                                    <button type="button" class="admin-btn admin-btn-default" onclick="adminApp.cancelOrderShippingForm()">Cancel</button>
                                                    <button type="submit" class="admin-btn admin-btn-action-primary">Confirm Shipment</button>
                                                </div>
                                            </form>
                                        ` : ""}
                                    ` : ""}

                                    ${(isShipped || isDelivered) && (shipping?.tracking_number || shipping?.carrier) ? `
                                        <div class="admin-tracking-display">
                                            ${shipping?.carrier ? `<span class="admin-tracking-label">Carrier: <strong>${this.escapeHtml(shipping.carrier)}</strong></span>` : ""}
                                            <div>
                                                <span class="admin-tracking-label">Tracking Number:</span>
                                                <strong class="admin-tracking-code">${this.escapeHtml(shipping?.tracking_number || "Pending")}</strong>
                                                ${shipping?.tracking_url ? ` · <a href="${this.escapeAttribute(shipping.tracking_url)}" target="_blank" rel="noopener noreferrer" class="admin-order-id-link">Track Package &rarr;</a>` : ""}
                                            </div>
                                        </div>
                                    ` : ""}

                                    ${isShipped && !isDelivered ? `
                                        <button type="button" class="admin-btn admin-btn-action-primary" onclick="adminApp.markOrderAsDelivered('${this.escapeAttribute(order.order_number)}')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                            <span>Mark as Delivered</span>
                                        </button>
                                    ` : ""}

                                    ${!isDelivered ? `
                                        <button type="button" class="admin-btn admin-btn-action-danger" onclick="adminApp.confirmCancelOrder('${this.escapeAttribute(order.order_number)}')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                            <span>Cancel Order</span>
                                        </button>
                                    ` : ""}
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Section: Internal Admin Notes -->
                    <div class="admin-drawer-card">
                        <div class="admin-card-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admin-card-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                            <span class="admin-card-title">INTERNAL STAFF NOTES</span>
                        </div>
                        <div class="admin-card-body">
                            <form class="admin-notes-form" onsubmit="adminApp.saveOrderAdminNotes(event, '${this.escapeAttribute(order.order_number)}')" style="display:flex;flex-direction:column;gap:0.65rem;">
                                <textarea name="admin_notes" rows="3" placeholder="Add internal fulfillment or customer service notes (not visible to buyer)..." style="width:100%;padding:0.6rem 0.75rem;border:1px solid var(--admin-line);border-radius:var(--radius-sm);background:var(--admin-surface);color:var(--admin-ink);font-family:inherit;font-size:0.84rem;resize:vertical;">${this.escapeHtml(order.admin_notes || "")}</textarea>
                                <div style="display:flex;justify-content:flex-end;">
                                    <button type="submit" class="admin-btn admin-btn-secondary">Save Internal Note</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Section: Order Timeline -->
                    <div class="admin-drawer-card">
                        <div class="admin-card-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admin-card-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span class="admin-card-title">ORDER TIMELINE</span>
                        </div>
                        <div class="admin-card-body">
                            <div class="admin-timeline">
                                <!-- Step 1: Order Placed -->
                                <div class="admin-timeline-item active">
                                    <div class="admin-timeline-marker">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="admin-timeline-content">
                                        <strong class="admin-timeline-title">Order Placed</strong>
                                        <p class="admin-timeline-time">${this.escapeHtml(formatFullDateTime(order.placed_at || order.created_at))}</p>
                                    </div>
                                </div>

                                <!-- Step 2: Payment Confirmed -->
                                <div class="admin-timeline-item ${isPaid ? 'active' : ''}">
                                    <div class="admin-timeline-marker">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="admin-timeline-content">
                                        <strong class="admin-timeline-title">Payment Confirmed</strong>
                                        <p class="admin-timeline-time">${isPaid ? (order.payments && order.payments[0] ? `Paid via ${order.payments[0].method}` : 'Paid') : 'Payment pending'}</p>
                                    </div>
                                </div>

                                <!-- Step 3: Order Shipped -->
                                <div class="admin-timeline-item ${(isShipped || isDelivered) ? 'active' : ''}">
                                    <div class="admin-timeline-marker">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="admin-timeline-content">
                                        <strong class="admin-timeline-title">Order Shipped</strong>
                                        <p class="admin-timeline-time">${(isShipped || isDelivered) ? (shipping?.tracking_number ? `Tracking: ${this.escapeHtml(shipping.tracking_number)}` : 'Shipped') : 'Pending shipment'}</p>
                                    </div>
                                </div>

                                <!-- Step 4: Delivered -->
                                <div class="admin-timeline-item ${isDelivered ? 'active' : ''}">
                                    <div class="admin-timeline-marker">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="admin-timeline-content">
                                        <strong class="admin-timeline-title">Delivered</strong>
                                        <p class="admin-timeline-time">${isDelivered ? 'Package delivered to recipient' : 'Pending delivery'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Drawer Sticky Footer -->
                <div class="admin-drawer-footer">
                    <button type="button" class="admin-btn admin-btn-secondary" onclick="adminApp.printPackingSlip('${this.escapeAttribute(order.order_number)}')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>Print Packing Slip</span>
                    </button>
                    <button type="button" class="admin-btn admin-btn-default" onclick="adminApp.closeOrderDetailDrawer()">
                        Close
                    </button>
                </div>
            </aside>
        `;
    }

    function renderOrdersPage() {
        const orderFilters = this.state.orderFilters || {};
        const allOrders = this.state.orders || [];
        const pageSize = this.state.orderPageSize || 10;
        const currentPage = this.state.orderPageNumber || 1;
        const totalOrders = allOrders.length;
        const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const startIdx = (safePage - 1) * pageSize;
        const paginatedOrders = allOrders.slice(startIdx, startIdx + pageSize);
        const endIdx = Math.min(startIdx + pageSize, totalOrders);

        const orderPaginationInfo = totalOrders > 0
            ? `Showing ${startIdx + 1} to ${endIdx} of ${totalOrders} orders`
            : "Showing 0 of 0 orders";

        let orderPaginationControls = `
            <button type="button" class="admin-pagination-btn" ${safePage <= 1 ? "disabled" : ""} onclick="adminApp.setOrderPage(${safePage - 1})" aria-label="Previous page">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                Previous
            </button>
        `;
        for (let i = 1; i <= totalPages; i++) {
            orderPaginationControls += `
                <button type="button" class="admin-pagination-btn ${i === safePage ? "active" : ""}" ${i === safePage ? 'aria-current="page"' : ""} onclick="adminApp.setOrderPage(${i})">${i}</button>
            `;
        }
        orderPaginationControls += `
            <button type="button" class="admin-pagination-btn" ${safePage >= totalPages ? "disabled" : ""} onclick="adminApp.setOrderPage(${safePage + 1})" aria-label="Next page">
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        `;

        const selectedOrders = this.state.selectedOrderNumbers || [];
        const disabled = this.actionDisabledAttribute();
        const orderBulkActionBar = selectedOrders.length > 0 ? `
            <div class="admin-bulk-action-bar" role="region" aria-label="Bulk Order Actions" style="margin-bottom:0.85rem;">
                <div class="admin-bulk-count">
                    <strong>${selectedOrders.length}</strong> order${selectedOrders.length === 1 ? "" : "s"} selected
                </div>
                <div class="admin-bulk-buttons">
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkOrdersAction('mark_confirmed')" ${disabled}>Confirm Selected</button>
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkOrdersAction('mark_processing')" ${disabled}>Mark Processing</button>
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkOrdersAction('mark_delivered')" ${disabled}>Mark Delivered</button>
                    <button type="button" class="admin-text-button" onclick="adminApp.clearOrderSelection()">Clear</button>
                </div>
            </div>
        ` : "";

        return this.renderPageTemplate("orders", {
            orderCount: totalOrders,
            orderBulkActionBar,
            orderPaginationInfo,
            orderPaginationControls,
            orderStatus: this.renderInventoryStatus("Order records are loading."),
            searchQuery: this.escapeAttribute(orderFilters.q || ""),
            orderRows: renderOrderRows.call(this, paginatedOrders),
            orderDetail: renderOrderDetail.call(this),
            paymentOptions: optionList([
                { value: "all", label: "All Payments" },
                { value: "paid", label: "Paid" },
                { value: "pending", label: "Pending" },
                { value: "failed", label: "Failed" },
                { value: "refunded", label: "Refunded" },
            ], orderFilters.payment_status || "all"),
            fulfillmentOptions: optionList([
                { value: "all", label: "All Fulfillments" },
                { value: "unfulfilled", label: "Unfulfilled" },
                { value: "shipped", label: "Shipped" },
                { value: "delivered", label: "Delivered" },
                { value: "cancelled", label: "Cancelled" },
            ], orderFilters.fulfillment_status || "all"),
            dateRangeOptions: optionList([
                { value: "all", label: "All Dates" },
                { value: "today", label: "Today" },
                { value: "this_week", label: "This Week" },
                { value: "this_month", label: "This Month" },
                { value: "this_year", label: "This Year" },
            ], orderFilters.date_range || "all"),
            statusOptions: optionList([
                { value: "all", label: "All Statuses" },
                { value: "confirmed", label: "Confirmed" },
                { value: "processing", label: "Processing" },
                { value: "shipped", label: "Shipped" },
                { value: "delivered", label: "Delivered" },
                { value: "cancelled", label: "Cancelled" },
            ], orderFilters.status || "all"),
            shippingOptions: optionList([
                { value: "all", label: "All Shipping" },
                { value: "not_ready", label: "Not Ready" },
                { value: "ready", label: "Ready" },
                { value: "shipped", label: "Shipped" },
                { value: "delivered", label: "Delivered" },
                { value: "returned", label: "Returned" },
            ], orderFilters.shipping_status || "all"),
            sortOptions: optionList([
                { value: "recent", label: "Recently Placed" },
                { value: "oldest", label: "Oldest First" },
                { value: "total_desc", label: "Total High To Low" },
                { value: "total_asc", label: "Total Low To High" },
            ], orderFilters.sort || "recent"),
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderOrdersPage = renderOrdersPage;
})();
