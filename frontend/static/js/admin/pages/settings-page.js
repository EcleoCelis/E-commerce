(function () {
    function renderStoreConfigTab(config, disabled) {
        const enabledMethods = new Set(config.enabled_payment_methods || ["cash_on_delivery", "gcash_pending", "credit_debit_card"]);
        return `
            <div class="admin-panel" style="padding: 1.5rem; max-width: 820px;">
                <h3 style="margin: 0 0 0.25rem;">Storefront &amp; Checkout Configuration</h3>
                <p class="admin-muted" style="margin: 0 0 1.25rem;">Changes apply immediately to buyer checkout shipping fee calculations and available payment gateways.</p>
                <form onsubmit="adminApp.handleSaveStoreConfig(event)">
                    <div class="admin-form-grid">
                        <label class="admin-field">
                            <span>Store Name *</span>
                            <input type="text" name="store_name" required maxlength="80" value="${this.escapeAttribute(config.store_name || "SecondMarket")}">
                        </label>
                        <label class="admin-field">
                            <span>Support Contact Email *</span>
                            <input type="email" name="support_email" required value="${this.escapeAttribute(config.support_email || "support@secondmarket.local")}">
                        </label>
                        <label class="admin-field">
                            <span>Standard Shipping Fee (₱)</span>
                            <input type="number" step="0.01" min="0" name="standard_shipping_fee" required value="${this.escapeAttribute(Number(config.standard_shipping_fee ?? 45).toFixed(2))}">
                        </label>
                        <label class="admin-field">
                            <span>Free Shipping Threshold (₱)</span>
                            <input type="number" step="0.01" min="0" name="free_shipping_threshold" required value="${this.escapeAttribute(Number(config.free_shipping_threshold ?? 3000).toFixed(2))}">
                        </label>
                        <label class="admin-field">
                            <span>Low Stock Warning Threshold (Units)</span>
                            <input type="number" step="1" min="0" name="default_low_stock_threshold" required value="${this.escapeAttribute(String(config.default_low_stock_threshold ?? 2))}">
                        </label>
                        <label class="admin-field">
                            <span>Return Request Window (Days)</span>
                            <input type="number" step="1" min="1" name="return_window_days" required value="${this.escapeAttribute(String(config.return_window_days ?? 14))}">
                        </label>
                    </div>

                    <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--admin-line);">
                        <strong style="display: block; font-size: 0.86rem; margin-bottom: 0.65rem;">Enabled Checkout Payment Methods</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
                            <label style="display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; cursor: pointer;">
                                <input type="checkbox" name="enabled_payment_methods" value="cash_on_delivery" ${enabledMethods.has("cash_on_delivery") ? "checked" : ""}>
                                <span>Cash on Delivery (COD)</span>
                            </label>
                            <label style="display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; cursor: pointer;">
                                <input type="checkbox" name="enabled_payment_methods" value="gcash_pending" ${enabledMethods.has("gcash_pending") ? "checked" : ""}>
                                <span>GCash e-Wallet</span>
                            </label>
                            <label style="display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; cursor: pointer;">
                                <input type="checkbox" name="enabled_payment_methods" value="credit_debit_card" ${enabledMethods.has("credit_debit_card") ? "checked" : ""}>
                                <span>Credit / Debit Card (Stripe)</span>
                            </label>
                        </div>
                    </div>

                    <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end;">
                        <button type="submit" class="admin-button-primary" ${disabled}>Save Store Configuration</button>
                    </div>
                </form>
            </div>
        `;
    }

    function renderStaffRbacTab(staffData, disabled) {
        const staff = staffData?.staff || [];
        const roles = staffData?.roles || [];
        const roleOptions = roles.map((r) => `<option value="${this.escapeAttribute(r.role)}">${this.escapeHtml(r.label)}</option>`).join("");

        const staffRows = staff.map((member) => {
            const isSelf = Number(member.id) === Number(this.state.user?.id);
            return `
                <tr>
                    <td>
                        <strong>${this.escapeHtml(member.name)}</strong>
                        <div class="admin-muted" style="font-size: 0.76rem;">${this.escapeHtml(member.email)}</div>
                    </td>
                    <td><span class="admin-sku-pill">${this.escapeHtml(member.role)}</span></td>
                    <td><span class="admin-muted" style="font-size: 0.78rem;">${this.escapeHtml((member.capabilities || []).join(", "))}</span></td>
                    <td>${this.statusBadge(member.status || "active")}</td>
                    <td style="text-align: right;">
                        <select class="admin-select-pill" style="font-size: 0.78rem;" onchange="adminApp.handleUpdateStaffRole('${this.escapeAttribute(member.email)}', this.value)" ${isSelf || this.state.actionLoading ? "disabled" : ""} aria-label="Change role for ${this.escapeAttribute(member.email)}">
                            ${roles.map((r) => `<option value="${this.escapeAttribute(r.role)}" ${member.role === r.role ? "selected" : ""}>${this.escapeHtml(r.label)}</option>`).join("")}
                            <option value="buyer">Revoke Staff (Buyer Only)</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join("") || this.emptyTableRow("No staff accounts configured.", 5);

        return `
            <div class="admin-panel" style="padding: 1.25rem; margin-bottom: 1.25rem;">
                <h3 style="margin: 0 0 0.75rem; font-size: 0.95rem;">Add or Promote Staff Member</h3>
                <form class="admin-filter-bar" style="padding: 0; border: 0; box-shadow: none; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));" onsubmit="adminApp.handleSaveStaffMember(event)">
                    <label class="admin-field">
                        <span>Email Address *</span>
                        <input name="email" type="email" required placeholder="staff@secondmarket.test">
                    </label>
                    <label class="admin-field">
                        <span>First Name</span>
                        <input name="first_name" type="text" placeholder="First name">
                    </label>
                    <label class="admin-field">
                        <span>Last Name</span>
                        <input name="last_name" type="text" placeholder="Last name">
                    </label>
                    <label class="admin-field">
                        <span>Staff Role *</span>
                        <select name="role">${roleOptions}</select>
                    </label>
                    <label class="admin-field">
                        <span>Temp Password (if new)</span>
                        <input name="password" type="password" minlength="8" placeholder="Min 8 chars">
                    </label>
                    <div style="display: flex; align-items: flex-end;">
                        <button type="submit" class="admin-button-primary" ${disabled}>Assign Role</button>
                    </div>
                </form>
            </div>

            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h3>${staff.length} Staff Account${staff.length === 1 ? "" : "s"}</h3>
                    <button type="button" class="admin-text-button" onclick="adminApp.refreshSettings()">Refresh</button>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Staff Member</th>
                                <th scope="col">Assigned Role</th>
                                <th scope="col">Capabilities</th>
                                <th scope="col">Status</th>
                                <th scope="col" style="text-align: right;">Role Assignment</th>
                            </tr>
                        </thead>
                        <tbody>${staffRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderAuditLogTab(logs) {
        const rows = (logs || []).map((log) => `
            <tr>
                <td>
                    <strong>${this.escapeHtml(log.action)}</strong>
                    <div class="admin-muted" style="font-size: 0.74rem;">${this.escapeHtml(log.entity_type)}${log.entity_id ? ` #${this.escapeHtml(log.entity_id)}` : ""}</div>
                </td>
                <td>
                    <div>${this.escapeHtml(log.actor_email || "System")}</div>
                    <div class="admin-muted" style="font-size: 0.72rem;">${this.escapeHtml(log.actor_role || "")}</div>
                </td>
                <td>${this.escapeHtml(log.summary || "")}</td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(log.created_at))}</span></td>
            </tr>
        `).join("") || this.emptyTableRow("No administrative audit events recorded yet.", 4);

        return `
            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h3>Admin Activity Audit Trail</h3>
                    <button type="button" class="admin-text-button" onclick="adminApp.refreshSettings()">Refresh</button>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Action &amp; Target</th>
                                <th scope="col">Actor</th>
                                <th scope="col">Summary</th>
                                <th scope="col">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderSettingsPage() {
        const activeTab = this.state.settingsTab || "config";
        const disabled = this.actionDisabledAttribute();
        const tabs = [
            { id: "config", label: "Store Configuration" },
            { id: "staff", label: "Staff & Roles" },
            { id: "audit", label: "Audit Log" },
        ];
        const tabButtons = tabs.map((t) => `
            <button type="button" class="admin-pill-filter ${activeTab === t.id ? "is-active" : ""}" onclick="adminApp.setSettingsTab('${t.id}')">
                ${this.escapeHtml(t.label)}
            </button>
        `).join("");

        let tabContent = "";
        if (activeTab === "staff") {
            tabContent = renderStaffRbacTab.call(this, this.state.staffData || {}, disabled);
        } else if (activeTab === "audit") {
            tabContent = renderAuditLogTab.call(this, this.state.auditLogs || []);
        } else {
            tabContent = renderStoreConfigTab.call(this, this.state.storeConfig || {}, disabled);
        }

        return this.renderPageTemplate("settings", { tabButtons, tabContent });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderSettingsPage = renderSettingsPage;
})();
