class SecondMarketAdminApp {
    constructor() {
        this.state = {
            currentView: "dashboard",
            user: null,
            categories: [],
            products: [],
            orders: [],
            currentOrder: null,
            loading: true,
            actionLoading: false,
            error: "",
            productFilters: {
                q: "",
                status: "all",
                condition: "all",
                sort: "recent",
            },
            orderFilters: {
                q: "",
                status: "all",
                payment_status: "all",
                shipping_status: "all",
                fulfillment_status: "all",
                date_range: "all",
                sort: "recent",
            },
            moderationTab: "reports",
            moderationReports: [],
            moderationReviews: [],
            moderationReportFilters: {
                status: "all",
                reason: "all",
            },
            moderationReviewFilters: {
                status: "all",
            },
            reportsTab: "sales",
            dashboardKPIs: null,
            dashboardLoading: false,
            dashboardError: null,
            dashboardLastUpdated: null,
            dashboardChartMetric: "revenue",
            dashboardFilters: {
                range: "all",
                start_date: "",
                end_date: "",
            },
            salesReport: null,
            inventoryReport: null,
            reportsFilters: {
                range: "30d",
                start_date: "",
                end_date: "",
            },
            editingCategorySlug: null,
            selectedCategoryImageFile: null,
            productPageNumber: 1,
            productPageSize: 8,
            selectedProductSlugs: [],
            selectedOrderNumbers: [],
            editingProductSlug: null,
            productModalTab: "basic",
            productMediaList: [],
            productVariantsList: [],
            orderPageNumber: 1,
            orderPageSize: 10,
            shippingFormOpenForOrder: null,
            supportTickets: [],
            currentSupportTicket: null,
            supportStatusFilter: "all",
            returnsList: [],
            returnsStatusFilter: "all",
            couponsList: [],
            couponFilterActiveOnly: false,
            editingCouponId: null,
            currentCouponRedemptions: null,
            notifications: [],
            unreadNotificationsCount: 0,
            customersList: [],
            customerSummary: null,
            customerFilters: {
                q: "",
                status: "all",
                sort: "recent",
            },
            currentCustomer: null,
            paymentsList: [],
            paymentSummary: null,
            paymentFilters: {
                q: "",
                method: "all",
                status: "all",
            },
            settingsTab: "config",
            storeConfig: null,
            staffData: null,
            auditLogs: [],
        };

        this.templateCache = {};
        this.initTheme();
        this.init();
    }

    initTheme() {
        const saved = localStorage.getItem("sm_admin_theme") || localStorage.getItem("sm_theme_preference") || "light";
        const resolved = saved === "system"
            ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : saved;
        document.documentElement.setAttribute("data-theme", resolved);
    }

    toggleAdminTheme() {
        const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("sm_admin_theme", next);
        const btn = document.getElementById("admin-theme-toggle-btn");
        if (btn) {
            btn.title = next === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
            btn.setAttribute("aria-label", btn.title);
        }
        this.showToast(`Switched to ${next === "dark" ? "Dark" : "Light"} mode.`);
    }

    async init() {
        const hash = (window.location.hash || "").replace("#", "").trim();
        const validViews = ["dashboard", "products", "categories", "orders", "customers", "payments", "moderation", "reports", "support", "returns", "coupons", "settings"];
        if (hash && validViews.includes(hash)) {
            this.state.currentView = hash;
        }
        this.render();
        await this.loadCurrentUser();
        if (this.isStaffUser(this.state.user)) {
            await this.refreshInventory();
        }
    }

    isStaffUser(user) {
        if (!user) return false;
        return Boolean(user.is_staff || ["admin", "catalog_manager", "fulfillment_staff", "support_agent"].includes(user.role));
    }

    hasCapability(viewName) {
        const user = this.state.user;
        if (!user) return false;
        if (user.role === "admin") return true;
        const caps = Array.isArray(user.capabilities) ? user.capabilities : [];
        return caps.includes(viewName);
    }

    async loadCurrentUser() {
        try {
            const payload = await window.SecondMarketAuthAPI.me();
            this.state.user = payload.data.authenticated ? payload.data.user : null;
        } catch (error) {
            this.state.user = null;
        }
        this.render();
    }

    async refreshInventory() {
        if (!window.SecondMarketAdminAPI) {
            this.state.error = "The admin API client is unavailable.";
            this.state.loading = false;
            this.render();
            return;
        }

        this.state.loading = true;
        this.state.error = "";
        this.render();

        try {
            if (this.state.user?.role === "admin" && window.SecondMarketAdminAPI?.getStoreSettings) {
                try {
                    this.state.storeConfig = await window.SecondMarketAdminAPI.getStoreSettings();
                } catch (_) {}
            }
            const [categories, productResult] = await Promise.all([
                window.SecondMarketAdminAPI.listCategories(),
                window.SecondMarketAdminAPI.listProducts(this.productQueryParams()),
            ]);
            this.state.categories = categories;
            this.state.products = productResult.products;
            if (window.SecondMarketAdminAPI.listOrders) {
                const orderResult = await window.SecondMarketAdminAPI.listOrders(this.orderQueryParams());
                this.state.orders = orderResult.orders;
            }
            if (window.SecondMarketAdminAPI.listReviews) {
                const [reviewsResult, reportsResult] = await Promise.all([
                    window.SecondMarketAdminAPI.listReviews(this.reviewQueryParams()),
                    window.SecondMarketAdminAPI.listReports(this.reportQueryParams()),
                ]);
                this.state.moderationReviews = reviewsResult.reviews;
                this.state.moderationReports = reportsResult.reports;
            }
            if (window.SecondMarketAdminAPI.getDashboardKPIs) {
                this.state.dashboardKPIs = await window.SecondMarketAdminAPI.getDashboardKPIs(this.state.dashboardFilters);
            }
            if (window.SecondMarketAdminAPI.listSupportTickets) {
                try {
                    const supportRes = await window.SecondMarketAdminAPI.listSupportTickets({
                        status: this.state.supportStatusFilter !== "all" ? this.state.supportStatusFilter : undefined,
                    });
                    this.state.supportTickets = supportRes?.tickets || [];
                } catch (e) {}
            }
            if (window.SecondMarketAdminAPI.listReturns) {
                try {
                    const returnsRes = await window.SecondMarketAdminAPI.listReturns({
                        status: this.state.returnsStatusFilter !== "all" ? this.state.returnsStatusFilter : undefined,
                    });
                    this.state.returnsList = returnsRes?.returns || [];
                } catch (e) {}
            }
            if (window.SecondMarketAdminAPI.listCoupons) {
                try {
                    this.state.couponsList = await window.SecondMarketAdminAPI.listCoupons(this.state.couponFilterActiveOnly);
                } catch (e) {}
            }
            await this.refreshNotifications();
        } catch (error) {
            this.state.error = window.SecondMarketAdminAPI.formatError(error);
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    getOpenMainModal() {
        return Array.from(document.querySelectorAll('#admin-main-content .admin-modal, #admin-main-content [role="dialog"]'))
            .find((el) => el.style.display === "flex" || el.classList.contains("is-open")) || null;
    }

    flushDeferredRender() {
        if (this.state.deferredRender) {
            this.state.deferredRender = false;
            this.render();
        }
    }

    setActionLoading(isLoading) {
        this.state.actionLoading = isLoading;
        const activeModal = this.getOpenMainModal();
        if (activeModal) {
            activeModal.querySelectorAll("button[type='submit'], [data-admin-action]").forEach((el) => {
                el.disabled = Boolean(isLoading);
            });
            return;
        }
        this.render();
    }

    actionDisabledAttribute() {
        return this.state.actionLoading ? "disabled" : "";
    }

    parseNonNegativeInteger(value, fieldLabel) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
            throw new Error(`${fieldLabel} must be a non-negative whole number.`);
        }
        return parsed;
    }

    productQueryParams() {
        return {
            q: this.state.productFilters.q,
            category: (this.state.productFilters.category_slug && this.state.productFilters.category_slug !== "all") ? this.state.productFilters.category_slug : undefined,
            status: this.state.productFilters.status,
            condition: this.state.productFilters.condition,
            sort: this.state.productFilters.sort,
        };
    }

    orderQueryParams() {
        return {
            q: this.state.orderFilters.q,
            status: this.state.orderFilters.status,
            payment_status: this.state.orderFilters.payment_status,
            shipping_status: this.state.orderFilters.shipping_status,
            fulfillment_status: this.state.orderFilters.fulfillment_status,
            date_range: this.state.orderFilters.date_range,
            sort: this.state.orderFilters.sort,
        };
    }

    applyProductFilters(event) {
        if (event && event.preventDefault) event.preventDefault();
        const formEl = event && event.currentTarget ? event.currentTarget : document.querySelector(".admin-saas-filter-bar");
        if (formEl) {
            const form = new FormData(formEl);
            this.state.productFilters = {
                q: (form.get("q") || "").toString().trim(),
                category_slug: (form.get("category_slug") || this.state.productFilters?.category_slug || "all").toString(),
                status: (form.get("status") || this.state.productFilters?.status || "all").toString(),
                stock_level: (form.get("stock_level") || this.state.productFilters?.stock_level || "all").toString(),
                condition: (form.get("condition") || this.state.productFilters?.condition || "all").toString(),
                sort: (form.get("sort") || this.state.productFilters?.sort || "recent").toString(),
            };
        }
        this.state.productPageNumber = 1;
        this.refreshInventory();
    }

    resetProductFilters() {
        this.state.productFilters = { q: "", category_slug: "all", status: "all", stock_level: "all", condition: "all", sort: "recent" };
        this.state.productPageNumber = 1;
        this.refreshInventory();
    }

    applyOrderFilters(event) {
        if (event && event.preventDefault) event.preventDefault();
        const formEl = event && event.currentTarget ? event.currentTarget : document.getElementById("admin-orders-filter-form");
        if (formEl) {
            const form = new FormData(formEl);
            this.state.orderFilters = {
                q: (form.get("q") || "").toString().trim(),
                status: (form.get("status") || "all").toString(),
                payment_status: (form.get("payment_status") || "all").toString(),
                shipping_status: (form.get("shipping_status") || "all").toString(),
                fulfillment_status: (form.get("fulfillment_status") || "all").toString(),
                date_range: (form.get("date_range") || "all").toString(),
                sort: (form.get("sort") || "recent").toString(),
            };
        }
        this.state.currentOrder = null;
        this.state.orderPageNumber = 1;
        this.refreshInventory();
    }

    resetOrderFilters() {
        this.state.orderFilters = {
            q: "",
            status: "all",
            payment_status: "all",
            shipping_status: "all",
            fulfillment_status: "all",
            date_range: "all",
            sort: "recent",
        };
        this.state.currentOrder = null;
        this.state.orderPageNumber = 1;
        this.refreshInventory();
    }

    setOrderPage(page) {
        this.state.orderPageNumber = Math.max(1, parseInt(page, 10) || 1);
        this.render();
    }

    debounceOrderSearch(query) {
        if (this._orderSearchTimer) clearTimeout(this._orderSearchTimer);
        this.state.orderFilters.q = (query || "").toString().trim();
        this._orderSearchTimer = setTimeout(() => {
            this.refreshInventory();
        }, 300);
    }

    reportQueryParams() {
        return {
            status: this.state.moderationReportFilters.status,
            reason: this.state.moderationReportFilters.reason,
        };
    }

    reviewQueryParams() {
        return {
            status: this.state.moderationReviewFilters.status,
        };
    }

    setModerationTab(tab) {
        this.state.moderationTab = tab;
        this.render();
    }

