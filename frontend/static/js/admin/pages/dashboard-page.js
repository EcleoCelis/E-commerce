(function () {
    "use strict";

    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return "\u20B10.00";
        if (typeof amount === "object" && amount.amount !== undefined) {
            return `\u20B1${Number(amount.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return `\u20B1${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function formatCents(cents) {
        return `\u20B1${(Number(cents || 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function renderGrowthBadge(pct, status) {
        if (status === "up" && pct !== null && pct !== undefined) {
            return `<span class="analytics-delta is-up" title="Change vs previous equal period">&#9650; +${Number(pct).toFixed(1)}%</span>`;
        }
        if (status === "down" && pct !== null && pct !== undefined) {
            return `<span class="analytics-delta is-down" title="Change vs previous equal period">&#9660; ${Number(pct).toFixed(1)}%</span>`;
        }
        if (status === "flat") {
            return `<span class="analytics-delta is-flat" title="Unchanged vs previous equal period">0.0%</span>`;
        }
        if (status === "new_baseline") {
            return `<span class="analytics-delta is-flat" title="No prior baseline activity in preceding window">New</span>`;
        }
        return "";
    }

    function renderSkeletonCards() {
        return Array.from({ length: 6 }).map(() => `
            <article class="admin-metric-card analytics-skeleton-card" aria-hidden="true">
                <div class="analytics-skeleton-line is-short"></div>
                <div class="analytics-skeleton-line is-tall"></div>
                <div class="analytics-skeleton-line is-mid"></div>
            </article>
        `).join("");
    }

    function renderSkeletonChart(heightPx) {
        return `<div class="analytics-skeleton-chart" style="height:${heightPx}px" aria-hidden="true"></div>`;
    }

    function renderDashboardPage() {
        const kpis = this.state.dashboardKPIs;
        const isLoading = Boolean(this.state.dashboardLoading);
        const errorMessage = this.state.dashboardError;
        const summary = (kpis && kpis.summary) || {};
        const filters = this.state.dashboardFilters || { range: "all", start_date: "", end_date: "" };
        const currentRange = filters.range || "all";
        const chartMetric = this.state.dashboardChartMetric === "orders" ? "orders" : "revenue";

        if (window.AdminAnalyticsCharts?.bindTooltips) {
            window.AdminAnalyticsCharts.bindTooltips();
        }

        const lastUpdatedLabel = this.state.dashboardLastUpdated
            ? `Updated ${new Date(this.state.dashboardLastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : (isLoading ? "Syncing live data..." : "Live records");

        const customDateControls = currentRange === "custom" ? `
            <form class="analytics-custom-date-bar" onsubmit="adminApp.applyCustomDashboardRange(event)">
                <div class="analytics-date-field">
                    <label for="dashboard-start-date">From</label>
                    <input id="dashboard-start-date" name="start_date" type="date" value="${this.escapeAttribute(filters.start_date || "")}" required>
                </div>
                <div class="analytics-date-field">
                    <label for="dashboard-end-date">To</label>
                    <input id="dashboard-end-date" name="end_date" type="date" value="${this.escapeAttribute(filters.end_date || "")}" required>
                </div>
                <button type="submit" class="admin-btn-primary">Apply Date Range</button>
            </form>
        ` : "";

        const dashboardBanner = errorMessage ? `
            <div class="analytics-error-banner" role="alert">
                <div>
                    <strong>Unable to refresh analytics</strong>
                    <span>${this.escapeHtml(errorMessage)}</span>
                </div>
                <button type="button" onclick="adminApp.refreshDashboard()" class="admin-btn-action">Retry</button>
            </div>
        ` : "";

        const showInitialSkeleton = isLoading && !kpis;
        const charts = window.AdminAnalyticsCharts;

        let metricCards;
        if (showInitialSkeleton) {
            metricCards = renderSkeletonCards();
        } else {
            const lowStockCount = summary.low_stock_products ?? 0;
            const outOfStockCount = summary.out_of_stock_products ?? 0;
            const netRevCents = summary.net_revenue?.amount_cents ?? 0;
            const pendingColCents = summary.pending_collection?.amount_cents ?? 0;
            const refundedCents = summary.refunded_amount?.amount_cents ?? 0;
            const paidOrdersCount = summary.paid_orders ?? 0;
            const totalAccounts = summary.total_customers ?? 0;
            const fulfillmentRate = Number(summary.fulfillment_rate_pct ?? 0);
            const cancellationRate = Number(summary.cancellation_rate_pct ?? 0);

            const revFootnote = refundedCents > 0
                ? `${formatCurrency(summary.refunded_amount)} refunded`
                : (pendingColCents > 0
                    ? `${formatCurrency(summary.pending_collection)} pending`
                    : `Settled revenue`);

            const buyerFootnote = currentRange === "all"
                ? `${totalAccounts.toLocaleString()} ${totalAccounts === 1 ? "account" : "accounts"}`
                : `${summary.new_customers ?? 0} new · ${totalAccounts.toLocaleString()} total`;

            const metricDefs = [
                {
                    label: "Net Revenue",
                    tooltip: "Settled revenue from paid orders less refunds",
                    value: formatCurrency(summary.net_revenue),
                    delta: renderGrowthBadge(summary.revenue_growth_pct, summary.revenue_growth_status),
                    footnote: revFootnote,
                    tone: netRevCents > 0 ? "is-emerald" : "",
                },
                {
                    label: "Total Orders",
                    tooltip: "All orders recorded within the active date window",
                    value: (summary.total_orders ?? 0).toLocaleString(),
                    delta: renderGrowthBadge(summary.orders_growth_pct, summary.orders_growth_status),
                    footnote: `${paidOrdersCount} paid · ${summary.pending_orders ?? 0} open`,
                    tone: "is-blue",
                },
                {
                    label: "Avg. Order Value",
                    tooltip: "Gross paid revenue divided by qualified paid orders",
                    value: formatCurrency(summary.average_order_value),
                    delta: renderGrowthBadge(summary.aov_growth_pct, summary.aov_growth_status),
                    footnote: `${paidOrdersCount} paid ${paidOrdersCount === 1 ? "order" : "orders"}`,
                    tone: "",
                },
                {
                    label: "Delivery Rate",
                    tooltip: "Percentage of orders completed and delivered",
                    value: `${fulfillmentRate.toFixed(1)}%`,
                    delta: cancellationRate > 15
                        ? `<span class="analytics-delta is-down" title="${cancellationRate.toFixed(1)}% cancellation rate">${cancellationRate.toFixed(1)}% cancel</span>`
                        : "",
                    footnote: `${summary.completed_orders ?? 0} delivered · ${summary.cancelled_orders ?? 0} cancelled`,
                    tone: "",
                },
                {
                    label: "Active Buyers",
                    tooltip: "Distinct customers with orders in the selected window",
                    value: (summary.active_customers ?? 0).toLocaleString(),
                    delta: renderGrowthBadge(summary.customers_growth_pct, summary.customers_growth_status),
                    footnote: buyerFootnote,
                    tone: "",
                },
                {
                    label: "Inventory Value",
                    tooltip: lowStockCount > 0
                        ? `${lowStockCount} active items at <= 1 unit (${outOfStockCount} out of stock)`
                        : "Total valuation of active catalog inventory",
                    value: formatCurrency(summary.inventory_valuation),
                    delta: lowStockCount > 0
                        ? `<span class="analytics-delta is-warn" title="${lowStockCount} items at <= 1 unit (${outOfStockCount} at 0)">${lowStockCount} low</span>`
                        : `<span class="analytics-delta is-up">Healthy</span>`,
                    footnote: `${summary.available_products ?? 0} live · ${summary.sold_products ?? 0} sold`,
                    isWarning: lowStockCount > 0,
                },
            ];

            metricCards = metricDefs.map((m) => `
                <article class="admin-metric-card analytics-kpi-card ${m.isWarning ? "is-warning" : ""} ${m.tone || ""}" title="${this.escapeAttribute(m.tooltip || "")}">
                    <div class="admin-metric-header">
                        <span class="admin-metric-label">${m.label}</span>
                    </div>
                    <strong class="admin-metric-value">${m.value}</strong>
                    <div class="analytics-kpi-footer">
                        <span class="analytics-kpi-footnote">${m.footnote}</span>
                        ${m.delta}
                    </div>
                </article>
            `).join("");
        }

        // Section 3: Dynamic Revenue Trend vs Order Volume
        const granularityLabel = (kpis && kpis.series_granularity === "week") ? "Weekly totals" : "Daily totals";
        const trendTitle = chartMetric === "orders" ? "Order Volume" : "Revenue Trend";
        const trendSubtitle = chartMetric === "orders"
            ? `${granularityLabel} of total orders placed across the selected period`
            : `${granularityLabel} of net collected revenue (paid non-cancelled orders less refunds)`;

        const trendStatsStrip = showInitialSkeleton ? "" : `
            <div class="analytics-stats-strip">
                <div class="analytics-stat-chip">
                    <span>Net Collected</span>
                    <strong>${formatCurrency(summary.net_revenue)}</strong>
                </div>
                <div class="analytics-stat-chip">
                    <span>Ordered Value (Non-Cancelled)</span>
                    <strong>${formatCurrency(summary.ordered_merchandise)}</strong>
                </div>
                <div class="analytics-stat-chip">
                    <span>Pending Collection</span>
                    <strong>${formatCurrency(summary.pending_collection)}</strong>
                </div>
                <div class="analytics-stat-chip">
                    <span>Paid / Total Orders</span>
                    <strong>${(summary.paid_orders ?? 0).toLocaleString()} / ${(summary.total_orders ?? 0).toLocaleString()}</strong>
                </div>
            </div>
        `;

        const revenueTrendChart = showInitialSkeleton
            ? renderSkeletonChart(205)
            : charts.renderAreaLineChart({
                series: (kpis && kpis.revenue_series) || [],
                mode: chartMetric,
                formatMoney: formatCents,
                pendingCollectionCents: summary.pending_collection?.amount_cents || 0,
                emptyMessage: "Orders placed during the chosen date range will populate this visualization.",
            });

        // Section 4A: Order Status Distribution Donut
        const statusColors = {
            pending: "#d97706",
            confirmed: "#2563eb",
            processing: "#4f46e5",
            shipped: "#0891b2",
            delivered: "#059669",
            cancelled: "#dc2626",
        };
        const statusLabels = {
            pending: "Pending",
            confirmed: "Confirmed",
            processing: "Processing",
            shipped: "Shipped",
            delivered: "Delivered",
            cancelled: "Cancelled",
        };
        const statusMap = (kpis && kpis.orders_by_status) || {};
        const orderDonutSegments = Object.keys(statusLabels).map((key) => {
            const count = Number(statusMap[key] || 0);
            return {
                label: statusLabels[key],
                value: count,
                displayValue: `${count} ${count === 1 ? "order" : "orders"}`,
                metricLabel: "Orders",
                color: statusColors[key],
            };
        });
        const orderStatusDonut = showInitialSkeleton
            ? renderSkeletonChart(190)
            : charts.renderDonutChart({
                segments: orderDonutSegments,
                centerValue: (summary.total_orders ?? 0).toLocaleString(),
                centerLabel: "Total Orders",
                emptyMessage: "No orders recorded in this period.",
            });

        // Section 4B: Payment Methods & Collection (Stacked Status Breakdown)
        const paymentMethods = (kpis && kpis.payment_analytics) || [];
        const totalOrdersCount = Number(summary.total_orders || 0);
        const paidOrdersCount = Number(summary.paid_orders || 0);
        const paidShareLabel = totalOrdersCount > 0
            ? `${Math.round((paidOrdersCount / totalOrdersCount) * 100)}% Settled (${paidOrdersCount}/${totalOrdersCount})`
            : "0% Settled";

        const paymentMethodsChart = showInitialSkeleton
            ? renderSkeletonChart(190)
            : charts.renderPaymentBreakdown({
                methods: paymentMethods,
                formatMoney: formatCents,
                emptyMessage: "Payment method selections and collections will appear once orders are placed.",
            });

        // Section 5A: Top Ordered Products (Transparently distinguishes Ordered Value vs Collected)
        const topProductsItems = ((kpis && kpis.top_selling_products) || []).map((item) => {
            const orderedCents = item.ordered_value?.amount_cents ?? item.total_revenue?.amount_cents ?? 0;
            const collectedCents = item.collected_revenue?.amount_cents ?? 0;
            const units = Number(item.units_sold || 0);
            return {
                label: item.title,
                value: orderedCents > 0 ? orderedCents : units,
                displayValue: formatCents(orderedCents),
                secondaryText: `${units} ${units === 1 ? "unit" : "units"} ordered`,
                color: "#2563eb",
                tooltipRows: [
                    { label: "Ordered Value", value: formatCents(orderedCents) },
                    { label: "Collected (Paid)", value: formatCents(collectedCents) },
                    { label: "Units Ordered", value: `${units} (${item.paid_units ?? 0} paid)` },
                ],
            };
        });
        const topProductsChart = showInitialSkeleton
            ? renderSkeletonChart(190)
            : charts.renderHorizontalBarList({
                items: topProductsItems,
                metricLabel: "Ordered Value",
                emptyMessage: "No non-cancelled product orders recorded in this reporting window.",
            });

        // Section 5B: Category Sales Mix (Pie Chart)
        const catPalette = ["#4E4638", "#2563eb", "#0891b2", "#059669", "#8D7B63"];
        const topCategoriesSegments = ((kpis && kpis.top_categories) || []).map((cat, idx) => {
            const orderedCents = cat.ordered_value?.amount_cents ?? cat.total_revenue?.amount_cents ?? 0;
            const collectedCents = cat.collected_revenue?.amount_cents ?? 0;
            const units = Number(cat.units_sold || 0);
            return {
                label: cat.name,
                value: orderedCents > 0 ? orderedCents : units,
                displayValue: formatCents(orderedCents),
                secondaryText: `${units} ${units === 1 ? "unit" : "units"} ordered`,
                color: catPalette[idx % catPalette.length],
                tooltipRows: [
                    { label: "Ordered Value", value: formatCents(orderedCents) },
                    { label: "Collected (Paid)", value: formatCents(collectedCents) },
                    { label: "Units Ordered", value: `${units} (${cat.paid_units ?? 0} paid)` },
                ],
            };
        });
        const topCategoriesChart = showInitialSkeleton
            ? renderSkeletonChart(190)
            : charts.renderPieChart({
                segments: topCategoriesSegments,
                ariaLabel: "Category ordered value pie chart",
                emptyTitle: "No category order activity",
                emptyMessage: "No category order activity recorded in this reporting window.",
            });

        // Section 6A: Customer Acquisition & Retention
        const cust = (kpis && kpis.customer_analytics) || {};
        const activePurchasers = Number(cust.active_purchasers || 0);
        const firstTimeCount = Number(cust.first_time_buyers || 0);
        const returningCount = Number(cust.returning_buyers || 0);
        const retentionRate = Number(cust.returning_customer_rate_pct ?? 0);
        const retentionBadge = activePurchasers > 0
            ? `${retentionRate.toFixed(1)}% Repeat Share`
            : "No buyers in range";

        const customerSummaryPills = showInitialSkeleton ? "" : `
            <div class="analytics-customer-pills">
                <div class="analytics-mini-kpi">
                    <span>New Signups</span>
                    <strong>${(cust.new_customers ?? 0).toLocaleString()}</strong>
                </div>
                <div class="analytics-mini-kpi">
                    <span>First-time Buyers</span>
                    <strong>${firstTimeCount.toLocaleString()}</strong>
                </div>
                <div class="analytics-mini-kpi">
                    <span>Returning Buyers</span>
                    <strong>${returningCount.toLocaleString()}</strong>
                </div>
            </div>
        `;
        const customerAcquisitionChart = showInitialSkeleton
            ? renderSkeletonChart(150)
            : charts.renderVerticalBarChart({
                series: cust.registration_series || [],
                valueKey: "new_customers",
                labelKey: "label",
                seriesLabel: "New Buyer Signups",
                accentColor: "#0891b2",
                emptyMessage: "No new customer accounts created during this date range.",
            });

        // Section 6B: Operational Attention Queue
        const ops = (kpis && kpis.operational_insights) || {};
        const attentionItems = [
            {
                label: "Pending Fulfillment",
                count: ops.unfulfilled_orders ?? 0,
                hint: "Pending, confirmed, or packing orders",
                action: "adminApp.navigate('orders')",
                tone: (ops.unfulfilled_orders ?? 0) > 0 ? "is-attention" : "",
            },
            {
                label: "Low / Out of Stock",
                count: ops.low_stock_products ?? 0,
                hint: `${ops.out_of_stock_products ?? 0} completely out of stock`,
                action: "adminApp.navigate('products')",
                tone: (ops.low_stock_products ?? 0) > 0 ? "is-warning" : "",
            },
            {
                label: "Open Return Requests",
                count: ops.open_returns ?? 0,
                hint: "Requested or approved returns awaiting completion",
                action: "adminApp.navigate('returns')",
                tone: (ops.open_returns ?? 0) > 0 ? "is-warning" : "",
            },
            {
                label: "Failed Payments",
                count: ops.failed_payments ?? 0,
                hint: "Payment attempts needing customer follow-up",
                action: "adminApp.navigate('orders')",
                tone: (ops.failed_payments ?? 0) > 0 ? "is-danger" : "",
            },
            {
                label: "Open Support Tickets",
                count: ops.open_tickets ?? 0,
                hint: "Buyer inquiries open or in progress",
                action: "adminApp.navigate('support')",
                tone: (ops.open_tickets ?? 0) > 0 ? "is-attention" : "",
            },
            {
                label: "Flagged Product Reports",
                count: ops.open_reports ?? 0,
                hint: "Reports pending moderation review",
                action: "adminApp.navigate('moderation')",
                tone: (ops.open_reports ?? 0) > 0 ? "is-danger" : "",
            },
        ];
        const totalAttentionCount = attentionItems.reduce((acc, it) => acc + Number(it.count || 0), 0);
        const attentionTotalLabel = totalAttentionCount > 0
            ? `${totalAttentionCount} Open Items`
            : "All Clear";
        const attentionPillTone = totalAttentionCount > 0 ? "is-warn-pill" : "is-ok-pill";

        const operationalInsightsCards = showInitialSkeleton
            ? renderSkeletonChart(190)
            : attentionItems.map((item) => `
                <button type="button" onclick="${item.action}" class="analytics-ops-card ${item.tone}">
                    <div class="analytics-ops-top">
                        <span class="analytics-ops-label">${this.escapeHtml(item.label)}</span>
                        <strong class="analytics-ops-count">${Number(item.count).toLocaleString()}</strong>
                    </div>
                    <span class="analytics-ops-hint">${this.escapeHtml(item.hint)}</span>
                </button>
            `).join("");

        // Section 7: Preserved Actionable Tables
        const lowStockRows = ((kpis && kpis.low_stock_items) || []).map((p) => {
            const isOutOfStock = Number(p.quantity) === 0;
            const stockClass = isOutOfStock ? "is-out" : "is-low";
            const stockText = isOutOfStock ? "0 (Out of stock)" : `${p.quantity} unit left`;
            return `
            <tr>
                <td><strong class="admin-table-primary-text">${this.escapeHtml(p.title)}</strong></td>
                <td><span class="admin-muted">${this.escapeHtml(p.category || "Uncategorized")}</span></td>
                <td>${this.statusBadge(p.condition, this.conditionLabel(p.condition))}</td>
                <td class="admin-num-cell">${formatCurrency(p.price)}</td>
                <td class="admin-num-cell"><span class="admin-stock-pill ${stockClass}">${stockText}</span></td>
                <td style="text-align: right;">
                    <button type="button" onclick="adminApp.navigate('products').then(() => { if ('${this.escapeAttribute(p.slug || "")}') adminApp.openEditProductModal('${this.escapeAttribute(p.slug || "")}'); })" class="admin-btn-action">Manage Stock</button>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("All active inventory items have sufficient stock.", 6);

        const recentOrderRows = ((kpis && kpis.recent_orders) || []).slice(0, 6).map((o) => `
            <tr>
                <td>
                    <button type="button" onclick="adminApp.viewOrder('${this.escapeAttribute(o.order_number)}')" class="admin-order-link" title="View details for ${this.escapeAttribute(o.order_number)}">
                        ${this.escapeHtml(o.order_number)}
                    </button>
                </td>
                <td><strong>${this.escapeHtml(o.buyer?.name || "Guest")}</strong></td>
                <td><span class="admin-muted">${this.escapeHtml(o.placed_at ? new Date(o.placed_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : (o.created_at ? new Date(o.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "\u2014"))}</span></td>
                <td class="admin-num-cell"><strong>${formatCurrency(o.total)}</strong></td>
                <td>${this.statusBadge(o.status)}</td>
                <td>${this.statusBadge(o.payment_status)}</td>
            </tr>
        `).join("") || this.emptyTableRow("No orders placed yet.", 6);

        return this.renderPageTemplate("dashboard", {
            lastUpdatedLabel: this.escapeHtml(lastUpdatedLabel),
            rangeAllActive: currentRange === "all" ? "is-active" : "",
            rangeTodayActive: currentRange === "today" ? "is-active" : "",
            range7dActive: currentRange === "7d" ? "is-active" : "",
            range30dActive: currentRange === "30d" ? "is-active" : "",
            range90dActive: currentRange === "90d" ? "is-active" : "",
            rangeMonthActive: currentRange === "this_month" ? "is-active" : "",
            rangeCustomActive: currentRange === "custom" ? "is-active" : "",
            customDateControls,
            dashboardBanner,
            metricCards,
            trendTitle: this.escapeHtml(trendTitle),
            trendSubtitle: this.escapeHtml(trendSubtitle),
            metricRevActive: chartMetric === "revenue" ? "is-active" : "",
            metricOrdActive: chartMetric === "orders" ? "is-active" : "",
            trendStatsStrip,
            revenueTrendChart,
            orderStatusDonut,
            paidShareLabel: this.escapeHtml(paidShareLabel),
            paymentMethodsChart,
            topProductsChart,
            topCategoriesChart,
            retentionBadge: this.escapeHtml(retentionBadge),
            customerSummaryPills,
            customerAcquisitionChart,
            attentionTotalLabel: this.escapeHtml(attentionTotalLabel),
            attentionPillTone,
            operationalInsightsCards,
            lowStockRows,
            recentOrderRows,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderDashboardPage = renderDashboardPage;
})();
