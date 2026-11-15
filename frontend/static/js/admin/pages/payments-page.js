(function () {
    function formatMethodLabel(method) {
        const clean = (method || "").toLowerCase();
        if (clean === "credit_debit_card" || clean === "stripe") return "Stripe Card";
        if (clean === "gcash_pending" || clean === "gcash") return "GCash";
        if (clean === "cash_on_delivery") return "Cash on Delivery";
        if (clean === "refund") return "Refund Entry";
        return method || "Standard";
    }

    function renderPaymentsPage() {
        const payments = this.state.paymentsList || [];
        const summary = this.state.paymentSummary || {};
        const filters = this.state.paymentFilters || { q: "", method: "all", status: "all" };
        const disabled = this.actionDisabledAttribute();

        const kpiStrip = `
            <div class="admin-metrics-grid" style="margin-bottom: 1.25rem;">
                <article class="admin-metric-card">
                    <span>Collected Revenue</span>
                    <strong>${this.escapeHtml(this.formatCurrency(summary.collected_amount || 0))}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Settled charges across gateways</span>
                </article>
                <article class="admin-metric-card">
                    <span>Pending Settlement</span>
                    <strong>${this.escapeHtml(this.formatCurrency(summary.pending_amount || 0))}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">COD &amp; awaiting verification</span>
                </article>
                <article class="admin-metric-card">
                    <span>Refunded Total</span>
                    <strong>${this.escapeHtml(this.formatCurrency(summary.refunded_amount || 0))}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Executed return &amp; order refunds</span>
                </article>
                <article class="admin-metric-card">
                    <span>Failed Attempts</span>
                    <strong>${Number(summary.failed_count || 0)}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Declined or expired checkouts</span>
                </article>
            </div>
        `;

        const methodOptions = [
            { value: "all", label: "All Methods" },
            { value: "credit_debit_card", label: "Stripe Card" },
            { value: "gcash_pending", label: "GCash" },
            { value: "cash_on_delivery", label: "Cash on Delivery" },
            { value: "refund", label: "Refunds" },
        ].map((opt) => `<option value="${opt.value}" ${filters.method === opt.value ? "selected" : ""}>${this.escapeHtml(opt.label)}</option>`).join("");

        const statusOptions = [
            { value: "all", label: "All Statuses" },
            { value: "paid", label: "Paid" },
            { value: "pending", label: "Pending" },
            { value: "failed", label: "Failed" },
            { value: "refunded", label: "Refunded" },
        ].map((opt) => `<option value="${opt.value}" ${filters.status === opt.value ? "selected" : ""}>${this.escapeHtml(opt.label)}</option>`).join("");

        const paymentRows = payments.map((p) => {
            const canReconcile = (p.status === "pending" || p.status === "failed") && p.order_status !== "cancelled" && p.method !== "refund";
            const canRefund = p.status === "paid" && p.method !== "refund" && p.order_payment_status !== "refunded";
            return `
            <tr>
                <td>
                    <code style="font-size: 0.78rem;">${this.escapeHtml(p.reference_number || "—")}</code>
                    <div class="admin-muted" style="font-size: 0.72rem; text-transform: uppercase;">${this.escapeHtml(p.gateway || "manual")}</div>
                </td>
                <td>
                    <button type="button" class="admin-order-link" onclick="adminApp.viewOrder('${this.escapeAttribute(p.order_number || "")}')">
                        #${this.escapeHtml(p.order_number || "—")}
                    </button>
                    <div class="admin-muted" style="font-size: 0.72rem;">Order: ${this.escapeHtml(p.order_status || "")}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(p.buyer_name || "Guest")}</strong>
                    <div class="admin-muted" style="font-size: 0.74rem;">${this.escapeHtml(p.buyer_email || "")}</div>
                </td>
                <td>${this.escapeHtml(formatMethodLabel(p.method))}</td>
                <td>${this.statusBadge(p.status)}</td>
                <td class="admin-td-numeric"><strong>${this.escapeHtml(this.formatCurrency(p.amount || 0))}</strong></td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(p.created_at))}</span></td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        ${canReconcile ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.handleReconcilePayment(${Number(p.id)})" ${disabled}>
                                ${p.gateway === "stripe" ? "Verify Stripe" : "Mark Paid"}
                            </button>
                        ` : ""}
                        ${canRefund ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-danger" onclick="adminApp.handleRefundPayment(${Number(p.id)}, '${this.escapeAttribute(p.order_number || "")}', ${Number(p.amount || 0)})" ${disabled}>
                                Refund
                            </button>
                        ` : ""}
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No payment transactions match your filters.", 8);

        return this.renderPageTemplate("payments", {
            kpiStrip,
            searchQuery: this.escapeAttribute(filters.q || ""),
            methodOptions,
            statusOptions,
            paymentCountLabel: `${payments.length} Transaction${payments.length === 1 ? "" : "s"}`,
            paymentRows,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderPaymentsPage = renderPaymentsPage;
})();
