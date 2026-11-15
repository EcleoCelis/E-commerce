(function () {
    function getCouponLifecycleStatus(c) {
        const now = Date.now();
        if (!c.is_active) {
            return { key: "inactive", label: "Inactive", css: "status-archived" };
        }
        if (c.valid_from && Date.parse(c.valid_from) > now) {
            return { key: "scheduled", label: "Scheduled", css: "status-pending" };
        }
        if (c.valid_until && Date.parse(c.valid_until) < now) {
            return { key: "expired", label: "Expired", css: "status-hidden" };
        }
        if (c.usage_limit && Number(c.used_count || 0) >= Number(c.usage_limit)) {
            return { key: "limit_reached", label: "Limit Reached", css: "status-hidden" };
        }
        return { key: "active", label: "Active", css: "status-active" };
    }

    function toDateInputValue(iso) {
        if (!iso) return "";
        return String(iso).slice(0, 10);
    }

    function renderCouponRedemptionsDrawer(drawerData) {
        if (!drawerData) return "";
        const coupon = drawerData.coupon || {};
        const redemptions = drawerData.redemptions || [];
        const rows = redemptions.map((r) => `
            <tr>
                <td>
                    <button type="button" class="admin-order-link" onclick="adminApp.closeCouponRedemptionsDrawer(); adminApp.viewOrder('${this.escapeAttribute(r.order_number || "")}')">
                        #${this.escapeHtml(r.order_number || "—")}
                    </button>
                </td>
                <td>
                    <div>${this.escapeHtml(r.buyer_name || "Guest")}</div>
                    <div class="admin-muted" style="font-size: 0.74rem;">${this.escapeHtml(r.buyer_email || "")}</div>
                </td>
                <td><strong>₱${Number(r.discount_amount || 0).toFixed(2)}</strong></td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(r.redeemed_at))}</span></td>
            </tr>
        `).join("") || this.emptyTableRow("No orders have redeemed this coupon yet.", 4);

        return `
            <div class="admin-drawer-backdrop" onclick="if(event.target === this) adminApp.closeCouponRedemptionsDrawer()">
                <aside class="admin-order-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-coupon-drawer-title">
                    <div class="admin-drawer-header">
                        <div>
                            <span class="admin-eyebrow">COUPON REDEMPTIONS</span>
                            <h3 id="admin-coupon-drawer-title">${this.escapeHtml(coupon.code || "Coupon")}</h3>
                        </div>
                        <button type="button" class="admin-modal-close" onclick="adminApp.closeCouponRedemptionsDrawer()" aria-label="Close drawer">&times;</button>
                    </div>
                    <div class="admin-drawer-body">
                        <div class="admin-drawer-card">
                            <p class="admin-muted" style="margin: 0 0 0.75rem;">
                                ${redemptions.length} redemption${redemptions.length === 1 ? "" : "s"} recorded${coupon.usage_limit ? ` out of ${coupon.usage_limit} max uses` : ""}.
                            </p>
                            <div class="admin-table-wrap">
                                <table class="admin-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Order</th>
                                            <th scope="col">Buyer</th>
                                            <th scope="col">Discount</th>
                                            <th scope="col">Redeemed</th>
                                        </tr>
                                    </thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        `;
    }

    function renderCouponsPage() {
        const coupons = this.state.couponsList || [];
        const disabled = this.actionDisabledAttribute();
        const editingId = this.state.editingCouponId;
        const editingCoupon = editingId ? coupons.find((c) => Number(c.id) === Number(editingId)) : null;

        const rows = coupons.map((c) => {
            const discountText = c.discount_type === "percentage"
                ? `${Number(c.discount_value).toFixed(0)}% OFF`
                : `₱${Number(c.discount_value).toFixed(2)} OFF`;
            const minSpendText = c.min_spend ? `₱${Number(c.min_spend).toFixed(2)}` : "None";
            const usageText = c.usage_limit ? `${c.used_count || 0} / ${c.usage_limit}` : `${c.used_count || 0} (Unlimited)`;
            const lifecycle = getCouponLifecycleStatus(c);
            const windowLabel = (c.valid_from || c.valid_until)
                ? `${c.valid_from ? toDateInputValue(c.valid_from) : "Now"} → ${c.valid_until ? toDateInputValue(c.valid_until) : "No expiry"}`
                : "Always valid";
            const hasRedemptions = Number(c.used_count || 0) > 0;

            return `
            <tr>
                <td>
                    <span class="admin-sku-pill" style="font-weight: 600; color: var(--admin-ink);">${this.escapeHtml(c.code)}</span>
                </td>
                <td>
                    <strong>${this.escapeHtml(discountText)}</strong>
                    ${c.max_discount ? `<div class="admin-muted">Cap: ₱${Number(c.max_discount).toFixed(2)}</div>` : ""}
                </td>
                <td>${this.escapeHtml(minSpendText)}</td>
                <td>
                    <div>${this.escapeHtml(usageText)}</div>
                    <button type="button" class="admin-text-button" style="font-size: 0.72rem; padding: 0;" onclick="adminApp.viewCouponRedemptions(${c.id})">View history</button>
                </td>
                <td>
                    <span class="admin-pill-badge ${lifecycle.css}"><span class="admin-pill-dot"></span>${this.escapeHtml(lifecycle.label)}</span>
                    <div class="admin-muted" style="font-size: 0.72rem; margin-top: 0.25rem;">${this.escapeHtml(windowLabel)}</div>
                </td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(c.created_at))}</span></td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.startEditCoupon(${c.id})" ${disabled}>Edit</button>
                        <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.handleToggleCouponStatus(${c.id}, ${!c.is_active})" ${disabled}>
                            ${c.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-danger" onclick="adminApp.handleDeleteCoupon(${c.id}, '${this.escapeAttribute(c.code)}')" ${hasRedemptions || this.state.actionLoading ? "disabled" : ""} title="${hasRedemptions ? "Coupons with redemptions cannot be deleted; deactivate instead." : "Delete unused coupon"}">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No promotional coupons created yet.", 7);

        return `
            <section class="admin-section" aria-labelledby="admin-coupons-title">
                <div class="admin-section-header">
                    <div>
                        <h2 id="admin-coupons-title">Coupons &amp; Discount Codes</h2>
                        <p class="admin-muted">Create, schedule, cap, and audit promotional codes that buyers can apply during checkout.</p>
                    </div>
                </div>

                <div class="admin-panel" style="padding: 1.25rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.85rem;">
                        <h3 style="margin: 0; font-size: 0.95rem;">
                            ${editingCoupon ? `Edit Coupon: ${this.escapeHtml(editingCoupon.code)}` : "Create New Coupon Code"}
                        </h3>
                        ${editingCoupon ? `<button type="button" class="admin-text-button" onclick="adminApp.cancelEditCoupon()">Cancel Edit</button>` : ""}
                    </div>
                    <form class="admin-filter-bar" style="padding: 0; border: 0; box-shadow: none; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));" onsubmit="adminApp.handleSaveCoupon(event)">
                        <label class="admin-field">
                            <span>Coupon Code *</span>
                            <input class="admin-input-uppercase" name="code" type="text" required value="${this.escapeAttribute(editingCoupon?.code || "")}" placeholder="e.g. WELCOME10">
                        </label>
                        <label class="admin-field">
                            <span>Discount Type</span>
                            <select name="discount_type">
                                <option value="fixed" ${editingCoupon?.discount_type !== "percentage" ? "selected" : ""}>Fixed Amount (₱)</option>
                                <option value="percentage" ${editingCoupon?.discount_type === "percentage" ? "selected" : ""}>Percentage (%)</option>
                            </select>
                        </label>
                        <label class="admin-field">
                            <span>Discount Value *</span>
                            <input name="discount_value" type="number" step="0.01" min="0.01" required value="${editingCoupon ? this.escapeAttribute(Number(editingCoupon.discount_value).toString()) : ""}" placeholder="100">
                        </label>
                        <label class="admin-field">
                            <span>Max Discount Cap (₱)</span>
                            <input name="max_discount" type="number" step="0.01" min="0.01" value="${editingCoupon?.max_discount ? this.escapeAttribute(Number(editingCoupon.max_discount).toString()) : ""}" placeholder="Optional cap">
                        </label>
                        <label class="admin-field">
                            <span>Min Spend (₱)</span>
                            <input name="min_spend" type="number" step="0.01" min="0" value="${editingCoupon ? this.escapeAttribute(Number(editingCoupon.min_spend || 0).toString()) : "0"}" placeholder="0">
                        </label>
                        <label class="admin-field">
                            <span>Usage Limit</span>
                            <input name="usage_limit" type="number" step="1" min="1" value="${editingCoupon?.usage_limit ? this.escapeAttribute(String(editingCoupon.usage_limit)) : ""}" placeholder="Unlimited">
                        </label>
                        <label class="admin-field">
                            <span>Valid From</span>
                            <input name="valid_from" type="date" value="${this.escapeAttribute(toDateInputValue(editingCoupon?.valid_from))}">
                        </label>
                        <label class="admin-field">
                            <span>Valid Until</span>
                            <input name="valid_until" type="date" value="${this.escapeAttribute(toDateInputValue(editingCoupon?.valid_until))}">
                        </label>
                        <div style="display: flex; align-items: flex-end; gap: 0.5rem;">
                            <button type="submit" class="admin-button-primary" ${disabled}>
                                ${editingCoupon ? "Save Changes" : "Create Coupon"}
                            </button>
                        </div>
                    </form>
                </div>

                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>${coupons.length} Coupon${coupons.length === 1 ? "" : "s"}</h3>
                        <button type="button" class="admin-text-button" onclick="adminApp.refreshCoupons()">Refresh</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Code</th>
                                    <th scope="col">Discount</th>
                                    <th scope="col">Min Spend</th>
                                    <th scope="col">Redemptions</th>
                                    <th scope="col">Status &amp; Window</th>
                                    <th scope="col">Created</th>
                                    <th scope="col" style="text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
            ${renderCouponRedemptionsDrawer.call(this, this.state.currentCouponRedemptions)}
        `;
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderCouponsPage = renderCouponsPage;
})();