    async refreshModeration() {
        if (!window.SecondMarketAdminAPI) return;
        try {
            this.setActionLoading(true);
            const [reviewsResult, reportsResult] = await Promise.all([
                window.SecondMarketAdminAPI.listReviews(this.reviewQueryParams()),
                window.SecondMarketAdminAPI.listReports(this.reportQueryParams()),
            ]);
            this.state.moderationReviews = reviewsResult.reviews;
            this.state.moderationReports = reportsResult.reports;
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    applyReportFilters(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        this.state.moderationReportFilters = {
            status: (form.get("status") || "all").toString(),
            reason: (form.get("reason") || "all").toString(),
        };
        this.refreshModeration();
    }

    resetReportFilters() {
        this.state.moderationReportFilters = { status: "all", reason: "all" };
        this.refreshModeration();
    }

    applyReviewFilters(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        this.state.moderationReviewFilters = {
            status: (form.get("status") || "all").toString(),
        };
        this.refreshModeration();
    }

    resetReviewFilters() {
        this.state.moderationReviewFilters = { status: "all" };
        this.refreshModeration();
    }

    async setDashboardRange(range) {
        this.state.dashboardFilters.range = range;
        if (range !== "custom") {
            this.state.dashboardFilters.start_date = "";
            this.state.dashboardFilters.end_date = "";
            await this.refreshDashboard();
            return;
        }
        this.render();
        if (this.state.dashboardFilters.start_date && this.state.dashboardFilters.end_date) {
            await this.refreshDashboard();
        }
    }

    async applyCustomDashboardRange(event) {
        if (event && event.preventDefault) event.preventDefault();
        const form = new FormData(event.currentTarget);
        const startDate = (form.get("start_date") || "").toString().trim();
        const endDate = (form.get("end_date") || "").toString().trim();
        if (!startDate || !endDate) {
            this.showToast("Please select both a start date and an end date.", "error");
            return;
        }
        if (startDate > endDate) {
            this.showToast("Start date must be on or before end date.", "error");
            return;
        }
        this.state.dashboardFilters = {
            range: "custom",
            start_date: startDate,
            end_date: endDate,
        };
        await this.refreshDashboard();
    }

    setRevenueChartMetric(metric) {
        this.state.dashboardChartMetric = metric === "orders" ? "orders" : "revenue";
        this.render();
    }

    async refreshDashboard() {
        if (!window.SecondMarketAdminAPI?.getDashboardKPIs) return;
        const requestToken = (this._dashboardRequestToken || 0) + 1;
        this._dashboardRequestToken = requestToken;
        this.state.dashboardLoading = true;
        this.state.dashboardError = null;
        this.render();

        const params = { range: this.state.dashboardFilters.range || "all" };
        if (params.range === "custom") {
            if (this.state.dashboardFilters.start_date) params.start_date = this.state.dashboardFilters.start_date;
            if (this.state.dashboardFilters.end_date) params.end_date = this.state.dashboardFilters.end_date;
        }

        try {
            const payload = await window.SecondMarketAdminAPI.getDashboardKPIs(params);
            if (this._dashboardRequestToken !== requestToken) return;
            this.state.dashboardKPIs = payload;
            this.state.dashboardError = null;
            this.state.dashboardLastUpdated = new Date().toISOString();
        } catch (error) {
            if (this._dashboardRequestToken !== requestToken) return;
            const message = window.SecondMarketAdminAPI.formatError(error);
            this.state.dashboardError = message;
            this.showToast(message, "error");
        } finally {
            if (this._dashboardRequestToken === requestToken) {
                this.state.dashboardLoading = false;
                this.render();
            }
        }
    }

    async setReportsTab(tab) {
        this.state.reportsTab = tab;
        this.render();
        if (tab === "inventory" && !this.state.inventoryReport) {
            await this.refreshReports();
        } else if (tab === "sales" && !this.state.salesReport) {
            await this.refreshReports();
        }
    }

    async setReportsRange(range) {
        this.state.reportsFilters = this.state.reportsFilters || {};
        this.state.reportsFilters.range = range;
        if (range === "custom") {
            const today = new Date().toISOString().slice(0, 10);
            const past = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
            if (!this.state.reportsFilters.start_date) this.state.reportsFilters.start_date = past;
            if (!this.state.reportsFilters.end_date) this.state.reportsFilters.end_date = today;
            this.render();
            return;
        }
        await this.refreshReports();
    }

    async applyReportsCustomRange(event) {
        if (event && event.preventDefault) event.preventDefault();
        const form = event?.currentTarget ? new FormData(event.currentTarget) : null;
        const startDate = (form?.get("start_date") || "").toString().trim();
        const endDate = (form?.get("end_date") || "").toString().trim();
        if (!startDate || !endDate) {
            this.showToast("Please select both start and end dates.", "error");
            return;
        }
        if (startDate > endDate) {
            this.showToast("Start date cannot be after end date.", "error");
            return;
        }
        this.state.reportsFilters = {
            range: "custom",
            start_date: startDate,
            end_date: endDate,
        };
        await this.refreshReports();
    }

    async refreshReports() {
        if (!window.SecondMarketAdminAPI) return;
        try {
            this.setActionLoading(true);
            const [sales, inventory] = await Promise.all([
                window.SecondMarketAdminAPI.getSalesReport(this.state.reportsFilters),
                window.SecondMarketAdminAPI.getInventoryReport(),
            ]);
            this.state.salesReport = sales;
            this.state.inventoryReport = inventory;
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    downloadExport(exportType) {
        if (!window.SecondMarketAdminAPI?.getExportUrl) return;
        const filters = exportType === "sales" ? this.state.reportsFilters : {};
        const url = window.SecondMarketAdminAPI.getExportUrl(exportType, filters);
        window.open(url, "_blank");
    }

    async setReportStatus(reportId, status) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateReportStatus(reportId, status);
            this.showToast(`Product report status updated to ${status}.`);
            await this.refreshModeration();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setReviewStatus(reviewId, status) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateReviewStatus(reviewId, status);
            this.showToast(`Review status updated to ${status}.`);
            await this.refreshModeration();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }


    async loadAdminOrder(orderNumber) {
        if (!window.SecondMarketAdminAPI?.getOrder) return;

        try {
            this.setActionLoading(true);
            this.state.currentOrder = await window.SecondMarketAdminAPI.getOrder(orderNumber);
            this.render();
            document.getElementById("admin-order-detail")?.focus();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async viewOrder(orderNumber) {
        await this.navigate("orders");
        await this.loadAdminOrder(orderNumber);
    }

    closeOrderDetailDrawer() {
        this.state.currentOrder = null;
        this.render();
    }

    async refreshOrdersOnly() {
        if (!window.SecondMarketAdminAPI?.listOrders) return;
        try {
            const orderResult = await window.SecondMarketAdminAPI.listOrders(this.orderQueryParams());
            this.state.orders = orderResult.orders;
            this.render();
        } catch (e) {
            console.error("Failed to refresh orders:", e);
        }
    }

    async markOrderAsPacking(orderNumber) {
        if (this.state.actionLoading) return;
        const current = this.state.currentOrder || (this.state.orders || []).find(o => o.order_number === orderNumber);
        const payload = {
            shipping_status: "ready",
        };
        if (current && current.status === "pending") {
            payload.order_status = "confirmed";
        } else if (current && current.status === "confirmed") {
            payload.order_status = "processing";
        }

        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, payload);
            this.state.currentOrder = updated;
            this.showToast("Order marked as packing and ready for shipment.");
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async markOrderAsPaid(orderNumber) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, {
                payment_status: "paid",
            });
            this.state.currentOrder = updated;
            this.showToast("Payment status marked as Paid.");
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async promptOrderShipping(orderNumber) {
        if (this.state.actionLoading) return;
        if (this.state.shippingFormOpenForOrder === orderNumber) {
            this.state.shippingFormOpenForOrder = null;
            this.render();
            return;
        }
        this.state.shippingFormOpenForOrder = orderNumber;
        this.render();
        setTimeout(() => {
            const input = document.getElementById("admin-inline-tracking-input");
            if (input) {
                input.focus();
                input.select();
            }
        }, 40);
    }

    cancelOrderShippingForm() {
        this.state.shippingFormOpenForOrder = null;
        this.render();
    }

    async submitOrderShippingForm(event, orderNumber) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = event?.currentTarget ? new FormData(event.currentTarget) : null;
        const carrier = (form?.get("carrier") || "").toString().trim();
        const rawTracking = (form?.get("tracking_number") || "").toString().trim();
        const trackingUrl = (form?.get("tracking_url") || "").toString().trim();
        if (!rawTracking) {
            this.showToast("Please enter a valid carrier tracking number.", "error");
            return;
        }

        const payload = {
            order_status: "shipped",
            shipping_status: "shipped",
            tracking_number: rawTracking,
        };
        if (carrier) {
            payload.carrier = carrier;
        }
        if (trackingUrl) {
            payload.tracking_url = trackingUrl;
        }

        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, payload);
            this.state.currentOrder = updated;
            this.state.shippingFormOpenForOrder = null;
            this.showToast("Order marked as shipped with tracking number.");
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async saveOrderAdminNotes(event, orderNumber) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = event?.currentTarget ? new FormData(event.currentTarget) : null;
        const notes = (form?.get("admin_notes") ?? "").toString();
        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, {
                admin_notes: notes,
            });
            this.state.currentOrder = updated;
            this.showToast("Internal staff notes saved.");
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    toggleSelectOrderRow(checkbox, orderNumber) {
        const selected = new Set(this.state.selectedOrderNumbers || []);
        if (checkbox.checked) {
            selected.add(orderNumber);
        } else {
            selected.delete(orderNumber);
        }
        this.state.selectedOrderNumbers = Array.from(selected);
        this.render();
    }

    toggleSelectAllOrders(masterCheckbox) {
        const checkboxes = document.querySelectorAll(".admin-orders-table .admin-row-checkbox");
        const selected = new Set(this.state.selectedOrderNumbers || []);
        checkboxes.forEach((cb) => {
            cb.checked = masterCheckbox.checked;
            const orderNum = cb.dataset.orderNumber;
            if (orderNum) {
                if (masterCheckbox.checked) selected.add(orderNum);
                else selected.delete(orderNum);
            }
        });
        this.state.selectedOrderNumbers = Array.from(selected);
        this.render();
    }

    clearOrderSelection() {
        this.state.selectedOrderNumbers = [];
        this.render();
    }

    async executeBulkOrdersAction(action) {
        const orderNumbers = this.state.selectedOrderNumbers || [];
        if (!orderNumbers.length || this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            const result = await window.SecondMarketAdminAPI.bulkOrdersAction(orderNumbers, action);
            this.state.selectedOrderNumbers = [];
            const skippedCount = (result.skipped || []).length;
            if (skippedCount > 0 && result.updated_count === 0) {
                this.showToast(result.skipped[0]?.reason || "No selected orders could be transitioned.", "error");
            } else {
                const suffix = skippedCount ? ` (${skippedCount} skipped)` : "";
                this.showToast(`Updated ${result.updated_count} order(s)${suffix}.`);
            }
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async markOrderAsDelivered(orderNumber) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, {
                order_status: "delivered",
                shipping_status: "delivered",
            });
            this.state.currentOrder = updated;
            this.showToast("Order marked as delivered.");
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async confirmCancelOrder(orderNumber) {
        if (this.state.actionLoading) return;
        const confirmed = window.confirm("Are you sure you want to cancel this order? This will cancel the order and return inventory.");
        if (!confirmed) return;

        try {
            this.setActionLoading(true);
            const updated = await window.SecondMarketAdminAPI.updateOrderFulfillment(orderNumber, {
                order_status: "cancelled",
            });
            this.state.currentOrder = updated;
            this.showToast("Order cancelled and inventory restored.");
            await this.refreshOrdersOnly();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    exportOrdersCSV() {
        if (!window.SecondMarketAdminAPI?.getExportUrl) return;
        const url = window.SecondMarketAdminAPI.getExportUrl("orders", this.orderQueryParams());
        window.location.href = url;
    }

    async printPackingSlip(orderNumber) {
        let order = this.state.currentOrder && this.state.currentOrder.order_number === orderNumber
            ? this.state.currentOrder
            : null;

        if (!order && window.SecondMarketAdminAPI?.getOrder) {
            try {
                this.setActionLoading(true);
                order = await window.SecondMarketAdminAPI.getOrder(orderNumber);
            } catch (err) {
                this.showToast("Could not load order for packing slip.", "error");
                return;
            } finally {
                this.setActionLoading(false);
            }
        }

        if (!order) {
            this.showToast("Order not found.", "error");
            return;
        }

        const itemsRows = (order.items || []).map(item => `
            <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">
                    <strong>${this.escapeHtml(item.product_title)}</strong>
                    ${item.sku ? `<div style="font-size: 12px; color: #64748b;">SKU: ${this.escapeHtml(item.sku)}</div>` : ''}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: center;">
                    ${this.escapeHtml(item.quantity)}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right;">
                    ${this.formatPrice(item.unit_price)}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; font-weight: 600;">
                    ${this.formatPrice(item.line_total)}
                </td>
            </tr>
        `).join("");

        const ship = order.shipping_record || {};
        const printWindow = window.open("", "_blank", "width=850,height=900");
        if (!printWindow) {
            this.showToast("Please allow pop-ups to print packing slips.", "error");
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Packing Slip - #${this.escapeHtml(order.order_number)}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; line-height: 1.5; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px; }
                    .brand { font-size: 24px; font-weight: 800; color: #4338ca; letter-spacing: -0.5px; }
                    .title { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
                    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
                    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 13px; }
                    .box h4 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                    th { background: #f1f5f9; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; color: #475569; }
                    .totals { width: 280px; margin-left: auto; margin-bottom: 30px; font-size: 14px; }
                    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; color: #475569; }
                    .totals-row.grand { border-top: 2px solid #e2e8f0; font-weight: 800; font-size: 16px; color: #4338ca; padding-top: 10px; margin-top: 6px; }
                    .footer { text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 40px; }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="brand">SecondMarket</div>
                        <div class="subtitle">Sustainable Secondhand Goods Marketplace</div>
                    </div>
                    <div style="text-align: right;">
                        <h2 class="title">PACKING SLIP</h2>
                        <div class="subtitle">Order #${this.escapeHtml(order.order_number)}</div>
                        <div class="subtitle">Date: ${this.escapeHtml(this.formatDate(order.placed_at || order.created_at))}</div>
                    </div>
                </div>

                <div class="grid">
                    <div class="box">
                        <h4>Recipient &amp; Delivery Address</h4>
                        <strong>${this.escapeHtml(ship.recipient_name || order.buyer?.name || "Customer")}</strong><br>
                        ${this.escapeHtml(ship.address_line1 || "")}${ship.address_line2 ? `, ${this.escapeHtml(ship.address_line2)}` : ""}<br>
                        ${this.escapeHtml(ship.city || "")}${ship.province ? `, ${this.escapeHtml(ship.province)}` : ""} ${this.escapeHtml(ship.postal_code || "")}<br>
                        ${this.escapeHtml(ship.country || "Philippines")}<br>
                        Phone: ${this.escapeHtml(ship.phone || "—")}
                    </div>
                    <div class="box">
                        <h4>Order &amp; Payment Details</h4>
                        <strong>Order Status:</strong> ${this.escapeHtml((order.status || "").toUpperCase())}<br>
                        <strong>Payment Status:</strong> ${this.escapeHtml((order.payment_status || "").toUpperCase())}<br>
                        <strong>Shipping Status:</strong> ${this.escapeHtml((order.shipping_status || "").toUpperCase())}<br>
                        ${ship.tracking_number ? `<strong>Tracking #:</strong> ${this.escapeHtml(ship.tracking_number)}<br>` : ""}
                        <strong>Customer:</strong> ${this.escapeHtml(order.buyer?.email || "—")}
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Unit Price</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="totals-row">
                        <span>Subtotal:</span>
                        <span>${this.formatPrice(order.subtotal || order.total)}</span>
                    </div>
                    <div class="totals-row">
                        <span>Shipping:</span>
                        <span>${order.shipping && order.shipping.amount_cents > 0 ? this.formatPrice(order.shipping) : '₱0.00'}</span>
                    </div>
                    <div class="totals-row grand">
                        <span>Total:</span>
                        <span>${this.formatPrice(order.total)}</span>
                    </div>
                </div>

                <div class="footer">
                    <p>Thank you for shopping secondhand and supporting sustainable reuse with SecondMarket!</p>
                </div>

                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    }

    async setProductStatus(productSlug, status) {
        if (this.state.actionLoading) return;

        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateProductStatus(productSlug, status);
            this.showToast("Product status updated.");
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setProductQuantity(event, productSlug) {
        event.preventDefault();
        if (this.state.actionLoading) return;

        const form = new FormData(event.currentTarget);
        let quantity;

        try {
            quantity = this.parseNonNegativeInteger(form.get("quantity"), "Quantity");
        } catch (error) {
            this.showToast(error.message, "error");
            return;
        }

        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateProductInventory(productSlug, quantity);
            this.showToast("Product inventory updated.");
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    setProductStockFilter(stockLevel) {
        this.state.productFilters = this.state.productFilters || {};
        this.state.productFilters.stock_level = stockLevel || "all";
        this.state.productPageNumber = 1;
        this.render();
    }

    async openProductMovementsModal(productSlug) {
        const modal = document.getElementById("admin-stock-movements-modal");
        const body = document.getElementById("admin-stock-movements-body");
        const titleEl = document.getElementById("admin-stock-movements-title");
        if (!modal || !body) return;
        if (titleEl) titleEl.textContent = "Loading Stock Ledger...";
        body.innerHTML = `<p class="admin-muted">Fetching inventory movement history...</p>`;
        modal.style.display = "flex";
        try {
            const res = await window.SecondMarketAdminAPI.getProductMovements(productSlug);
            const product = res.product || {};
            const movements = res.movements || [];
            if (titleEl) {
                titleEl.textContent = `Stock Ledger — ${product.title || productSlug}`;
            }
            const rowsHtml = movements.map((m) => {
                const deltaSign = m.delta > 0 ? `+${m.delta}` : `${m.delta}`;
                const badgeClass = m.delta > 0 ? "admin-pill-paid" : (m.delta < 0 ? "admin-pill-refunded" : "admin-pill-neutral");
                return `
                    <tr>
                        <td>${this.escapeHtml(this.formatDate(m.created_at))}</td>
                        <td>${this.escapeHtml(m.actor_email || "System")}</td>
                        <td><span class="admin-pill-badge ${badgeClass}">${this.escapeHtml(deltaSign)}</span></td>
                        <td>${this.escapeHtml(m.previous_quantity)} &rarr; <strong>${this.escapeHtml(m.new_quantity)}</strong></td>
                        <td>${this.escapeHtml((m.reason || "manual_adjustment").replaceAll("_", " "))}${m.reference ? ` (${this.escapeHtml(m.reference)})` : ""}</td>
                    </tr>
                `;
            }).join("") || this.emptyTableRow("No inventory movements recorded yet for this product.", 5);

            body.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;padding:0.65rem 0.85rem;border:1px solid var(--admin-line);border-radius:var(--radius-sm);">
                    <span>Current Available Stock: <strong>${this.escapeHtml(product.quantity ?? 0)}</strong> units</span>
                    <span class="admin-muted">Status: ${this.escapeHtml(product.status || "—")}</span>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table" style="min-width: 0; font-size: 0.82rem;">
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Actor</th>
                                <th scope="col">Delta</th>
                                <th scope="col">Quantity</th>
                                <th scope="col">Reason</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            body.innerHTML = `<p class="admin-error-text">${this.escapeHtml(window.SecondMarketAdminAPI.formatError(error))}</p>`;
        }
    }

    closeProductMovementsModal() {
        const modal = document.getElementById("admin-stock-movements-modal");
        if (modal) modal.style.display = "none";
    }

    async openProductModal(productSlug = null) {
        if (!document.getElementById("admin-product-modal")) {
            await this.navigate("products");
        }
        if (!this.state.categories?.length && window.SecondMarketAdminAPI?.listCategories) {
            try {
                this.state.categories = await window.SecondMarketAdminAPI.listCategories();
                this.render();
            } catch (e) {}
        }

        this.state.editingProductSlug = productSlug;
        this.state.productModalTab = "basic";

        const modal = document.getElementById("admin-product-modal");
        if (!modal) return;

        const titleEl = document.getElementById("admin-modal-product-title");
        const submitBtn = document.getElementById("admin-product-submit-btn");
        const form = document.getElementById("admin-product-form");
        form?.reset();

        const slugInput = document.getElementById("admin-product-slug");
        if (slugInput) delete slugInput.dataset.manualEdited;

        if (productSlug) {
            const product = (this.state.products || []).find((p) => p.slug === productSlug);
            if (!product) return;

            if (titleEl) titleEl.textContent = `Edit Product: ${product.title}`;
            if (submitBtn) submitBtn.textContent = "Save Changes";

            const titleInput = document.getElementById("admin-product-title");
            if (titleInput) titleInput.value = product.title || "";

            if (slugInput) {
                slugInput.value = product.slug || "";
                slugInput.dataset.manualEdited = "true";
            }

            const catSelect = document.getElementById("admin-product-category");
            if (catSelect) catSelect.value = product.category?.slug || "";

            const statusSelect = document.getElementById("admin-product-status");
            if (statusSelect) statusSelect.value = product.status || "available";

            const conditionSelect = document.getElementById("admin-product-condition");
            if (conditionSelect) conditionSelect.value = product.condition || "like_new";

            const tagsInput = document.getElementById("admin-product-tags");
            if (tagsInput) tagsInput.value = product.material || "";

            const summaryInput = document.getElementById("admin-product-summary");
            if (summaryInput) summaryInput.value = product.dimensions || "";

            const descInput = document.getElementById("admin-product-desc");
            if (descInput) descInput.value = product.description || "";

            const priceInput = document.getElementById("admin-product-price");
            const priceVal = product.price?.amount ?? (product.price_cents ? product.price_cents / 100 : 0);
            if (priceInput) priceInput.value = priceVal ? Number(priceVal).toFixed(2) : "";

            const comparePriceInput = document.getElementById("admin-product-compare-price");
            const compareVal = product.compare_at_price?.amount ?? (product.compare_at_price_cents ? product.compare_at_price_cents / 100 : null);
            if (comparePriceInput) comparePriceInput.value = compareVal !== null && compareVal !== undefined ? Number(compareVal).toFixed(2) : "";

            const costInput = document.getElementById("admin-product-cost");
            const costVal = product.cost?.amount ?? (product.cost_cents ? product.cost_cents / 100 : null);
            if (costInput) costInput.value = costVal !== null && costVal !== undefined ? Number(costVal).toFixed(2) : "";

            const skuInput = document.getElementById("admin-product-sku");
            if (skuInput) skuInput.value = product.sku || product.brand || "";

            const qtyInput = document.getElementById("admin-product-quantity");
            if (qtyInput) qtyInput.value = product.quantity ?? 1;

            const thresholdInput = document.getElementById("admin-product-threshold");
            if (thresholdInput) thresholdInput.value = product.low_stock_threshold ?? 5;

            const trackCheckbox = document.getElementById("admin-product-track-inventory");
            if (trackCheckbox) trackCheckbox.checked = product.track_inventory !== false;

            // Media
            const rawImages = product.images || [];
            const hasPrimaryFlag = rawImages.some((img) => Boolean(img.is_primary));
            this.state.productMediaList = rawImages.map((img, idx) => ({
                url: img.url,
                alt_text: img.alt_text || product.title,
                is_primary: hasPrimaryFlag ? Boolean(img.is_primary) : idx === 0,
            }));

            // Variants
            if (Array.isArray(product.variants) && product.variants.length > 0) {
                this.state.productVariantsList = product.variants.map((v) => ({
                    name: v.name || "Option",
                    val: v.val || v.value || "",
                }));
            } else if (product.color) {
                this.state.productVariantsList = [{ name: "Color", val: product.color }];
            } else {
                this.state.productVariantsList = [];
            }
        } else {
            if (titleEl) titleEl.textContent = "Add New Product";
            if (submitBtn) submitBtn.textContent = "Create Product";

            const catSelect = document.getElementById("admin-product-category");
            if (catSelect && !catSelect.value && catSelect.options.length > 0 && catSelect.options[0].value) {
                catSelect.value = catSelect.options[0].value;
            }

            const conditionSelect = document.getElementById("admin-product-condition");
            if (conditionSelect) conditionSelect.value = "like_new";

            const skuInput = document.getElementById("admin-product-sku");
            if (skuInput) skuInput.value = `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

            const priceInput = document.getElementById("admin-product-price");
            if (priceInput) priceInput.value = "95.00";

            const comparePriceInput = document.getElementById("admin-product-compare-price");
            if (comparePriceInput) comparePriceInput.value = "";

            const costInput = document.getElementById("admin-product-cost");
            if (costInput) costInput.value = "40.00";

            const qtyInput = document.getElementById("admin-product-quantity");
            if (qtyInput) qtyInput.value = "1";

            const thresholdInput = document.getElementById("admin-product-threshold");
            if (thresholdInput) thresholdInput.value = "5";

            const trackCheckbox = document.getElementById("admin-product-track-inventory");
            if (trackCheckbox) trackCheckbox.checked = true;

            this.state.productMediaList = [];
            this.state.productVariantsList = [];
        }

        this.setProductModalTab("basic");
        this.calculatePricingMargin();
        this.renderProductMediaGallery();
        this.renderProductVariants();

        modal.style.display = "flex";
        document.body.classList.add("modal-open");
        const nameInput = document.getElementById("admin-product-title");
        setTimeout(() => nameInput?.focus(), 50);
    }

    openEditProductModal(productSlug) {
        this.openProductModal(productSlug);
    }

    closeProductModal() {
        const modal = document.getElementById("admin-product-modal");
        if (!modal) return;
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        const form = document.getElementById("admin-product-form");
        form?.reset();
        this.state.editingProductSlug = null;
        this.state.productMediaList = [];
        this.state.productVariantsList = [];
        this.flushDeferredRender();
    }

    setProductModalTab(tabName) {
        this.state.productModalTab = tabName;
        const modal = document.getElementById("admin-product-modal");
        if (!modal) return;

        modal.querySelectorAll(".admin-modal-tab-btn").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.tabName === tabName);
        });

        modal.querySelectorAll(".admin-tab-content").forEach((tab) => {
            tab.classList.toggle("is-active", tab.id === `admin-product-tab-${tabName}`);
        });
    }

    calculatePricingMargin() {
        const priceInput = document.getElementById("admin-product-price");
        const costInput = document.getElementById("admin-product-cost");
        const profitEl = document.getElementById("admin-pricing-estimated-profit");
        const marginEl = document.getElementById("admin-pricing-profit-margin");

        if (!profitEl || !marginEl) return;

        const regPrice = parseFloat(priceInput?.value || "0") || 0;
        const cost = parseFloat(costInput?.value || "0") || 0;
        const profit = regPrice - cost;
        const margin = regPrice > 0 ? ((profit / regPrice) * 100) : 0;

        profitEl.textContent = `₱${profit.toFixed(2)}`;
        marginEl.textContent = `${margin.toFixed(1)}%`;

        if (profit < 0) {
            profitEl.style.color = "var(--admin-danger)";
        } else {
            profitEl.style.color = "#10b981";
        }
    }

    handleProductMediaFileSelected(input) {
        if (!input?.files?.length) return;
        const newFiles = Array.from(input.files);
        const MAX_BYTES = 30 * 1024 * 1024;

        newFiles.forEach((file) => {
            if (file.size > MAX_BYTES) {
                this.showToast(`"${file.name}" exceeds the 30MB maximum image limit.`, "error");
                return;
            }
            const previewUrl = URL.createObjectURL(file);
            const isFirst = this.state.productMediaList.length === 0;
            this.state.productMediaList.push({
                file,
                url: previewUrl,
                name: file.name,
                is_primary: isFirst,
            });
        });

        this.renderProductMediaGallery();
        if (input.value !== undefined) input.value = "";
    }

    handleProductMediaDragOver(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-product-media-dropzone");
        dropzone?.classList.add("is-dragover");
    }

    handleProductMediaDragLeave(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-product-media-dropzone");
        dropzone?.classList.remove("is-dragover");
    }

    handleProductMediaDrop(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-product-media-dropzone");
        dropzone?.classList.remove("is-dragover");
        if (event.dataTransfer?.files?.length) {
            this.handleProductMediaFileSelected({ files: event.dataTransfer.files });
        }
    }

    setPrimaryProductImage(index) {
        this.state.productMediaList.forEach((img, i) => {
            img.is_primary = (i === index);
        });
        this.renderProductMediaGallery();
    }

    removeProductImage(index) {
        this.state.productMediaList.splice(index, 1);
        if (this.state.productMediaList.length > 0 && !this.state.productMediaList.some(img => img.is_primary)) {
            this.state.productMediaList[0].is_primary = true;
        }
        this.renderProductMediaGallery();
    }

    renderProductMediaGallery() {
        const gallery = document.getElementById("admin-product-media-gallery");
        if (!gallery) return;

        if (this.state.productMediaList.length === 0) {
            gallery.innerHTML = '<p class="admin-empty-gallery-hint">No product images attached yet.</p>';
            return;
        }

        gallery.innerHTML = this.state.productMediaList.map((img, idx) => `
            <div class="admin-media-card ${img.is_primary ? 'is-primary' : ''}">
                <img src="${this.escapeAttribute(img.url)}" alt="Product Image ${idx + 1}" class="admin-media-card-img">
                ${img.is_primary ? '<span class="admin-media-primary-badge">★ Primary</span>' : ''}
                <div class="admin-media-card-overlay">
                    ${!img.is_primary ? `<button type="button" class="admin-media-btn" onclick="adminApp.setPrimaryProductImage(${idx})" title="Set as primary image">Set Primary</button>` : ''}
                    <button type="button" class="admin-media-btn admin-media-btn-delete" onclick="adminApp.removeProductImage(${idx})" title="Remove image">Remove</button>
                </div>
            </div>
        `).join("");
    }

    addProductVariantRow(name = "", val = "") {
        this.state.productVariantsList.push({ name: name || "Color", val: val || "Oak" });
        this.renderProductVariants();
    }

    removeProductVariantRow(index) {
        this.state.productVariantsList.splice(index, 1);
        this.renderProductVariants();
    }

    renderProductVariants() {
        const container = document.getElementById("admin-product-variants-list");
        if (!container) return;

        if (this.state.productVariantsList.length === 0) {
            container.innerHTML = '<p class="admin-empty-gallery-hint" style="margin-bottom: 0.75rem;">No custom variants configured yet.</p>';
            return;
        }

        container.innerHTML = this.state.productVariantsList.map((v, idx) => `
            <div class="admin-variant-row-item">
                <input type="text" value="${this.escapeAttribute(v.name)}" placeholder="Option name (e.g. Color)" class="admin-variant-input-name" onchange="adminApp.state.productVariantsList[${idx}].name=this.value">
                <input type="text" value="${this.escapeAttribute(v.val)}" placeholder="Values (e.g. Oak, Walnut, Black)" class="admin-variant-input-val" onchange="adminApp.state.productVariantsList[${idx}].val=this.value">
                <button type="button" class="admin-variant-remove-btn" onclick="adminApp.removeProductVariantRow(${idx})" title="Remove variant">&times;</button>
            </div>
        `).join("");
    }

    autoGenerateProductSlug(title) {
        const slugInput = document.getElementById("admin-product-slug");
        if (!slugInput || slugInput.dataset.manualEdited === "true") return;
        slugInput.value = (title || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    focusProductValidationTab(fieldName) {
        const fieldTabMap = {
            title: { tab: "basic", id: "admin-product-title" },
            slug: { tab: "basic", id: "admin-product-slug" },
            category_slug: { tab: "basic", id: "admin-product-category" },
            status: { tab: "basic", id: "admin-product-status" },
            condition: { tab: "basic", id: "admin-product-condition" },
            description: { tab: "basic", id: "admin-product-desc" },
            price: { tab: "pricing", id: "admin-product-price" },
            price_cents: { tab: "pricing", id: "admin-product-price" },
            compare_at_price: { tab: "pricing", id: "admin-product-compare-price" },
            compare_at_price_cents: { tab: "pricing", id: "admin-product-compare-price" },
            cost: { tab: "pricing", id: "admin-product-cost" },
            cost_cents: { tab: "pricing", id: "admin-product-cost" },
            sku: { tab: "pricing", id: "admin-product-sku" },
            quantity: { tab: "inventory", id: "admin-product-quantity" },
            low_stock_threshold: { tab: "inventory", id: "admin-product-threshold" },
            images: { tab: "media", id: "admin-product-file-input" },
            variants: { tab: "variants", id: null },
        };
        const target = fieldTabMap[fieldName];
        if (!target) return;
        this.setProductModalTab(target.tab);
        if (target.id) {
            setTimeout(() => document.getElementById(target.id)?.focus(), 20);
        }
    }

    async saveProduct(event) {
        event.preventDefault();
        if (this.state.actionLoading) return;

        const form = new FormData(event.currentTarget);
        const editingSlug = this.state.editingProductSlug;

        const title = (form.get("title") || "").toString().trim();
        const slug = (form.get("slug") || "").toString().trim();
        const categorySlug = (form.get("category_slug") || "").toString().trim();
        const status = (form.get("status") || "available").toString().trim();
        const description = (form.get("description") || "").toString().trim();
        const rawPrice = parseFloat((form.get("price") || "").toString().trim());
        const rawCompare = (form.get("compare_price") || "").toString().trim();
        const comparePrice = rawCompare !== "" ? parseFloat(rawCompare) : null;
        const rawCost = (form.get("cost") || "").toString().trim();
        const costPrice = rawCost !== "" ? parseFloat(rawCost) : null;
        const rawQty = (form.get("quantity") || "1").toString().trim();
        const quantity = parseInt(rawQty, 10);
        const rawThreshold = (form.get("low_stock_threshold") || "5").toString().trim();
        const lowStockThreshold = parseInt(rawThreshold, 10);

        if (!title) {
            this.focusProductValidationTab("title");
            this.showToast("Product name is required.", "error");
            return;
        }
        if (!categorySlug) {
            this.focusProductValidationTab("category_slug");
            this.showToast("Please select a category.", "error");
            return;
        }
        if (!description) {
            this.focusProductValidationTab("description");
            this.showToast("Product description is required.", "error");
            return;
        }
        if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
            this.focusProductValidationTab("price");
            this.showToast("Selling price must be greater than zero.", "error");
            return;
        }
        if (comparePrice !== null && (!Number.isFinite(comparePrice) || comparePrice < 0)) {
            this.focusProductValidationTab("compare_at_price");
            this.showToast("Compare-at price cannot be negative.", "error");
            return;
        }
        if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
            this.focusProductValidationTab("cost");
            this.showToast("Cost per item cannot be negative.", "error");
            return;
        }
        if (Number.isNaN(quantity) || quantity < 0) {
            this.focusProductValidationTab("quantity");
            this.showToast("Stock quantity must be zero or greater.", "error");
            return;
        }
        if ((status === "available" || status === "reserved") && quantity < 1) {
            this.focusProductValidationTab("quantity");
            this.showToast("Active or reserved products must have at least 1 item in stock.", "error");
            return;
        }

        try {
            this.setActionLoading(true);

            const uploadedImages = [];
            for (let i = 0; i < this.state.productMediaList.length; i++) {
                const item = this.state.productMediaList[i];
                let finalUrl = item.url;
                if (item.file) {
                    this.showToast(`Uploading image ${i + 1} of ${this.state.productMediaList.length}...`);
                    const uploadResult = await window.SecondMarketAdminAPI.uploadProductImage(item.file);
                    finalUrl = uploadResult?.image_url || finalUrl;
                    if (item.url && item.url.startsWith("blob:")) {
                        try { URL.revokeObjectURL(item.url); } catch (e) {}
                    }
                    item.url = finalUrl;
                    item.file = null;
                }
                uploadedImages.push({
                    image_url: finalUrl,
                    alt_text: title || "Product",
                    sort_order: i,
                    is_primary: Boolean(item.is_primary),
                });
            }
            if (uploadedImages.length > 0 && !uploadedImages.some((img) => img.is_primary)) {
                uploadedImages[0].is_primary = true;
            }

            const priceCents = Math.round(rawPrice * 100);
            const trackInventoryEl = document.getElementById("admin-product-track-inventory");
            const trackInventory = trackInventoryEl ? Boolean(trackInventoryEl.checked) : true;
            const skuVal = (form.get("sku") || "").toString().trim() || null;
            const cleanedVariants = (this.state.productVariantsList || [])
                .map((v) => ({ name: (v.name || "").trim(), val: (v.val || "").trim() }))
                .filter((v) => v.name && v.val);
            const colorVariant = cleanedVariants.find((v) => v.name.toLowerCase() === "color");

            const payload = {
                title,
                slug,
                category_slug: categorySlug,
                status,
                price: rawPrice,
                price_cents: priceCents,
                compare_at_price: comparePrice,
                cost: costPrice,
                quantity,
                low_stock_threshold: Number.isNaN(lowStockThreshold) || lowStockThreshold < 0 ? 5 : lowStockThreshold,
                track_inventory: trackInventory,
                variants: cleanedVariants,
                condition: (form.get("condition") || (editingSlug ? (this.state.products || []).find(p => p.slug === editingSlug)?.condition : "like_new") || "like_new").toString().trim(),
                sku: skuVal,
                brand: skuVal,
                color: colorVariant ? colorVariant.val : null,
                material: (form.get("tags") || "").toString().trim() || null,
                dimensions: (form.get("short_summary") || "").toString().trim() || null,
                description,
                images: editingSlug ? uploadedImages : (uploadedImages.length > 0 ? uploadedImages : undefined),
            };

            if (editingSlug) {
                await window.SecondMarketAdminAPI.updateProduct(editingSlug, payload);
                this.showToast("Product updated successfully.");
            } else {
                await window.SecondMarketAdminAPI.createProduct(payload);
                this.showToast("Product created successfully.");
            }

            this.state.actionLoading = false;
            this.closeProductModal();
            await this.refreshInventory();
        } catch (error) {
            const firstDetailField = Object.keys(error?.payload?.error?.details || {})[0];
            if (firstDetailField) {
                this.focusProductValidationTab(firstDetailField);
            }
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    openDeleteProductModal({ mode, slugs, titleText, warningHtml, confirmLabel }) {
        this.state.pendingProductDelete = { mode, slugs };

        const modal = document.getElementById("admin-delete-product-modal");
        if (!modal) return;

        const titleEl = document.getElementById("admin-delete-product-title");
        if (titleEl) titleEl.textContent = titleText;

        const warningEl = document.getElementById("admin-delete-product-warning-text");
        if (warningEl) warningEl.innerHTML = warningHtml;

        const confirmBtn = document.getElementById("admin-confirm-delete-product-btn");
        if (confirmBtn) confirmBtn.textContent = confirmLabel || "Permanently Delete";

        modal.style.display = "flex";
        document.body.classList.add("modal-open");
    }

    closeDeleteProductModal() {
        const modal = document.getElementById("admin-delete-product-modal");
        if (modal) modal.style.display = "none";
        document.body.classList.remove("modal-open");
        this.state.pendingProductDelete = null;
        this.flushDeferredRender();
    }

    confirmDeleteProduct(productSlug) {
        if (!productSlug || this.state.actionLoading) return;
        const product = (this.state.products || []).find((item) => item.slug === productSlug);
        const label = product?.title || productSlug;
        this.openDeleteProductModal({
            mode: "single",
            slugs: [productSlug],
            titleText: "Permanently Delete Product?",
            warningHtml: `Are you sure you want to permanently delete <strong>${this.escapeHtml(label)}</strong>? This removes it from the catalog, active customer carts, wishlists, and reviews while preserving past order snapshots. This action cannot be undone.`,
            confirmLabel: "Permanently Delete",
        });
    }

    async confirmPermanentDeleteProducts() {
        const pending = this.state.pendingProductDelete;
        if (!pending || !pending.slugs?.length || this.state.actionLoading) return;

        const { mode, slugs } = pending;
        const confirmBtn = document.getElementById("admin-confirm-delete-product-btn");
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Deleting...";
        }

        try {
            this.setActionLoading(true);
            let message = "";
            if (mode === "bulk") {
                const result = await window.SecondMarketAdminAPI.bulkUpdateProducts({
                    slugs,
                    action: "delete",
                    status: null,
                });
                const count = result?.deleted_count ?? result?.affected_count ?? slugs.length;
                message = `Permanently deleted ${count} product(s).`;
            } else {
                await window.SecondMarketAdminAPI.deleteProduct(slugs[0]);
                message = "Product permanently deleted.";
            }

            const deletedSet = new Set(slugs);
            this.state.selectedProductSlugs = (this.state.selectedProductSlugs || []).filter((s) => !deletedSet.has(s));
            this.closeDeleteProductModal();
            this.showToast(message);
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Permanently Delete";
            }
            this.setActionLoading(false);
        }
    }

    exportProductsCSV() {
        const products = this.state.products || [];
        if (!products.length) {
            this.showToast("No products in inventory to export.", "error");
            return;
        }

        const headers = ["ID", "Title", "Slug", "SKU", "Category", "Price", "Quantity", "Status"];
        const rows = products.map((p) => {
            const sku = p.brand || `SKU-${p.id}`;
            const price = (p.price?.amount || (p.price_cents / 100) || 0).toFixed(2);
            return [
                p.id,
                `"${(p.title || '').replace(/"/g, '""')}"`,
                `"${p.slug}"`,
                `"${sku}"`,
                `"${p.category?.name || 'Uncategorized'}"`,
                price,
                p.quantity,
                p.status
            ].join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `products-catalog-${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("Products catalog exported to CSV.");
    }

    importProductsCSV() {
        const modal = document.getElementById("admin-csv-import-modal");
        if (!modal) {
            this.navigate("products");
            setTimeout(() => this.importProductsCSV(), 150);
            return;
        }
        this._parsedCsvProducts = [];
        const fileInput = document.getElementById("admin-csv-file-input");
        if (fileInput) fileInput.value = "";
        const previewArea = document.getElementById("admin-csv-preview-area");
        if (previewArea) previewArea.style.display = "none";
        const submitBtn = document.getElementById("admin-csv-import-submit-btn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Import Items";
        }
        modal.style.display = "flex";
    }

    closeCsvImportModal() {
        const modal = document.getElementById("admin-csv-import-modal");
        if (modal) modal.style.display = "none";
    }

    handleCsvFileSelected(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            this._rawCsvText = text;
            this.parseAndPreviewCsv(text);
        };
        reader.readAsText(file);
    }

    parseAndPreviewCsv(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length <= 1) {
            this.showToast("The selected CSV file appears to be empty.", "error");
            return;
        }

        const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
        const titleIdx = header.findIndex(h => h.includes("title") || h.includes("name"));
        const priceIdx = header.findIndex(h => h.includes("price") && !h.includes("compare"));
        const skuIdx = header.findIndex(h => h.includes("sku"));
        const catIdx = header.findIndex(h => h.includes("category"));
        const condIdx = header.findIndex(h => h.includes("condition"));
        const qtyIdx = header.findIndex(h => h.includes("quantity") || h.includes("qty") || h.includes("stock"));

        const parsedProducts = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const cols = [];
            let inQuotes = false;
            let current = "";
            for (let c = 0; c < line.length; c++) {
                const char = line[c];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cols.push(current.trim().replace(/^"|"$/g, ""));
                    current = "";
                } else {
                    current += char;
                }
            }
            cols.push(current.trim().replace(/^"|"$/g, ""));

            const title = cols[titleIdx >= 0 ? titleIdx : 0] || `Imported Item ${i}`;
            const price = parseFloat(cols[priceIdx >= 0 ? priceIdx : 4]) || 100;
            const sku = cols[skuIdx >= 0 ? skuIdx : 1] || `CSV-${Date.now().toString(36)}-${i}`;
            const category = cols[catIdx >= 0 ? catIdx : 2] || "general";
            const condition = cols[condIdx >= 0 ? condIdx : 3] || "Good";
            const quantity = parseInt(cols[qtyIdx >= 0 ? qtyIdx : 6], 10) || 1;

            if (title) {
                parsedProducts.push({ title, price, sku, category, condition, quantity, status: "available" });
            }
        }

        this._parsedCsvProducts = parsedProducts;
        const previewArea = document.getElementById("admin-csv-preview-area");
        const previewCount = document.getElementById("admin-csv-preview-count");
        const previewList = document.getElementById("admin-csv-preview-list");
        const submitBtn = document.getElementById("admin-csv-import-submit-btn");

        if (previewArea && previewCount && previewList && submitBtn) {
            previewCount.textContent = `${parsedProducts.length} items detected`;
            previewList.innerHTML = parsedProducts.slice(0, 5).map(p => `
                <div style="padding: 2px 0; border-bottom: 1px dotted #D7CEC1;">
                    <strong>${this.escapeHtml(p.title)}</strong> - ₱${p.price.toLocaleString()} | Qty: ${p.quantity} | ${this.escapeHtml(p.condition)}
                </div>
            `).join("") + (parsedProducts.length > 5 ? `<div style="color: #776B56; padding-top: 4px;">...and ${parsedProducts.length - 5} more items</div>` : "");
            previewArea.style.display = "block";
            submitBtn.disabled = parsedProducts.length === 0;
        }
    }

    async executeCsvImport() {
        const items = this._parsedCsvProducts || [];
        if (!items.length) {
            this.showToast("No valid products found to import.", "error");
            return;
        }

        const submitBtn = document.getElementById("admin-csv-import-submit-btn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Importing...";
        }

        try {
            if (this._rawCsvText && window.SecondMarketAdminAPI?.importProductsCSV) {
                const res = await window.SecondMarketAdminAPI.importProductsCSV(this._rawCsvText);
                this.closeCsvImportModal();
                this.showToast(`Successfully imported ${res.imported_count} product(s) via backend batch service.`);
                await this.refreshInventory();
                return;
            }

            let importedCount = 0;
            for (const item of items) {
                const categoryMatch = (this.state.categories || []).find(c => 
                    c.name.toLowerCase() === item.category.toLowerCase() || 
                    c.slug.toLowerCase() === item.category.toLowerCase()
                );
                const categorySlug = categoryMatch ? categoryMatch.slug : ((this.state.categories || [])[0]?.slug || "general");
                const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36).slice(-4);

                if (window.SecondMarketAdminAPI?.createProduct) {
                    await window.SecondMarketAdminAPI.createProduct({
                        title: item.title,
                        slug,
                        sku: item.sku,
                        category_slug: categorySlug,
                        condition: item.condition,
                        price: item.price,
                        inventory_quantity: item.quantity,
                        status: item.status || "available",
                        description: `Imported via CSV catalog import.`
                    });
                    importedCount++;
                }
            }

            this.closeCsvImportModal();
            this.showToast(`Successfully imported ${importedCount} product(s) into catalog.`);
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Import Items";
            }
        }
    }

    setProductPage(page) {
        this.state.productPageNumber = page;
        this.render();
    }

    handleProductSearchInput(value) {
        this.state.productFilters = this.state.productFilters || {};
        this.state.productFilters.q = value;
        this.state.productPageNumber = 1;
        this.render();
    }

    applyProductFilterChange(element) {
        this.state.productFilters = this.state.productFilters || {};
        this.state.productFilters[element.name] = element.value;
        this.state.productPageNumber = 1;
        this.render();
    }

    toggleSelectAllProducts(masterCheckbox) {
        const checkboxes = document.querySelectorAll(".admin-row-checkbox[data-product-slug]");
        const selected = new Set(this.state.selectedProductSlugs || []);
        checkboxes.forEach((cb) => {
            cb.checked = masterCheckbox.checked;
            const slug = cb.dataset.productSlug;
            if (!slug) return;
            if (masterCheckbox.checked) {
                selected.add(slug);
            } else {
                selected.delete(slug);
            }
        });
        this.state.selectedProductSlugs = Array.from(selected);
        this.render();
    }

    toggleSelectProductRow(checkbox, productSlug) {
        if (!productSlug) return;
        const selected = new Set(this.state.selectedProductSlugs || []);
        if (checkbox.checked) {
            selected.add(productSlug);
        } else {
            selected.delete(productSlug);
        }
        this.state.selectedProductSlugs = Array.from(selected);
        this.render();
    }

    clearProductSelection() {
        this.state.selectedProductSlugs = [];
        this.render();
    }

    async executeBulkProductAction(action, status = null) {
        const slugs = this.state.selectedProductSlugs || [];
        if (!slugs.length || this.state.actionLoading) return;

        if (action === "delete") {
            this.openDeleteProductModal({
                mode: "bulk",
                slugs: [...slugs],
                titleText: `Permanently Delete ${slugs.length} Selected Product(s)?`,
                warningHtml: `Are you sure you want to permanently delete <strong>${slugs.length}</strong> selected product(s)? This removes them from the catalog, active customer carts, wishlists, and reviews while preserving past order snapshots. This action cannot be undone.`,
                confirmLabel: `Permanently Delete (${slugs.length})`,
            });
            return;
        }

        try {
            this.setActionLoading(true);
            const result = await window.SecondMarketAdminAPI.bulkUpdateProducts({
                slugs,
                action,
                status,
            });
            this.state.selectedProductSlugs = [];
            this.showToast(`Bulk action applied to ${result.affected_count || slugs.length} product(s).`);
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    handleGlobalSearch(query) {
        const cleaned = (query || "").toString().trim().replace(/^#/, "");
        this.closeGlobalSearchPopover();
        if (!cleaned) return;
        const upper = cleaned.toUpperCase();
        if (upper.startsWith("RET-")) {
            this.state.returnsStatusFilter = "all";
            this.navigate("returns");
            return;
        }
        if (
            upper.startsWith("SM-") ||
            upper.startsWith("ORD-") ||
            cleaned.includes("@") ||
            this.state.currentView === "orders"
        ) {
            this.state.orderFilters = this.state.orderFilters || {};
            this.state.orderFilters.q = cleaned;
            this.state.orderPageNumber = 1;
            this.navigate("orders");
            this.refreshOrdersOnly();
            return;
        }
        if (this.state.currentView === "categories") {
            this.filterCategories(cleaned);
            return;
        }
        this.state.productFilters = this.state.productFilters || {};
        this.state.productFilters.q = cleaned;
        this.state.productPageNumber = 1;
        this.navigate("products");
    }

    handleGlobalSearchFocus() {
        const input = document.getElementById("admin-global-search-input");
        const q = (input?.value || "").trim().replace(/^#/, "");
        if (q.length >= 2) {
            const popover = document.getElementById("admin-global-search-popover");
            if (popover && popover.innerHTML.trim()) {
                popover.style.display = "block";
            } else {
                this.handleGlobalSearchInput(q);
            }
        }
    }

    closeGlobalSearchPopover() {
        const popover = document.getElementById("admin-global-search-popover");
        if (popover) popover.style.display = "none";
    }

    handleGlobalSearchInput(query) {
        const cleaned = (query || "").toString().trim().replace(/^#/, "");
        if (this._searchTimer) clearTimeout(this._searchTimer);
        if (cleaned.length < 2) {
            this.closeGlobalSearchPopover();
            return;
        }
        this._searchTimer = setTimeout(async () => {
            if (!window.SecondMarketAdminAPI?.globalSearch) return;
            try {
                const results = await window.SecondMarketAdminAPI.globalSearch(cleaned);
                this.renderGlobalSearchPopover(results, cleaned);
            } catch (_) {
                this.closeGlobalSearchPopover();
            }
        }, 180);
    }

    renderGlobalSearchPopover(results, query) {
        const popover = document.getElementById("admin-global-search-popover");
        if (!popover) return;
        const orders = results?.orders || [];
        const products = results?.products || [];
        const customers = results?.customers || [];

        if (!orders.length && !products.length && !customers.length) {
            popover.innerHTML = `<div class="admin-search-empty">No matches found for &ldquo;${this.escapeHtml(query)}&rdquo;</div>`;
            popover.style.display = "block";
            return;
        }

        const sections = [];
        if (orders.length) {
            sections.push(`
                <div class="admin-search-group">
                    <div class="admin-search-group-label">Orders</div>
                    ${orders.map((o) => `
                        <button type="button" class="admin-search-result-item" onclick="adminApp.selectGlobalSearchOrder('${this.escapeAttribute(o.order_number)}')">
                            <div>
                                <strong>#${this.escapeHtml(o.order_number)}</strong>
                                <div class="admin-muted" style="font-size: 0.74rem;">${this.escapeHtml(o.buyer_name || o.buyer_email || "Guest")}</div>
                            </div>
                            <div style="text-align: right;">
                                <strong>${this.escapeHtml(this.formatCurrency(o.total || 0))}</strong>
                                <div class="admin-muted" style="font-size: 0.72rem; text-transform: uppercase;">${this.escapeHtml(o.status || "")}</div>
                            </div>
                        </button>
                    `).join("")}
                </div>
            `);
        }
        if (products.length) {
            sections.push(`
                <div class="admin-search-group">
                    <div class="admin-search-group-label">Products</div>
                    ${products.map((p) => `
                        <button type="button" class="admin-search-result-item" onclick="adminApp.selectGlobalSearchProduct('${this.escapeAttribute(p.title)}')">
                            <div>
                                <strong>${this.escapeHtml(p.title)}</strong>
                                <div class="admin-muted" style="font-size: 0.74rem;">SKU: ${this.escapeHtml(p.sku || "—")} · Qty ${Number(p.quantity || 0)}</div>
                            </div>
                            <div style="text-align: right;">
                                <strong>${this.escapeHtml(this.formatCurrency(p.price || 0))}</strong>
                                <div class="admin-muted" style="font-size: 0.72rem; text-transform: uppercase;">${this.escapeHtml(p.status || "")}</div>
                            </div>
                        </button>
                    `).join("")}
                </div>
            `);
        }
        if (customers.length) {
            sections.push(`
                <div class="admin-search-group">
                    <div class="admin-search-group-label">Customers</div>
                    ${customers.map((c) => `
                        <button type="button" class="admin-search-result-item" onclick="adminApp.selectGlobalSearchCustomer('${this.escapeAttribute(c.email)}', ${Number(c.id || 0)})">
                            <div>
                                <strong>${this.escapeHtml(c.name || c.email)}</strong>
                                <div class="admin-muted" style="font-size: 0.74rem;">${this.escapeHtml(c.email)}</div>
                            </div>
                            <div class="admin-muted" style="font-size: 0.72rem; text-transform: uppercase;">${this.escapeHtml(c.status || "active")}</div>
                        </button>
                    `).join("")}
                </div>
            `);
        }

        popover.innerHTML = sections.join("");
        popover.style.display = "block";
    }

    selectGlobalSearchOrder(orderNumber) {
        this.closeGlobalSearchPopover();
        this.viewOrder(orderNumber);
    }

    selectGlobalSearchProduct(title) {
        this.closeGlobalSearchPopover();
        this.state.productFilters = this.state.productFilters || {};
        this.state.productFilters.q = title || "";
        this.state.productPageNumber = 1;
        this.navigate("products");
    }

    selectGlobalSearchCustomer(email, customerId) {
        this.closeGlobalSearchPopover();
        if (typeof this.viewCustomer === "function" && customerId) {
            this.navigate("customers");
            this.viewCustomer(customerId);
            return;
        }
        this.state.orderFilters = this.state.orderFilters || {};
        this.state.orderFilters.q = email || "";
        this.state.orderPageNumber = 1;
        this.navigate("orders");
        this.refreshOrdersOnly();
    }

    async refreshSupportTickets() {
        if (!window.SecondMarketAdminAPI?.listSupportTickets) return;
        try {
            this.setActionLoading(true);
            const res = await window.SecondMarketAdminAPI.listSupportTickets({
                status: this.state.supportStatusFilter !== "all" ? this.state.supportStatusFilter : undefined,
            });
            this.state.supportTickets = res?.tickets || [];
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setSupportStatusFilter(status) {
        this.state.supportStatusFilter = status || "all";
        await this.refreshSupportTickets();
    }

    async openSupportTicket(ticketNumber) {
        if (!window.SecondMarketAdminAPI?.getSupportTicketDetail) return;
        try {
            this.setActionLoading(true);
            this.state.currentSupportTicket = await window.SecondMarketAdminAPI.getSupportTicketDetail(ticketNumber);
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    closeSupportTicketDrawer() {
        this.state.currentSupportTicket = null;
        this.render();
    }

    async replySupportTicket(event, ticketNumber) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = new FormData(event.currentTarget);
        const message = (form.get("message") || "").toString().trim();
        if (!message) {
            this.showToast("Please enter a reply message.", "error");
            return;
        }
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.sendSupportMessage(ticketNumber, message);
            this.showToast("Reply sent to buyer.");
            this.state.currentSupportTicket = await window.SecondMarketAdminAPI.getSupportTicketDetail(ticketNumber);
            await this.refreshSupportTickets();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async changeSupportTicketStatus(ticketNumber, status) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateSupportTicketStatus(ticketNumber, status);
            this.showToast(`Ticket #${ticketNumber} marked as ${status.replace("_", " ")}.`);
            if (this.state.currentSupportTicket?.ticket_number === ticketNumber) {
                this.state.currentSupportTicket = await window.SecondMarketAdminAPI.getSupportTicketDetail(ticketNumber);
            }
            await this.refreshSupportTickets();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async refreshReturns() {
        if (!window.SecondMarketAdminAPI?.listReturns) return;
        try {
            this.setActionLoading(true);
            const res = await window.SecondMarketAdminAPI.listReturns({
                status: this.state.returnsStatusFilter !== "all" ? this.state.returnsStatusFilter : undefined,
            });
            this.state.returnsList = res?.returns || [];
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setReturnsStatusFilter(status) {
        this.state.returnsStatusFilter = status || "all";
        await this.refreshReturns();
    }

    async handleUpdateReturnStatus(returnNumber, status) {
        if (this.state.actionLoading) return;
        const notesInput = document.getElementById(`admin-return-notes-${returnNumber}`);
        const refundInput = document.getElementById(`admin-return-refund-${returnNumber}`);
        const payload = { status };
        if (notesInput && notesInput.value.trim()) {
            payload.admin_notes = notesInput.value.trim();
        }
        if (refundInput && refundInput.value.trim() !== "") {
            const parsedRefund = parseFloat(refundInput.value);
            if (!Number.isNaN(parsedRefund) && parsedRefund >= 0) {
                payload.refund_amount = parsedRefund;
            }
        }
        try {
            this.setActionLoading(true);
            const res = await window.SecondMarketAdminAPI.updateReturnStatus(returnNumber, payload);
            const updated = res?.data || {};
            const gatewayNote = updated.refund_reference ? ` (${updated.refund_reference})` : "";
            this.showToast(`Return #${returnNumber} updated to ${status.toUpperCase()}${gatewayNote}.`);
            await this.refreshReturns();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async refreshCoupons() {
        if (!window.SecondMarketAdminAPI?.listCoupons) return;
        try {
            this.setActionLoading(true);
            this.state.couponsList = await window.SecondMarketAdminAPI.listCoupons(this.state.couponFilterActiveOnly);
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    startEditCoupon(couponId) {
        this.state.editingCouponId = Number(couponId);
        this.render();
    }

    cancelEditCoupon() {
        this.state.editingCouponId = null;
        this.render();
    }

    async handleSaveCoupon(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = new FormData(event.currentTarget);
        const code = (form.get("code") || "").toString().trim().toUpperCase();
        const discountType = (form.get("discount_type") || "fixed").toString().trim();
        const discountValue = parseFloat((form.get("discount_value") || "0").toString());
        const minSpend = parseFloat((form.get("min_spend") || "0").toString()) || 0;
        const rawMaxDiscount = (form.get("max_discount") || "").toString().trim();
        const rawUsageLimit = (form.get("usage_limit") || "").toString().trim();
        const validFrom = (form.get("valid_from") || "").toString().trim();
        const validUntil = (form.get("valid_until") || "").toString().trim();

        const payload = {
            code,
            discount_type: discountType,
            discount_value: discountValue,
            min_spend: minSpend,
            max_discount: rawMaxDiscount !== "" ? parseFloat(rawMaxDiscount) : null,
            usage_limit: rawUsageLimit !== "" ? parseInt(rawUsageLimit, 10) : null,
            valid_from: validFrom || null,
            valid_until: validUntil || null,
        };

        try {
            this.setActionLoading(true);
            if (this.state.editingCouponId) {
                await window.SecondMarketAdminAPI.updateCoupon(this.state.editingCouponId, payload);
                this.showToast(`Coupon "${code}" updated.`);
                this.state.editingCouponId = null;
            } else {
                payload.is_active = true;
                await window.SecondMarketAdminAPI.createCoupon(payload);
                this.showToast(`Coupon "${code}" created.`);
                event.currentTarget.reset();
            }
            await this.refreshCoupons();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleCreateCoupon(event) {
        return this.handleSaveCoupon(event);
    }

    async handleDeleteCoupon(couponId, code) {
        if (this.state.actionLoading) return;
        if (!window.confirm(`Delete unused coupon "${code}"? This cannot be undone.`)) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.deleteCoupon(couponId);
            if (Number(this.state.editingCouponId) === Number(couponId)) {
                this.state.editingCouponId = null;
            }
            this.showToast(`Coupon "${code}" deleted.`);
            await this.refreshCoupons();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async viewCouponRedemptions(couponId) {
        if (!window.SecondMarketAdminAPI?.getCouponRedemptions) return;
        try {
            this.setActionLoading(true);
            this.state.currentCouponRedemptions = await window.SecondMarketAdminAPI.getCouponRedemptions(couponId);
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    closeCouponRedemptionsDrawer() {
        this.state.currentCouponRedemptions = null;
        this.render();
    }

    async refreshCustomers() {
        if (!window.SecondMarketAdminAPI?.listCustomers) return;
        try {
            this.setActionLoading(true);
            const data = await window.SecondMarketAdminAPI.listCustomers(this.state.customerFilters);
            this.state.customersList = data?.customers || [];
            this.state.customerSummary = data?.summary || null;
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async applyCustomerFilters(event) {
        if (event && event.preventDefault) event.preventDefault();
        const form = new FormData(event.currentTarget);
        this.state.customerFilters = {
            q: (form.get("q") || "").toString().trim(),
            status: (form.get("status") || "all").toString(),
            sort: (form.get("sort") || "recent").toString(),
        };
        await this.refreshCustomers();
    }

    async resetCustomerFilters() {
        this.state.customerFilters = { q: "", status: "all", sort: "recent" };
        await this.refreshCustomers();
    }

    async viewCustomer(customerId) {
        if (!window.SecondMarketAdminAPI?.getCustomer) return;
        try {
            this.setActionLoading(true);
            this.state.currentCustomer = await window.SecondMarketAdminAPI.getCustomer(customerId);
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    closeCustomerDrawer() {
        this.state.currentCustomer = null;
        this.render();
    }

    async handleUpdateCustomerStatus(customerId, status) {
        if (this.state.actionLoading) return;
        const actionLabel = status === "disabled" ? "suspend" : "reactivate";
        if (!window.confirm(`Are you sure you want to ${actionLabel} this customer account?`)) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateCustomerStatus(customerId, status);
            this.showToast(`Customer account ${status === "disabled" ? "suspended" : "reactivated"}.`);
            if (this.state.currentCustomer && Number(this.state.currentCustomer.id) === Number(customerId)) {
                this.state.currentCustomer = await window.SecondMarketAdminAPI.getCustomer(customerId);
            }
            await this.refreshCustomers();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleRevokeCustomerSessions(customerId) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            const res = await window.SecondMarketAdminAPI.revokeCustomerSessions(customerId);
            this.showToast(`Revoked ${res?.revoked_count ?? 0} active session(s).`);
            if (this.state.currentCustomer && Number(this.state.currentCustomer.id) === Number(customerId)) {
                this.state.currentCustomer = await window.SecondMarketAdminAPI.getCustomer(customerId);
            }
            await this.refreshCustomers();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async refreshPayments() {
        if (!window.SecondMarketAdminAPI?.listPayments) return;
        try {
            this.setActionLoading(true);
            const data = await window.SecondMarketAdminAPI.listPayments(this.state.paymentFilters);
            this.state.paymentsList = data?.payments || [];
            this.state.paymentSummary = data?.summary || null;
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async applyPaymentFilters(event) {
        if (event && event.preventDefault) event.preventDefault();
        const form = new FormData(event.currentTarget);
        this.state.paymentFilters = {
            q: (form.get("q") || "").toString().trim(),
            method: (form.get("method") || "all").toString(),
            status: (form.get("status") || "all").toString(),
        };
        await this.refreshPayments();
    }

    async resetPaymentFilters() {
        this.state.paymentFilters = { q: "", method: "all", status: "all" };
        await this.refreshPayments();
    }

    async handleReconcilePayment(paymentId) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.reconcilePayment(paymentId);
            this.showToast("Payment transaction reconciled.");
            await this.refreshPayments();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleRefundPayment(paymentId, orderNumber, defaultAmount) {
        if (this.state.actionLoading) return;
        const confirmed = window.confirm(
            `Issue full refund of ₱${Number(defaultAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for Order #${orderNumber}?`
        );
        if (!confirmed) return;
        try {
            this.setActionLoading(true);
            const res = await window.SecondMarketAdminAPI.refundPayment(paymentId, { amount: defaultAmount });
            this.showToast(`Refund executed${res?.refund_id ? ` (${res.refund_id})` : ""}.`);
            await this.refreshPayments();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    setSettingsTab(tab) {
        this.state.settingsTab = tab || "config";
        this.render();
    }

    async refreshSettings() {
        if (!window.SecondMarketAdminAPI?.getStoreSettings) return;
        try {
            this.setActionLoading(true);
            const [storeConfig, staffData, auditData] = await Promise.all([
                window.SecondMarketAdminAPI.getStoreSettings(),
                window.SecondMarketAdminAPI.listStaff().catch(() => null),
                window.SecondMarketAdminAPI.listAuditLogs({ per_page: 30 }).catch(() => ({ logs: [] })),
            ]);
            this.state.storeConfig = storeConfig;
            this.state.staffData = staffData;
            this.state.auditLogs = auditData?.logs || [];
            this.render();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleSaveStoreConfig(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = new FormData(event.currentTarget);
        const methods = form.getAll("enabled_payment_methods").map(String);
        const payload = {
            store_name: (form.get("store_name") || "").toString().trim(),
            support_email: (form.get("support_email") || "").toString().trim(),
            standard_shipping_fee: parseFloat((form.get("standard_shipping_fee") || "0").toString()),
            free_shipping_threshold: parseFloat((form.get("free_shipping_threshold") || "0").toString()),
            default_low_stock_threshold: parseInt((form.get("default_low_stock_threshold") || "2").toString(), 10),
            return_window_days: parseInt((form.get("return_window_days") || "14").toString(), 10),
            enabled_payment_methods: methods,
        };
        try {
            this.setActionLoading(true);
            this.state.storeConfig = await window.SecondMarketAdminAPI.updateStoreSettings(payload);
            this.showToast("Store settings updated.");
            await this.refreshSettings();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleSaveStaffMember(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (this.state.actionLoading) return;
        const form = new FormData(event.currentTarget);
        const payload = {
            email: (form.get("email") || "").toString().trim(),
            first_name: (form.get("first_name") || "").toString().trim(),
            last_name: (form.get("last_name") || "").toString().trim(),
            role: (form.get("role") || "").toString().trim(),
            password: (form.get("password") || "").toString(),
        };
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.saveStaffMember(payload);
            this.showToast(`Staff role saved for ${payload.email}.`);
            event.currentTarget.reset();
            await this.refreshSettings();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleUpdateStaffRole(email, role) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.saveStaffMember({ email, role });
            this.showToast(`Updated role for ${email} to ${role}.`);
            await this.refreshSettings();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async handleToggleCouponStatus(couponId, isActive) {
        if (this.state.actionLoading) return;
        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.toggleCouponStatus(couponId, isActive);
            this.showToast(`Coupon ${isActive ? "activated" : "deactivated"}.`);
            await this.refreshCoupons();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    getOperationalAlerts() {
        const alerts = [];
        const products = this.state.products || [];
        const orders = this.state.orders || [];
        const reports = this.state.moderationReports || [];

        const lowStock = products.filter(p => {
            const qty = p.inventory_quantity !== undefined ? p.inventory_quantity : (p.quantity || 0);
            return qty <= 2 && (p.status || "available") === "available";
        });
        if (lowStock.length > 0) {
            alerts.push({
                type: "warning",
                title: "Low Inventory Alert",
                desc: `${lowStock.length} product(s) have critical stock (≤ 2 units)`,
                action: () => this.navigate("products")
            });
        }

        const pendingOrders = orders.filter(o => {
            const status = (o.status || "").toLowerCase();
            const fulfillment = (o.fulfillment_status || "").toLowerCase();
            return status === "pending" || fulfillment === "unfulfilled" || status === "processing";
        });
        if (pendingOrders.length > 0) {
            alerts.push({
                type: "info",
                title: "Orders Requiring Action",
                desc: `${pendingOrders.length} order(s) pending fulfillment or processing`,
                action: () => this.navigate("orders")
            });
        }

        const pendingReports = reports.filter(r => (r.status || "").toLowerCase() === "pending");
        if (pendingReports.length > 0) {
            alerts.push({
                type: "warning",
                title: "Moderation Queue",
                desc: `${pendingReports.length} buyer report(s) awaiting seller review`,
                action: () => this.navigate("moderation")
            });
        }

        return alerts;
    }

    async refreshNotifications() {
        if (!window.SecondMarketAdminAPI?.listNotifications) return;
        try {
            const [feedRes, unreadCount] = await Promise.all([
                window.SecondMarketAdminAPI.listNotifications({ per_page: 15 }),
                window.SecondMarketAdminAPI.getUnreadNotificationCount().catch(() => 0),
            ]);
            this.state.notifications = feedRes?.notifications || [];
            this.state.unreadNotificationsCount = Number(unreadCount || 0);
            this.updateNotificationBadge();
        } catch (_) {}
    }

    updateNotificationBadge() {
        const badge = document.getElementById("admin-notification-badge");
        if (!badge) return;
        const alerts = this.getOperationalAlerts();
        const totalUnread = (this.state.unreadNotificationsCount || 0) + alerts.length;
        badge.textContent = totalUnread > 99 ? "99+" : totalUnread.toString();
        badge.style.display = totalUnread > 0 ? "flex" : "none";
    }

    async toggleNotificationsPopover() {
        const popover = document.getElementById("admin-notifications-popover");
        if (!popover) return;
        if (popover.style.display === "none" || !popover.style.display) {
            this.renderNotificationsPopover();
            popover.style.display = "block";
            await this.refreshNotifications();
            this.renderNotificationsPopover();
        } else {
            popover.style.display = "none";
        }
    }

    closeNotificationsPopover() {
        const popover = document.getElementById("admin-notifications-popover");
        if (popover) popover.style.display = "none";
    }

    renderNotificationsPopover() {
        const listEl = document.getElementById("admin-notifications-list");
        if (!listEl) return;
        const alerts = this.getOperationalAlerts();
        const persisted = this.state.notifications || [];
        const markAllBtn = document.getElementById("admin-mark-all-read-btn");
        if (markAllBtn) {
            markAllBtn.style.display = (this.state.unreadNotificationsCount || 0) > 0 ? "inline-flex" : "none";
        }

        if (alerts.length === 0 && persisted.length === 0) {
            listEl.innerHTML = `
                <div class="admin-notifications-empty">
                    <p style="margin: 0; font-weight: 600; color: #4E4638;">All tasks up to date</p>
                    <p style="margin: 4px 0 0; font-size: 0.7rem;">No urgent order, inventory, or report alerts.</p>
                </div>
            `;
            return;
        }

        const alertHtml = alerts.map((alert, idx) => `
            <div class="admin-notification-item" onclick="adminApp.handleNotificationClick(${idx})">
                <div class="admin-notification-item-icon ${alert.type}">
                    ${alert.type === "warning" ? "!" : "i"}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <h5 class="admin-notification-item-title">${this.escapeHtml(alert.title)}</h5>
                    <p class="admin-notification-item-desc">${this.escapeHtml(alert.desc)}</p>
                </div>
            </div>
        `).join("");

        const persistedHtml = persisted.map((notif) => `
            <div class="admin-notification-item ${notif.is_read ? "" : "is-unread"}" onclick="adminApp.handlePersistentNotificationClick(${Number(notif.id)})">
                <div class="admin-notification-item-icon ${notif.type === "operational" ? "warning" : "info"}">
                    ${notif.type === "operational" ? "!" : "i"}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem;">
                        <h5 class="admin-notification-item-title">${this.escapeHtml(notif.title || "Notification")}</h5>
                        ${notif.is_read ? "" : '<span class="admin-notification-unread-dot" title="Unread"></span>'}
                    </div>
                    <p class="admin-notification-item-desc">${this.escapeHtml(notif.message || "")}</p>
                    ${notif.created_at ? `<span class="admin-muted" style="font-size: 0.68rem;">${this.escapeHtml(this.formatDate(notif.created_at))}</span>` : ""}
                </div>
            </div>
        `).join("");

        listEl.innerHTML = `
            ${alertHtml ? `<div class="admin-notifications-section-label">Live Operational Queue</div>${alertHtml}` : ""}
            ${persistedHtml ? `<div class="admin-notifications-section-label">Recent Activity</div>${persistedHtml}` : ""}
        `;
    }

    handleNotificationClick(alertIndex) {
        this.closeNotificationsPopover();
        const alerts = this.getOperationalAlerts();
        if (alerts[alertIndex] && alerts[alertIndex].action) {
            alerts[alertIndex].action();
        }
    }

    async handlePersistentNotificationClick(notificationId) {
        const notif = (this.state.notifications || []).find((n) => Number(n.id) === Number(notificationId));
        if (notif && !notif.is_read && window.SecondMarketAdminAPI?.markNotificationRead) {
            try {
                await window.SecondMarketAdminAPI.markNotificationRead(notificationId);
                notif.is_read = true;
                this.state.unreadNotificationsCount = Math.max(0, (this.state.unreadNotificationsCount || 1) - 1);
                this.updateNotificationBadge();
            } catch (_) {}
        }
        this.closeNotificationsPopover();
        const data = notif?.data || {};
        if (data.return_number) {
            this.navigate("returns");
        } else if (data.ticket_number) {
            await this.navigate("support");
            this.openSupportTicket(data.ticket_number);
        } else if (data.order_number) {
            this.viewOrder(data.order_number);
        }
    }

    async handleMarkAllNotificationsRead() {
        if (!window.SecondMarketAdminAPI?.markAllNotificationsRead) return;
        try {
            await window.SecondMarketAdminAPI.markAllNotificationsRead();
            (this.state.notifications || []).forEach((n) => { n.is_read = true; });
            this.state.unreadNotificationsCount = 0;
            this.updateNotificationBadge();
            this.renderNotificationsPopover();
            this.showToast("All notifications marked as read.");
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        }
    }

    showNotificationsToast() {
        const alerts = this.getOperationalAlerts();
        if (alerts.length > 0) {
            this.showToast(`Notifications: ${alerts.length} operational alert(s) active.`);
            this.toggleNotificationsPopover();
        } else {
            this.showToast("All operational tasks are up to date.");
        }
    }

    async openCategoryModal() {
        if (!document.getElementById("admin-category-modal")) {
            await this.navigate("categories");
        }

        this.state.editingCategorySlug = null;
        this.state.selectedCategoryImageFile = null;

        const modal = document.getElementById("admin-category-modal");
        if (!modal) return;

        const titleEl = document.getElementById("admin-modal-category-title");
        if (titleEl) titleEl.textContent = "Add New Category";

        const submitBtn = document.getElementById("admin-category-submit-btn");
        if (submitBtn) submitBtn.textContent = "Create Category";

        const form = document.getElementById("admin-category-form");
        form?.reset();

        const slugInput = document.getElementById("admin-category-slug");
        if (slugInput) delete slugInput.dataset.manualEdited;

        const iconSelect = document.getElementById("admin-category-icon");
        if (iconSelect) iconSelect.value = "layers";

        const advContainer = document.getElementById("admin-category-advanced-container");
        if (advContainer) advContainer.style.display = "none";
        const advBtnText = document.getElementById("admin-cat-advanced-toggle-text");
        if (advBtnText) advBtnText.textContent = "+ Advanced Options (Image Upload & Products)";

        this.removeCategoryImage(false);
        this.filterModalProductPicker("");

        modal.style.display = "flex";
        document.body.classList.add("modal-open");
        const nameInput = document.getElementById("admin-category-name");
        setTimeout(() => nameInput?.focus(), 50);
        this.updateSelectedProductsCount();
    }

    async openEditCategoryModal(categorySlug) {
        if (!document.getElementById("admin-category-modal")) {
            await this.navigate("categories");
        }

        const category = (this.state.categories || []).find((c) => c.slug === categorySlug);
        if (!category) return;

        this.state.editingCategorySlug = categorySlug;
        this.state.selectedCategoryImageFile = null;

        const modal = document.getElementById("admin-category-modal");
        if (!modal) return;

        const titleEl = document.getElementById("admin-modal-category-title");
        if (titleEl) titleEl.textContent = "Edit Category";

        const submitBtn = document.getElementById("admin-category-submit-btn");
        if (submitBtn) submitBtn.textContent = "Update Category";

        const nameInput = document.getElementById("admin-category-name");
        if (nameInput) nameInput.value = category.name || "";

        const slugInput = document.getElementById("admin-category-slug");
        if (slugInput) {
            slugInput.value = category.slug || "";
            slugInput.dataset.manualEdited = "true";
        }

        const iconSelect = document.getElementById("admin-category-icon");
        if (iconSelect) {
            if (category.image_url && category.image_url.startsWith("icon:")) {
                iconSelect.value = category.image_url.slice(5).trim();
            } else if (window.SecondMarketAdminPages?.resolveCategoryIcon) {
                iconSelect.value = window.SecondMarketAdminPages.resolveCategoryIcon(category);
            }
        }

        const descInput = document.getElementById("admin-category-description");
        if (descInput) descInput.value = category.description || "";

        const statusSelect = document.getElementById("admin-category-is-active");
        if (statusSelect) statusSelect.value = category.is_active ? "true" : "false";

        const sortInput = document.getElementById("admin-category-sort-order");
        if (sortInput) sortInput.value = category.sort_order ?? 0;

        const urlInput = document.getElementById("admin-category-image-url");
        if (urlInput) urlInput.value = category.image_url || "";

        const advContainer = document.getElementById("admin-category-advanced-container");
        const advBtnText = document.getElementById("admin-cat-advanced-toggle-text");

        const isCustomImage = category.image_url && (category.image_url.startsWith("/") || category.image_url.startsWith("http"));
        if (isCustomImage) {
            if (advContainer) advContainer.style.display = "flex";
            if (advBtnText) advBtnText.textContent = "− Hide Advanced Options";
            this.showCategoryImagePreview(category.image_url, "Current category image", "Existing image (Stored in database)");
        } else {
            if (advContainer) advContainer.style.display = "none";
            if (advBtnText) advBtnText.textContent = "+ Advanced Options (Image Upload & Products)";
            this.removeCategoryImage(false);
        }

        const form = document.getElementById("admin-category-form");
        if (form) {
            form.querySelectorAll('input[name="product_ids"]').forEach((cb) => {
                const prod = (this.state.products || []).find((p) => p.id === parseInt(cb.value, 10));
                cb.checked = Boolean(prod && prod.category?.slug === categorySlug);
            });
        }

        this.filterModalProductPicker("");
        modal.style.display = "flex";
        document.body.classList.add("modal-open");
        setTimeout(() => nameInput?.focus(), 50);
        this.updateSelectedProductsCount();
    }

    closeCategoryModal() {
        const modal = document.getElementById("admin-category-modal");
        if (!modal) return;
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        const form = document.getElementById("admin-category-form");
        form?.reset();
        this.state.editingCategorySlug = null;
        this.state.selectedCategoryImageFile = null;
        this.removeCategoryImage(false);
        this.updateSelectedProductsCount();
        this.flushDeferredRender();
    }

    openDeleteCategoryModal(slug, name, productCount) {
        this.state.deletingCategorySlug = slug;
        this.state.deletingCategoryName = name;
        this.state.deletingCategoryCount = productCount;

        const modal = document.getElementById("admin-delete-category-modal");
        if (!modal) return;

        const titleEl = document.getElementById("admin-delete-category-title");
        if (titleEl) {
            titleEl.textContent = `Delete Category "${name}"?`;
        }

        const countEl = document.getElementById("admin-delete-category-product-count");
        if (countEl) {
            countEl.textContent = productCount;
        }

        const warningEl = document.getElementById("admin-delete-category-warning-text");
        if (warningEl) {
            if (productCount > 0) {
                warningEl.innerHTML = `There are currently <span id="admin-delete-category-product-count">${productCount}</span> products assigned to this category. If you delete it, these products will be moved to "Uncategorized".`;
            } else {
                warningEl.textContent = "Are you sure you want to delete this category? This action cannot be undone.";
            }
        }

        modal.style.display = "flex";
        document.body.classList.add("modal-open");
    }

    closeDeleteCategoryModal() {
        const modal = document.getElementById("admin-delete-category-modal");
        if (modal) modal.style.display = "none";
        document.body.classList.remove("modal-open");
        this.state.deletingCategorySlug = null;
        this.state.deletingCategoryName = null;
        this.state.deletingCategoryCount = null;
        this.flushDeferredRender();
    }

    async confirmUnassignAndDeleteCategory() {
        const slug = this.state.deletingCategorySlug;
        if (!slug || this.state.actionLoading) return;

        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.deleteCategory(slug);
            this.showToast("Category deleted successfully.");
            this.closeDeleteCategoryModal();
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    switchCategoryView(view) {
        const gridView = document.getElementById("admin-category-cards-grid");
        const tableView = document.getElementById("admin-category-table-view");
        const gridBtn = document.getElementById("admin-cat-view-grid-btn");
        const tableBtn = document.getElementById("admin-cat-view-table-btn");

        if (view === "table") {
            if (gridView) gridView.style.display = "none";
            if (tableView) {
                tableView.style.display = "block";
                tableView.removeAttribute("aria-hidden");
            }
            gridBtn?.classList.remove("is-active");
            tableBtn?.classList.add("is-active");
        } else {
            if (gridView) gridView.style.display = "grid";
            if (tableView) {
                tableView.style.display = "none";
                tableView.setAttribute("aria-hidden", "true");
            }
            gridBtn?.classList.add("is-active");
            tableBtn?.classList.remove("is-active");
        }
    }

    filterCategories(query) {
        const q = (query || "").toLowerCase().trim();
        const cardsGrid = document.getElementById("admin-category-cards-grid");
        const tableView = document.getElementById("admin-category-table-view");

        if (cardsGrid) {
            const cards = cardsGrid.querySelectorAll(".admin-category-card");
            cards.forEach((card) => {
                const name = card.querySelector(".admin-category-card-name")?.textContent.toLowerCase() || "";
                const slug = card.querySelector(".admin-category-card-slug")?.textContent.toLowerCase() || "";
                const desc = card.querySelector(".admin-category-card-desc")?.textContent.toLowerCase() || "";
                if (!q || name.includes(q) || slug.includes(q) || desc.includes(q)) {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        }

        if (tableView) {
            const rows = tableView.querySelectorAll("tbody tr");
            rows.forEach((row) => {
                const text = row.textContent.toLowerCase();
                if (!q || text.includes(q)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        }
    }

    toggleCategoryAdvancedOptions() {
        const container = document.getElementById("admin-category-advanced-container");
        const btnText = document.getElementById("admin-cat-advanced-toggle-text");
        if (!container) return;
        const isHidden = container.style.display === "none";
        container.style.display = isHidden ? "flex" : "none";
        if (btnText) {
            btnText.textContent = isHidden ? "− Hide Advanced Options" : "+ Advanced Options (Image Upload & Products)";
        }
    }

    toggleCategoryDropzone() {
        const wrap = document.getElementById("admin-category-dropzone-wrap");
        const btn = document.getElementById("admin-category-dropzone-toggle-btn");
        if (!wrap) return;
        const isHidden = wrap.style.display === "none";
        wrap.style.display = isHidden ? "block" : "none";
        if (btn) btn.textContent = isHidden ? "− Hide Image Upload" : "+ Upload Image File";
    }

    toggleCategoryProductPicker() {
        const wrap = document.getElementById("admin-category-product-picker-container");
        if (!wrap) return;
        wrap.style.display = wrap.style.display === "none" ? "block" : "none";
    }

    showCategoryImagePreview(src, filename, metaText = "") {
        const dropzone = document.getElementById("admin-category-dropzone");
        const previewCard = document.getElementById("admin-category-preview-card");
        const previewImg = document.getElementById("admin-category-preview-img");
        const nameEl = document.getElementById("admin-category-preview-filename");
        const metaEl = document.getElementById("admin-category-preview-meta");

        if (dropzone) dropzone.style.display = "none";
        if (previewCard) previewCard.style.display = "flex";
        if (previewImg) previewImg.src = src;
        if (nameEl) nameEl.textContent = filename;
        if (metaEl && metaText) metaEl.textContent = metaText;
    }

    handleCategoryImageSelected(input) {
        const file = input?.files?.[0];
        if (!file) return;

        this.state.selectedCategoryImageFile = file;
        const objectUrl = URL.createObjectURL(file);
        const sizeFormatted = file.size > 1048576
            ? `${(file.size / 1048576).toFixed(1)} MB`
            : `${Math.round(file.size / 1024)} KB`;

        this.showCategoryImagePreview(objectUrl, file.name, `${sizeFormatted} · Ready to upload`);
    }

    removeCategoryImage(clearInput = true) {
        this.state.selectedCategoryImageFile = null;
        if (clearInput) {
            const fileInput = document.getElementById("admin-category-image-file");
            if (fileInput) fileInput.value = "";
            const urlInput = document.getElementById("admin-category-image-url");
            if (urlInput) urlInput.value = "";
        }
        const dropzone = document.getElementById("admin-category-dropzone");
        const previewCard = document.getElementById("admin-category-preview-card");
        if (dropzone) dropzone.style.display = "flex";
        if (previewCard) previewCard.style.display = "none";
    }

    handleDragOver(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-category-dropzone");
        dropzone?.classList.add("is-dragover");
    }

    handleDragLeave(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-category-dropzone");
        dropzone?.classList.remove("is-dragover");
    }

    handleDrop(event) {
        event.preventDefault();
        const dropzone = document.getElementById("admin-category-dropzone");
        dropzone?.classList.remove("is-dragover");
        if (event.dataTransfer?.files?.[0]) {
            const file = event.dataTransfer.files[0];
            const fileInput = document.getElementById("admin-category-image-file");
            if (fileInput) {
                try {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                } catch (e) {
                    // Fallback
                }
            }
            this.handleCategoryImageSelected({ files: [file] });
        }
    }

    filterModalProductPicker(query) {
        const q = (query || "").toLowerCase().trim();
        const container = document.getElementById("admin-modal-product-checklist");
        if (!container) return;
        const items = container.querySelectorAll(".admin-picker-item");
        items.forEach((item) => {
            const search = item.dataset.search || "";
            if (!q || search.includes(q)) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }
        });
    }

    autoGenerateCategorySlug(name) {
        const slugInput = document.getElementById("admin-category-slug");
        if (!slugInput || slugInput.dataset.manualEdited === "true") return;
        slugInput.value = (name || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    updateSelectedProductsCount() {
        const form = document.getElementById("admin-category-form");
        if (!form) return;
        const selected = form.querySelectorAll('input[name="product_ids"]:checked').length;
        const countBadge = document.getElementById("admin-selected-products-count");
        if (countBadge) {
            countBadge.textContent = `${selected} selected`;
        }
    }

    async createCategory(event) {
        event.preventDefault();
        if (this.state.actionLoading) return;

        const form = new FormData(event.currentTarget);
        const editingSlug = this.state.editingCategorySlug;
        const selectedProductIds = form.getAll("product_ids").map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));

        const categoryName = (form.get("name") || "").toString().trim();
        if (!categoryName) {
            document.getElementById("admin-category-name")?.focus();
            this.showToast("Category title is required.", "error");
            return;
        }

        let sortOrder;
        try {
            sortOrder = this.parseNonNegativeInteger(form.get("sort_order") || "0", "Sort order");
        } catch (error) {
            document.getElementById("admin-category-sort-order")?.focus();
            this.showToast(error.message, "error");
            return;
        }

        let imageUrl = (form.get("image_url") || "").toString().trim() || null;

        if (this.state.selectedCategoryImageFile) {
            try {
                this.setActionLoading(true);
                this.showToast("Uploading category image...");
                const uploadResult = await window.SecondMarketAdminAPI.uploadCategoryImage(this.state.selectedCategoryImageFile);
                imageUrl = uploadResult?.image_url || imageUrl;
                this.state.selectedCategoryImageFile = null;
                const urlInput = document.getElementById("admin-category-image-url");
                if (urlInput && imageUrl) urlInput.value = imageUrl;
            } catch (uploadError) {
                this.showToast(window.SecondMarketAdminAPI.formatError(uploadError), "error");
                this.setActionLoading(false);
                return;
            }
        }

        const iconVal = (form.get("icon") || "").toString().trim();
        if ((!imageUrl || imageUrl.startsWith("icon:")) && iconVal) {
            imageUrl = `icon:${iconVal}`;
        }

        const rawIsActive = form.get("is_active");
        const isActive = rawIsActive === "false" ? false : true;
        const payload = {
            name: categoryName,
            slug: (form.get("slug") || "").toString().trim(),
            description: (form.get("description") || "").toString().trim(),
            sort_order: sortOrder,
            is_active: isActive,
            image_url: imageUrl,
        };

        let assignmentFailed = false;
        try {
            this.setActionLoading(true);
            let targetSlug;

            if (editingSlug) {
                const updated = await window.SecondMarketAdminAPI.updateCategory(editingSlug, payload);
                targetSlug = updated?.slug || payload.slug || editingSlug;
                this.showToast("Category updated successfully.");
            } else {
                const created = await window.SecondMarketAdminAPI.createCategory(payload);
                targetSlug = created?.slug || payload.slug;
                this.showToast("Category created successfully.");
            }

            if (targetSlug && window.SecondMarketAdminAPI.updateProduct) {
                const previousAssigned = (this.state.products || [])
                    .filter((p) => editingSlug && p.category?.slug === editingSlug)
                    .map((p) => p.id);

                if (editingSlug) {
                    const unassignedProductIds = previousAssigned.filter((id) => !selectedProductIds.includes(id));
                    for (const prodId of unassignedProductIds) {
                        const prod = (this.state.products || []).find((p) => p.id === prodId);
                        if (prod?.slug) {
                            try {
                                await window.SecondMarketAdminAPI.updateProduct(prod.slug, {
                                    category_slug: "uncategorized",
                                });
                            } catch (err) {
                                assignmentFailed = true;
                                console.warn("Failed to unassign product:", err);
                            }
                        }
                    }
                }

                for (const prodId of selectedProductIds) {
                    if (!previousAssigned.includes(prodId) || (editingSlug && targetSlug !== editingSlug)) {
                        const prod = (this.state.products || []).find((p) => p.id === prodId);
                        if (prod?.slug) {
                            try {
                                await window.SecondMarketAdminAPI.updateProduct(prod.slug, {
                                    category_slug: targetSlug,
                                });
                            } catch (err) {
                                assignmentFailed = true;
                                console.warn("Failed to assign product:", err);
                            }
                        }
                    }
                }
            }

            this.state.actionLoading = false;
            this.closeCategoryModal();
            await this.refreshInventory();
            if (assignmentFailed) {
                this.showToast("Category saved, though some product assignments could not be updated.", "error");
            }
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setCategoryStatus(categorySlug, isActiveValue) {
        if (this.state.actionLoading) return;

        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateCategoryStatus(categorySlug, isActiveValue === "true");
            this.showToast("Category status updated.");
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    async setCategorySortOrder(event, categorySlug) {
        event.preventDefault();
        if (this.state.actionLoading) return;

        const form = new FormData(event.currentTarget);
        let sortOrder;

        try {
            sortOrder = this.parseNonNegativeInteger(form.get("sort_order") || "0", "Sort order");
        } catch (error) {
            this.showToast(error.message, "error");
            return;
        }

        try {
            this.setActionLoading(true);
            await window.SecondMarketAdminAPI.updateCategory(categorySlug, { sort_order: sortOrder });
            this.showToast("Category sort order updated.");
            await this.refreshInventory();
        } catch (error) {
            this.showToast(window.SecondMarketAdminAPI.formatError(error), "error");
        } finally {
            this.setActionLoading(false);
        }
    }

    toggleMobileSidebar(force) {
        const sidebar = document.querySelector(".admin-sidebar");
        const backdrop = document.getElementById("admin-sidebar-backdrop");
        const menuBtn = document.getElementById("admin-mobile-menu-btn");
        if (!sidebar) {
            return;
        }
        const shouldOpen = typeof force === "boolean" ? force : !sidebar.classList.contains("is-mobile-open");
        sidebar.classList.toggle("is-mobile-open", shouldOpen);
        if (backdrop) {
            backdrop.classList.toggle("is-open", shouldOpen);
        }
        if (menuBtn) {
            menuBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        }
    }

    async navigate(viewName) {
        this.toggleMobileSidebar(false);
        document.querySelectorAll('#admin-main-content .admin-modal, #admin-main-content [role="dialog"]').forEach((el) => {
            el.style.display = "none";
            el.classList.remove("is-open");
        });
        document.body.classList.remove("modal-open");
        this.state.deferredRender = false;
        this.state.currentView = viewName;
        try {
            window.location.hash = viewName;
        } catch (e) {}
        if (viewName !== "orders") {
            this.state.currentOrder = null;
        }
        if (viewName === "reports" && (!this.state.salesReport || !this.state.inventoryReport)) {
            await this.refreshReports();
        } else if (viewName === "dashboard" && !this.state.dashboardKPIs) {
            await this.refreshDashboard();
        } else if (viewName === "support") {
            await this.refreshSupportTickets();
        } else if (viewName === "returns") {
            await this.refreshReturns();
        } else if (viewName === "coupons") {
            await this.refreshCoupons();
        } else if (viewName === "customers") {
            await this.refreshCustomers();
        } else if (viewName === "payments") {
            await this.refreshPayments();
        } else if (viewName === "settings") {
            await this.refreshSettings();
        }
        this.render();
        window.scrollTo({ top: 0, behavior: "instant" });
        document.getElementById("admin-main-content")?.focus({ preventScroll: true });
    }

    async logout() {
        try {
            await window.SecondMarketAuthAPI.logout();
        } finally {
            window.location.href = "/admin/login.html";
        }
    }

    loadPageTemplate(templateName) {
        if (this.templateCache[templateName]) {
            return this.templateCache[templateName];
        }

        // Native HTML5 <template> discovery in DOM (Zero-latency instant in-memory lookup)
        const nativeTemplate = document.getElementById(`template-${templateName}`);
        if (nativeTemplate && nativeTemplate.tagName === "TEMPLATE") {
            this.templateCache[templateName] = nativeTemplate.innerHTML.trim();
            return this.templateCache[templateName];
        }

        const request = new XMLHttpRequest();
        request.open("GET", `/admin/pages/${templateName}.html`, false);
        request.send(null);

        if (request.status < 200 || request.status >= 300) {
            return `
                <section class="admin-state-panel">
                    <h2>Page Template Missing</h2>
                    <p>${this.escapeHtml(templateName)} could not be loaded.</p>
                </section>
            `;
        }

        const responseText = request.responseText;
        const templateMatch = responseText.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
        this.templateCache[templateName] = templateMatch ? templateMatch[1].trim() : responseText;
        return this.templateCache[templateName];
    }

    renderPageTemplate(templateName, replacements = {}) {
        return Object.entries(replacements).reduce(
            (html, [key, value]) => html.replaceAll(`{{${key}}}`, value ?? ""),
            this.loadPageTemplate(templateName)
        );
    }

    renderInventoryStatus(message) {
        if (this.state.loading) {
            return `<div class="admin-state-panel"><h2>Loading</h2><p>${this.escapeHtml(message)}</p></div>`;
        }

        if (this.state.error) {
            return `<div class="admin-state-panel"><h2>Unable to load data</h2><p>${this.escapeHtml(this.state.error)}</p></div>`;
        }

        return "";
    }

    render() {
        const main = document.getElementById("admin-main-content");
        if (!main) return;

        this.updateUserDisplay();
        this.updateNavigation();
        this.updateNotificationBadge();

        if (this.getOpenMainModal()) {
            this.state.deferredRender = true;
            return;
        }
        this.state.deferredRender = false;

        if (!this.state.user) {
            main.innerHTML = this.renderAccessPanel(
                "Admin Sign In Required",
                "Sign in with an admin seller account to manage SecondMarket inventory.",
                "/admin/login.html",
                "Go To Sign In"
            );
            return;
        }

        if (!this.isStaffUser(this.state.user)) {
            main.innerHTML = this.renderAccessPanel(
                "Admin Access Required",
                "Your current account does not have permission to manage seller inventory.",
                "/",
                "Back To Storefront"
            );
            return;
        }

        if (!this.hasCapability(this.state.currentView)) {
            main.innerHTML = this.renderAccessPanel(
                "Section Restricted",
                `Your assigned role (${this.state.user.role}) does not include access to ${this.state.currentView}.`,
                "#dashboard",
                "Return to Dashboard"
            );
            return;
        }

        const breadcrumbEl = document.getElementById("admin-header-breadcrumb");
        const titleEl = document.getElementById("admin-page-title");
        const viewMeta = {
            dashboard: { breadcrumb: "Dashboard", title: "Executive Dashboard" },
            products: { breadcrumb: "Products", title: "Product Listings" },
            categories: { breadcrumb: "Categories", title: "Categories Taxonomy" },
            orders: { breadcrumb: "Orders", title: "Orders & Fulfillment" },
            customers: { breadcrumb: "Customers", title: "Customer Accounts" },
            payments: { breadcrumb: "Payments", title: "Payments & Transactions Ledger" },
            moderation: { breadcrumb: "Moderation", title: "Marketplace Moderation" },
            support: { breadcrumb: "Support", title: "Buyer Support Tickets" },
            returns: { breadcrumb: "Returns", title: "Returns & Refunds" },
            coupons: { breadcrumb: "Coupons", title: "Coupons & Promotions" },
            reports: { breadcrumb: "Reports", title: "Marketplace Reports" },
            settings: { breadcrumb: "Settings", title: "Store Settings & Security" },
        };
        const currentMeta = viewMeta[this.state.currentView] || viewMeta.dashboard;
        if (breadcrumbEl) breadcrumbEl.textContent = currentMeta.breadcrumb;
        if (titleEl) titleEl.textContent = currentMeta.title;

        if (this.state.currentView === "products") {
            main.innerHTML = window.SecondMarketAdminPages.renderProductsPage.call(this);
            return;
        }

        if (this.state.currentView === "categories") {
            main.innerHTML = window.SecondMarketAdminPages.renderCategoriesPage.call(this);
            return;
        }

        if (this.state.currentView === "orders") {
            main.innerHTML = window.SecondMarketAdminPages.renderOrdersPage.call(this);
            return;
        }

        if (this.state.currentView === "customers" && window.SecondMarketAdminPages.renderCustomersPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderCustomersPage.call(this);
            return;
        }

        if (this.state.currentView === "payments" && window.SecondMarketAdminPages.renderPaymentsPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderPaymentsPage.call(this);
            return;
        }

        if (this.state.currentView === "moderation") {
            main.innerHTML = window.SecondMarketAdminPages.renderModerationPage.call(this);
            return;
        }

        if (this.state.currentView === "support" && window.SecondMarketAdminPages.renderSupportPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderSupportPage.call(this);
            return;
        }

        if (this.state.currentView === "returns" && window.SecondMarketAdminPages.renderReturnsPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderReturnsPage.call(this);
            return;
        }

        if (this.state.currentView === "coupons" && window.SecondMarketAdminPages.renderCouponsPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderCouponsPage.call(this);
            return;
        }

        if (this.state.currentView === "reports") {
            main.innerHTML = window.SecondMarketAdminPages.renderReportsPage.call(this);
            return;
        }

        if (this.state.currentView === "settings" && window.SecondMarketAdminPages.renderSettingsPage) {
            main.innerHTML = window.SecondMarketAdminPages.renderSettingsPage.call(this);
            return;
        }

        main.innerHTML = window.SecondMarketAdminPages.renderDashboardPage.call(this);
    }

    renderAccessPanel(title, message, href, actionText) {
        return `
            <section class="admin-state-panel" aria-live="polite">
                <h2>${this.escapeHtml(title)}</h2>
                <p>${this.escapeHtml(message)}</p>
                <a href="${href}" class="admin-button-primary">${this.escapeHtml(actionText)}</a>
            </section>
        `;
    }

    updateUserDisplay() {
        const label = document.querySelector("[data-admin-user-name]");
        const fullName = this.state.user
            ? `${this.state.user.first_name || ""} ${this.state.user.last_name || ""}`.trim() || "Admin Seller"
            : "Not signed in";
        const initials = this.state.user
            ? `${(this.state.user.first_name || "A")[0]}${(this.state.user.last_name || "S")[0]}`.toUpperCase()
            : "AS";

        if (label) {
            label.textContent = this.state.user
                ? `${fullName} (${this.state.user.role})`
                : "Not signed in";
        }
        const sidebarName = document.getElementById("admin-sidebar-name");
        if (sidebarName && this.state.user) sidebarName.textContent = fullName;
        const sidebarAvatar = document.getElementById("admin-sidebar-avatar");
        if (sidebarAvatar && this.state.user) sidebarAvatar.textContent = initials;
        const topbarAvatar = document.getElementById("admin-topbar-avatar");
        if (topbarAvatar && this.state.user) topbarAvatar.textContent = initials;
    }

    updateNavigation() {
        document.querySelectorAll("[data-admin-nav]").forEach((button) => {
            const view = button.dataset.adminNav;
            button.classList.toggle("is-active", view === this.state.currentView);
            if (this.state.user && !this.hasCapability(view)) {
                button.style.display = "none";
            } else {
                button.style.display = "";
            }
        });

        const prodBadge = document.getElementById("admin-badge-product-count");
        if (prodBadge) {
            const count = (this.state.products || []).length;
            prodBadge.textContent = count > 0 ? String(count) : "";
            prodBadge.style.display = count > 0 ? "inline-flex" : "none";
        }

        const ordBadge = document.getElementById("admin-badge-orders-count");
        if (ordBadge) {
            const pendingCount = (this.state.orders || []).filter((o) =>
                ["pending", "confirmed", "processing"].includes((o.status || "").toLowerCase())
            ).length;
            ordBadge.textContent = pendingCount > 0 ? String(pendingCount) : "";
            ordBadge.style.display = pendingCount > 0 ? "inline-flex" : "none";
        }

        const modBadge = document.getElementById("admin-badge-moderation-count");
        if (modBadge) {
            const openReports = (this.state.moderationReports || []).filter((r) =>
                (r.status || "").toLowerCase() === "pending"
            ).length;
            modBadge.textContent = openReports > 0 ? String(openReports) : "";
            modBadge.style.display = openReports > 0 ? "inline-flex" : "none";
        }

        const supBadge = document.getElementById("admin-badge-support-count");
        if (supBadge) {
            const openTickets = (this.state.supportTickets || []).filter((t) =>
                ["open", "in_progress"].includes((t.status || "").toLowerCase())
            ).length;
            supBadge.textContent = openTickets > 0 ? String(openTickets) : "";
            supBadge.style.display = openTickets > 0 ? "inline-flex" : "none";
        }

        const retBadge = document.getElementById("admin-badge-returns-count");
        if (retBadge) {
            const reqReturns = (this.state.returnsList || []).filter((r) =>
                (r.status || "").toLowerCase() === "requested"
            ).length;
            retBadge.textContent = reqReturns > 0 ? String(reqReturns) : "";
            retBadge.style.display = reqReturns > 0 ? "inline-flex" : "none";
        }
    }

    productCell(product) {
        const imageUrl = product.primary_image?.url || "/static/productImages/bags/young-girl-with-gray-student-backpack.jpg";
        const imageAlt = product.primary_image?.alt_text || product.title;
        return `
            <div class="admin-product-cell">
                <img src="${this.escapeAttribute(imageUrl)}" alt="${this.escapeAttribute(imageAlt)}" class="admin-product-thumb">
                <div>
                    <strong>${this.escapeHtml(product.title)}</strong>
                    <div class="admin-muted">${this.escapeHtml(product.slug)}</div>
                </div>
            </div>
        `;
    }

    statusBadge(status, label = null) {
        return `<span class="admin-badge ${this.escapeAttribute(status)}">${this.escapeHtml(label || status)}</span>`;
    }

    conditionLabel(condition) {
        const labels = {
            new_other: "New Other",
            like_new: "Like New",
            good: "Good",
            fair: "Fair",
            for_repair: "For Repair",
        };
        return labels[condition] || "Secondhand";
    }

    formatPrice(price) {
        const val = typeof price === "object" ? (price?.amount ?? 0) : Number(price || 0);
        return `₱${Number(val).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }

    formatCurrency(amount) {
        return this.formatPrice(amount);
    }

    formatDate(value) {
        if (!value) return "Not available";
        return new Date(value).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    emptyTableRow(message, colspan) {
        return `<tr><td colspan="${colspan}" class="admin-empty-row">${this.escapeHtml(message)}</td></tr>`;
    }

    showToast(message, type = "success") {
        const container = document.getElementById("admin-toast-container");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `admin-toast ${type === "error" ? "is-error" : ""}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    escapeAttribute(value) {
        return this.escapeHtml(value).replaceAll("`", "&#096;");
    }
}

let adminApp;
window.addEventListener("DOMContentLoaded", () => {
    adminApp = new SecondMarketAdminApp();
});
window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        adminApp?.closeCategoryModal();
        adminApp?.closeDeleteCategoryModal();
        adminApp?.closeProductModal();
        adminApp?.closeProductMovementsModal();
        adminApp?.closeGlobalSearchPopover();
        adminApp?.closeNotificationsPopover();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const globalSearch = document.querySelector(".admin-global-search-input");
        globalSearch?.focus();
        globalSearch?.select();
    }
});
document.addEventListener("click", (event) => {
    const searchWrap = document.getElementById("admin-global-search-wrap");
    if (searchWrap && !searchWrap.contains(event.target)) {
        adminApp?.closeGlobalSearchPopover();
    }
    const notifWrap = document.querySelector(".admin-notifications-container");
    if (notifWrap && !notifWrap.contains(event.target)) {
        adminApp?.closeNotificationsPopover();
    }
});
