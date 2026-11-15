(function () {
    function renderReturnsPage() {
        const returnsList = this.state.returnsList || [];
        const currentFilter = this.state.returnsStatusFilter || "all";
        const disabled = this.actionDisabledAttribute();

        const statusTabs = [
            { value: "all", label: "All Returns" },
            { value: "requested", label: "Requested" },
            { value: "approved", label: "Approved" },
            { value: "refunded", label: "Refunded" },
            { value: "rejected", label: "Rejected" },
            { value: "completed", label: "Completed" },
        ].map((tab) => `
            <button type="button" class="admin-pill-filter ${currentFilter === tab.value ? "is-active" : ""}" onclick="adminApp.setReturnsStatusFilter('${tab.value}')">
                ${this.escapeHtml(tab.label)}
            </button>
        `).join("");

        const rows = returnsList.map((ret) => {
            const rn = this.escapeAttribute(ret.return_number);
            const refundVal = ret.refund_amount !== undefined && ret.refund_amount !== null ? Number(ret.refund_amount).toFixed(2) : "0.00";
            const maxRefundAttr = ret.order_total !== undefined && ret.order_total !== null ? ` max="${this.escapeAttribute(Number(ret.order_total).toFixed(2))}"` : "";
            const isRefunded = ret.status === "refunded" || ret.status === "completed" || ret.order_payment_status === "refunded";
            const methodLabel = ret.payment_method === "credit_debit_card" || ret.payment_method === "stripe"
                ? "Stripe Card"
                : ret.payment_method === "gcash_pending" || ret.payment_method === "gcash"
                    ? "GCash"
                    : ret.payment_method === "cash_on_delivery"
                        ? "Cash on Delivery"
                        : (ret.payment_method || "Standard");
            const gatewayBadge = ret.refund_reference
                ? `<div class="admin-muted" style="margin-top: 0.25rem; font-size: 0.72rem;">${ret.refund_gateway === "stripe" ? "Stripe Refund:" : "Refund Ref:"} <code>${this.escapeHtml(ret.refund_reference)}</code></div>`
                : "";
            return `
            <tr>
                <td>
                    <strong>#${this.escapeHtml(ret.return_number)}</strong>
                    <div class="admin-muted">Order: <button type="button" class="admin-order-link" onclick="adminApp.viewOrder('${this.escapeAttribute(ret.order_number || '')}')">#${this.escapeHtml(ret.order_number || "—")}</button></div>
                    <div class="admin-muted" style="font-size: 0.72rem;">${this.escapeHtml(methodLabel)}${ret.order_total !== null && ret.order_total !== undefined ? ` · ₱${Number(ret.order_total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(ret.user_email || `Buyer #${ret.user_id}`)}</strong>
                    <div class="admin-muted">${this.escapeHtml(this.formatDate(ret.created_at))}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(ret.reason)}</strong>
                    <p class="admin-muted" style="margin: 0.2rem 0 0; font-size: 0.76rem; max-width: 280px;">${this.escapeHtml(ret.description)}</p>
                </td>
                <td>
                    ${this.statusBadge(ret.status)}
                    ${gatewayBadge}
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 0.35rem; min-width: 190px;">
                        <label style="font-size: 0.7rem; color: var(--admin-muted); font-weight: 600;">
                            Refund (₱):
                            <input id="admin-return-refund-${rn}" type="number" step="0.01" min="0"${maxRefundAttr} value="${this.escapeAttribute(refundVal)}" ${isRefunded ? "disabled" : ""} style="width: 100px; padding: 0.25rem 0.4rem; margin-left: 0.25rem; border: 1px solid var(--admin-line); border-radius: 4px; font-size: 0.78rem;">
                        </label>
                        <input id="admin-return-notes-${rn}" type="text" value="${this.escapeAttribute(ret.admin_notes || "")}" placeholder="Admin resolution notes..." style="padding: 0.3rem 0.45rem; border: 1px solid var(--admin-line); border-radius: 4px; font-size: 0.76rem;">
                    </div>
                </td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        ${ret.status === "requested" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.handleUpdateReturnStatus('${rn}', 'approved')" ${disabled}>Approve</button>
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-danger" onclick="adminApp.handleUpdateReturnStatus('${rn}', 'rejected')" ${disabled}>Reject</button>
                        ` : ""}
                        ${ret.status === "approved" || ret.status === "requested" ? `
                            <button type="button" class="admin-button-primary admin-btn-sm" onclick="adminApp.handleUpdateReturnStatus('${rn}', 'refunded')" ${disabled}>Issue Refund</button>
                        ` : ""}
                        ${ret.status === "refunded" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.handleUpdateReturnStatus('${rn}', 'completed')" ${disabled}>Complete</button>
                        ` : ""}
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No return requests found matching the selected filter.", 6);

        return `
            <section class="admin-section" aria-labelledby="admin-returns-title">
                <div class="admin-section-header">
                    <div>
                        <h2 id="admin-returns-title">Returns &amp; Refunds</h2>
                        <p class="admin-muted">Review buyer return claims, record resolution notes, and authorize refunds.</p>
                    </div>
                    <div class="admin-pill-filter-group">
                        ${statusTabs}
                    </div>
                </div>

                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>${returnsList.length} Return Request${returnsList.length === 1 ? "" : "s"}</h3>
                        <button type="button" class="admin-text-button" onclick="adminApp.refreshReturns()">Refresh</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Return / Order</th>
                                    <th scope="col">Buyer &amp; Date</th>
                                    <th scope="col">Reason &amp; Description</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Refund &amp; Notes</th>
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
        `;
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderReturnsPage = renderReturnsPage;
})();
