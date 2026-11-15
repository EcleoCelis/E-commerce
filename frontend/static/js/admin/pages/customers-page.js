(function () {
    function renderCustomersPage() {
        const customers = this.state.customersList || [];
        const summary = this.state.customerSummary || {};
        const filters = this.state.customerFilters || { q: "", status: "all", sort: "recent" };
        const disabled = this.actionDisabledAttribute();

        const kpiStrip = `
            <div class="admin-metrics-grid" style="margin-bottom: 1.25rem;">
                <article class="admin-metric-card">
                    <span>Total Buyers</span>
                    <strong>${Number(summary.total_customers || customers.length)}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Registered marketplace accounts</span>
                </article>
                <article class="admin-metric-card">
                    <span>Active Accounts</span>
                    <strong>${Number(summary.active_customers || 0)}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Cleared for checkout &amp; returns</span>
                </article>
                <article class="admin-metric-card">
                    <span>Repeat Buyers</span>
                    <strong>${Number(summary.repeat_buyers || 0)}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">2+ placed orders</span>
                </article>
                <article class="admin-metric-card">
                    <span>Suspended</span>
                    <strong>${Number(summary.suspended_customers || 0)}</strong>
                    <span class="admin-muted" style="font-size: 0.76rem;">Blocked with sessions revoked</span>
                </article>
            </div>
        `;

        const statusOptions = [
            { value: "all", label: "All Account Statuses" },
            { value: "active", label: "Active" },
            { value: "disabled", label: "Suspended" },
            { value: "pending_verification", label: "Pending Verification" },
        ].map((opt) => `<option value="${opt.value}" ${filters.status === opt.value ? "selected" : ""}>${this.escapeHtml(opt.label)}</option>`).join("");

        const sortOptions = [
            { value: "recent", label: "Newest Accounts" },
            { value: "spend_desc", label: "Highest Lifetime Spend" },
            { value: "orders_desc", label: "Most Orders" },
            { value: "oldest", label: "Oldest Accounts" },
        ].map((opt) => `<option value="${opt.value}" ${filters.sort === opt.value ? "selected" : ""}>${this.escapeHtml(opt.label)}</option>`).join("");

        const customerRows = customers.map((cust) => {
            const isSuspended = cust.status === "disabled";
            const statusHtml = isSuspended
                ? '<span class="admin-pill-badge status-hidden"><span class="admin-pill-dot"></span>Suspended</span>'
                : this.statusBadge(cust.status || "active");
            const nextStatus = isSuspended ? "active" : "disabled";
            return `
            <tr>
                <td>
                    <strong>${this.escapeHtml(cust.name || cust.email)}</strong>
                    <div class="admin-muted" style="font-size: 0.76rem;">${this.escapeHtml(cust.email)}</div>
                </td>
                <td>
                    <div>${this.escapeHtml(cust.phone || "No phone on file")}</div>
                    <div class="admin-muted" style="font-size: 0.74rem;">${cust.email_verified ? "Email Verified" : "Unverified"} · ${Number(cust.active_session_count || 0)} active session${Number(cust.active_session_count || 0) === 1 ? "" : "s"}</div>
                </td>
                <td class="admin-td-numeric"><strong>${Number(cust.order_count || 0)}</strong></td>
                <td class="admin-td-numeric"><strong>${this.escapeHtml(this.formatCurrency(cust.lifetime_spend || 0))}</strong></td>
                <td>${statusHtml}</td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(cust.created_at))}</span></td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.viewCustomer(${Number(cust.id)})">Customer 360</button>
                        <button type="button" class="admin-button-secondary admin-btn-sm ${isSuspended ? "admin-btn-subtle-success" : "admin-btn-subtle-danger"}" onclick="adminApp.handleUpdateCustomerStatus(${Number(cust.id)}, '${nextStatus}')" ${disabled}>
                            ${isSuspended ? "Reactivate" : "Suspend"}
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No customer accounts match your filters.", 7);

        const customerDrawer = renderCustomerDrawer.call(this, this.state.currentCustomer, disabled);

        return this.renderPageTemplate("customers", {
            kpiStrip,
            searchQuery: this.escapeAttribute(filters.q || ""),
            statusOptions,
            sortOptions,
            customerCountLabel: `${customers.length} Customer${customers.length === 1 ? "" : "s"}`,
            customerRows,
            customerDrawer,
        });
    }

    function renderCustomerDrawer(customer, disabled) {
        if (!customer) return "";
        const isSuspended = customer.status === "disabled";
        const nextStatus = isSuspended ? "active" : "disabled";
        const addressesHtml = (customer.addresses || []).map((addr) => `
            <div style="padding: 0.6rem 0.75rem; border: 1px solid var(--admin-line); border-radius: 8px; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <strong>${this.escapeHtml(addr.label || addr.recipient_name)}</strong>
                    ${addr.is_default ? '<span class="admin-sku-pill">Default</span>' : ""}
                </div>
                <div class="admin-muted" style="font-size: 0.78rem; margin-top: 0.2rem;">
                    ${this.escapeHtml(addr.recipient_name)} · ${this.escapeHtml(addr.phone || "")}
                </div>
                <div style="font-size: 0.8rem; margin-top: 0.2rem;">
                    ${this.escapeHtml(`${addr.street_address}, ${addr.city}, ${addr.province} ${addr.postal_code}`)}
                </div>
            </div>
        `).join("") || '<p class="admin-muted" style="margin: 0;">No saved delivery addresses.</p>';

        const ordersHtml = (customer.orders || []).map((ord) => `
            <tr>
                <td>
                    <button type="button" class="admin-order-link" onclick="adminApp.closeCustomerDrawer(); adminApp.viewOrder('${this.escapeAttribute(ord.order_number)}')">#${this.escapeHtml(ord.order_number)}</button>
                </td>
                <td>${this.statusBadge(ord.status)}</td>
                <td>${this.statusBadge(ord.payment_status)}</td>
                <td class="admin-td-numeric"><strong>${this.escapeHtml(this.formatCurrency(ord.total || 0))}</strong></td>
            </tr>
        `).join("") || this.emptyTableRow("No orders placed yet.", 4);

        const returnsHtml = (customer.returns || []).length
            ? `<div class="admin-drawer-card">
                    <h4>Return History (${customer.returns.length})</h4>
                    <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.82rem;">
                        ${customer.returns.map((r) => `
                            <li style="margin-bottom: 0.35rem;">
                                <strong>#${this.escapeHtml(r.return_number)}</strong> (${this.escapeHtml(r.status)}) — ₱${Number(r.refund_amount || 0).toFixed(2)} · ${this.escapeHtml(r.reason)}
                            </li>
                        `).join("")}
                    </ul>
               </div>`
            : "";

        return `
            <div class="admin-drawer-backdrop active" onclick="adminApp.closeCustomerDrawer()"></div>
            <aside id="admin-customer-drawer" class="admin-order-drawer active" role="dialog" aria-modal="true" aria-labelledby="admin-customer-drawer-title">
                <div class="admin-drawer-header">
                    <div>
                        <span class="admin-eyebrow">CUSTOMER 360</span>
                        <h3 id="admin-customer-drawer-title">${this.escapeHtml(customer.name || customer.email)}</h3>
                        <p class="admin-muted" style="margin: 0.2rem 0 0; font-size: 0.8rem;">${this.escapeHtml(customer.email)}</p>
                    </div>
                    <button type="button" class="admin-modal-close" onclick="adminApp.closeCustomerDrawer()" aria-label="Close drawer">&times;</button>
                </div>
                <div class="admin-drawer-body">
                    <div class="admin-drawer-card" style="padding: 1rem;">
                        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
                            <div>
                                <div class="admin-muted" style="font-size: 0.75rem;">Lifetime Spend</div>
                                <strong style="font-size: 1.15rem;">${this.escapeHtml(this.formatCurrency(customer.lifetime_spend || 0))}</strong>
                                <span class="admin-muted" style="font-size: 0.78rem;">across ${Number(customer.order_count || 0)} order(s)</span>
                            </div>
                            <div class="admin-inline-actions">
                                <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.handleRevokeCustomerSessions(${Number(customer.id)})" ${disabled}>
                                    Revoke Sessions (${Number(customer.active_session_count || 0)})
                                </button>
                                <button type="button" class="admin-button-secondary admin-btn-sm ${isSuspended ? "admin-btn-subtle-success" : "admin-btn-subtle-danger"}" onclick="adminApp.handleUpdateCustomerStatus(${Number(customer.id)}, '${nextStatus}')" ${disabled}>
                                    ${isSuspended ? "Reactivate Account" : "Suspend Account"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="admin-drawer-card" style="padding: 1rem;">
                        <h4 style="margin-top: 0;">Saved Addresses (${(customer.addresses || []).length})</h4>
                        ${addressesHtml}
                    </div>

                    <div class="admin-drawer-card" style="padding: 1rem;">
                        <h4 style="margin-top: 0;">Recent Orders</h4>
                        <div class="admin-table-wrap">
                            <table class="admin-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Order</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Payment</th>
                                        <th scope="col" class="admin-th-numeric">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${ordersHtml}</tbody>
                            </table>
                        </div>
                    </div>

                    ${returnsHtml}
                </div>
            </aside>
        `;
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderCustomersPage = renderCustomersPage;
})();
