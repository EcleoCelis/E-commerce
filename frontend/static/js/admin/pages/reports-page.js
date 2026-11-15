(function () {
    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return "₱0.00";
        if (typeof amount === "object" && amount.amount !== undefined) {
            return `₱${Number(amount.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return `₱${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function renderReportsPage() {
        const tab = this.state.reportsTab || "sales";
        const currentRange = this.state.reportsFilters?.range || "30d";

        const salesTabActive = tab === "sales" ? "is-active" : "";
        const inventoryTabActive = tab === "inventory" ? "is-active" : "";
        const dateFiltersVisibility = tab === "sales" ? "" : 'style="display: none;"';

        const rangeAllActive = currentRange === "all" ? "is-active" : "";
        const rangeTodayActive = currentRange === "today" ? "is-active" : "";
        const range7dActive = currentRange === "7d" ? "is-active" : "";
        const range30dActive = currentRange === "30d" ? "is-active" : "";
        const rangeMonthActive = currentRange === "this_month" ? "is-active" : "";
        const rangeCustomActive = currentRange === "custom" ? "is-active" : "";
        const startDateVal = this.escapeAttribute(this.state.reportsFilters?.start_date || "");
        const endDateVal = this.escapeAttribute(this.state.reportsFilters?.end_date || "");
        const customDateFilterBar = (tab === "sales" && currentRange === "custom") ? `
            <form class="admin-custom-date-bar" onsubmit="adminApp.applyReportsCustomRange(event)" style="display:flex;flex-wrap:wrap;gap:0.65rem;align-items:center;margin-top:0.85rem;padding-top:0.75rem;border-top:1px solid var(--admin-line);">
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--admin-muted);">
                    <span>From</span>
                    <input type="date" name="start_date" required value="${startDateVal}" class="admin-search-input" style="padding:0.35rem 0.6rem;width:auto;">
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--admin-muted);">
                    <span>To</span>
                    <input type="date" name="end_date" required value="${endDateVal}" class="admin-search-input" style="padding:0.35rem 0.6rem;width:auto;">
                </label>
                <button type="submit" class="admin-button-primary" style="padding:0.42rem 0.9rem;font-size:0.82rem;">Apply Range</button>
            </form>
        ` : "";

        let reportMetricCards = "";
        let reportMainContent = "";

        if (tab === "sales") {
            const sales = this.state.salesReport;
            const summary = sales?.summary || {};

            const cards = [
                ["Gross Revenue", formatCurrency(summary.gross_revenue)],
                ["Net Revenue", formatCurrency(summary.net_revenue)],
                ["Total Orders", summary.total_orders ?? 0],
                ["Units Sold", summary.total_units_sold ?? 0],
                ["Refunded", `${formatCurrency(summary.refunded)} (${summary.refunded_orders ?? 0})`],
                ["Cancelled", `${formatCurrency(summary.cancelled)} (${summary.cancelled_orders ?? 0})`],
            ];

            reportMetricCards = cards.map(([label, val]) => `
                <article class="admin-metric-card">
                    <span>${label}</span>
                    <strong>${val}</strong>
                </article>
            `).join("");

            const dailySalesRows = (sales?.daily_sales || []).map((row) => `
                <tr>
                    <td><strong>${this.escapeHtml(row.date)}</strong></td>
                    <td class="admin-num-cell">${row.orders_count}</td>
                    <td class="admin-num-cell">${row.units_sold}</td>
                    <td class="admin-num-cell"><strong>${formatCurrency(row.revenue)}</strong></td>
                </tr>
            `).join("") || this.emptyTableRow("No sales recorded in this period.", 4);

            const orderRows = (sales?.orders || []).slice(0, 50).map((o) => `
                <tr>
                    <td><button type="button" onclick="adminApp.viewOrder('${this.escapeAttribute(o.order_number)}')" class="admin-order-link">${this.escapeHtml(o.order_number)}</button></td>
                    <td>${this.escapeHtml(o.placed_at ? new Date(o.placed_at).toLocaleDateString() : (o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"))}</td>
                    <td><strong>${this.escapeHtml(o.buyer?.name || "Guest")}</strong></td>
                    <td class="admin-num-cell">${o.item_count || 1}</td>
                    <td class="admin-num-cell">${formatCurrency(o.subtotal)}</td>
                    <td class="admin-num-cell">${formatCurrency(o.shipping)}</td>
                    <td class="admin-num-cell"><strong>${formatCurrency(o.total)}</strong></td>
                    <td>${this.statusBadge(o.status)}</td>
                    <td>${this.statusBadge(o.payment_status)}</td>
                </tr>
            `).join("") || this.emptyTableRow("No order records found in this period.", 9);

            reportMainContent = `
                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>Daily Sales Breakdown</h3>
                        <span class="admin-muted">Aggregated performance by calendar day</span>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Date</th>
                                    <th scope="col" class="admin-num-cell">Orders</th>
                                    <th scope="col" class="admin-num-cell">Units Sold</th>
                                    <th scope="col" class="admin-num-cell">Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${dailySalesRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>Orders in Period</h3>
                        <span class="admin-muted">Detailed list of orders matching selected date range</span>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Order #</th>
                                    <th scope="col">Placed</th>
                                    <th scope="col">Buyer</th>
                                    <th scope="col" class="admin-num-cell">Items</th>
                                    <th scope="col" class="admin-num-cell">Subtotal</th>
                                    <th scope="col" class="admin-num-cell">Shipping</th>
                                    <th scope="col" class="admin-num-cell">Total</th>
                                    <th scope="col">Order Status</th>
                                    <th scope="col">Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            const inventory = this.state.inventoryReport;
            const summary = inventory?.summary || {};

            const cards = [
                ["Total SKUs", summary.total_skus ?? 0],
                ["Units in Stock", summary.total_units_in_stock ?? 0],
                ["Inventory Valuation", formatCurrency(summary.total_valuation)],
                ["Low Stock (<2)", summary.low_stock_count ?? 0],
            ];

            reportMetricCards = cards.map(([label, val]) => `
                <article class="admin-metric-card">
                    <span>${label}</span>
                    <strong>${val}</strong>
                </article>
            `).join("");

            const catRows = (inventory?.category_breakdown || []).map((cat) => `
                <tr>
                    <td><strong>${this.escapeHtml(cat.name)}</strong></td>
                    <td class="admin-num-cell">${cat.sku_count}</td>
                    <td class="admin-num-cell">${cat.stock_units}</td>
                    <td class="admin-num-cell"><strong>${formatCurrency(cat.valuation)}</strong></td>
                </tr>
            `).join("") || this.emptyTableRow("No category inventory data.", 4);

            const prodRows = (inventory?.products || []).slice(0, 100).map((p) => `
                <tr>
                    <td>
                        <strong>${this.escapeHtml(p.title)}</strong>
                    </td>
                    <td>${this.escapeHtml(p.category)}</td>
                    <td>${this.statusBadge(p.condition, this.conditionLabel(p.condition))}</td>
                    <td>${this.statusBadge(p.status)}</td>
                    <td class="admin-num-cell"><strong>${p.quantity}</strong></td>
                    <td class="admin-num-cell">${formatCurrency(p.price)}</td>
                    <td class="admin-num-cell"><strong>${formatCurrency(p.valuation)}</strong></td>
                </tr>
            `).join("") || this.emptyTableRow("No products found in inventory.", 7);

            reportMainContent = `
                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>Category Valuation Breakdown</h3>
                        <span class="admin-muted">Stock units and total valuation grouped by category</span>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Category</th>
                                    <th scope="col" class="admin-num-cell">SKU Count</th>
                                    <th scope="col" class="admin-num-cell">Total Units</th>
                                    <th scope="col" class="admin-num-cell">Valuation</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${catRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>Stock Itemization</h3>
                        <button type="button" onclick="adminApp.navigate('products')" class="admin-text-button">Manage Products</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Product</th>
                                    <th scope="col">Category</th>
                                    <th scope="col">Condition</th>
                                    <th scope="col">Status</th>
                                    <th scope="col" class="admin-num-cell">Quantity</th>
                                    <th scope="col" class="admin-num-cell">Unit Price</th>
                                    <th scope="col" class="admin-num-cell">Total Valuation</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${prodRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return this.renderPageTemplate("reports", {
            salesTabActive,
            inventoryTabActive,
            dateFiltersVisibility,
            rangeAllActive,
            rangeTodayActive,
            range7dActive,
            range30dActive,
            rangeMonthActive,
            rangeCustomActive,
            customDateFilterBar,
            reportMetricCards,
            reportMainContent,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderReportsPage = renderReportsPage;
})();

