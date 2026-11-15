(function () {
    const BASE_URL = "/api/v1/admin";

    async function request(path, options = {}) {
        const response = await fetch(`${BASE_URL}${path}`, {
            credentials: "include",
            headers: {
                Accept: "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });
        const payload = await response.json().catch(() => ({
            success: false,
            message: "The server returned an unreadable response.",
            error: { details: {} },
        }));

        if (!response.ok || payload.success === false) {
            const error = new Error(payload.message || "Admin request failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function buildQueryString(params = {}) {
        const query = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "" || value === "all") return;
            query.set(key, value);
        });

        const queryString = query.toString();
        return queryString ? `?${queryString}` : "";
    }

    async function listCategories() {
        const payload = await request("/categories");
        return payload.data;
    }

    async function createCategory(data) {
        const payload = await request("/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function updateCategory(categorySlug, data) {
        const payload = await request(`/categories/${encodeURIComponent(categorySlug)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function updateCategoryStatus(categorySlug, isActive) {
        const payload = await request(`/categories/${encodeURIComponent(categorySlug)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive }),
        });
        return payload.data;
    }

    async function deleteCategory(categorySlug) {
        const payload = await request(`/categories/${encodeURIComponent(categorySlug)}`, {
            method: "DELETE",
        });
        return payload.data;
    }


    async function uploadCategoryImage(file) {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`${BASE_URL}/categories/upload-image`, {
            method: "POST",
            credentials: "include",
            body: formData,
        });
        const payload = await response.json().catch(() => ({
            success: false,
            message: "The server returned an unreadable response.",
            error: { details: {} },
        }));

        if (!response.ok || payload.success === false) {
            const error = new Error(payload.message || "Image upload failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload.data;
    }

    async function listProducts(filters = {}) {
        const payload = await request(`/products${buildQueryString(filters)}`);
        return {
            products: payload.data,
            count: payload.meta?.count || payload.data.length,
        };
    }

    async function listOrders(filters = {}) {
        const payload = await request(`/orders${buildQueryString(filters)}`);
        return {
            orders: payload.data,
            count: payload.meta?.count || payload.data.length,
        };
    }

    async function getOrder(orderNumber) {
        const payload = await request(`/orders/${encodeURIComponent(orderNumber)}`);
        return payload.data;
    }

    async function updateOrderFulfillment(orderNumber, payload) {
        const res = await request(`/orders/${encodeURIComponent(orderNumber)}/fulfillment`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return res.data;
    }

    async function bulkOrdersAction(orderNumbers, action) {
        const res = await request("/orders/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_numbers: orderNumbers, action }),
        });
        return res.data;
    }

    async function updateProductStatus(productSlug, status) {
        const payload = await request(`/products/${encodeURIComponent(productSlug)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        return payload.data;
    }

    async function updateProduct(productSlug, data) {
        const payload = await request(`/products/${encodeURIComponent(productSlug)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function createProduct(data) {
        const payload = await request("/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function deleteProduct(productSlug) {
        const payload = await request(`/products/${encodeURIComponent(productSlug)}`, {
            method: "DELETE",
        });
        return payload.data;
    }

    async function bulkUpdateProducts(data) {
        const payload = await request("/products/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function uploadProductImage(file) {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`${BASE_URL}/products/upload-image`, {
            method: "POST",
            credentials: "include",
            body: formData,
        });
        const payload = await response.json().catch(() => ({
            success: false,
            message: "The server returned an unreadable response.",
            error: { details: {} },
        }));

        if (!response.ok || payload.success === false) {
            const error = new Error(payload.message || "Product image upload failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload.data;
    }

    async function updateProductInventory(productSlug, quantity, reason = "manual_adjustment") {
        const payload = await request(`/products/${encodeURIComponent(productSlug)}/inventory`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity, reason }),
        });
        return payload.data;
    }

    async function getProductMovements(productSlug) {
        const payload = await request(`/products/${encodeURIComponent(productSlug)}/movements`);
        return payload.data;
    }

    async function listReviews(filters = {}) {
        const payload = await request(`/reviews${buildQueryString(filters)}`);
        return {
            reviews: payload.data,
            count: payload.meta?.count || payload.data.length,
        };
    }

    async function updateReviewStatus(reviewId, status) {
        const payload = await request(`/reviews/${encodeURIComponent(reviewId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        return payload.data;
    }

    async function listReports(filters = {}) {
        const payload = await request(`/reports${buildQueryString(filters)}`);
        return {
            reports: payload.data,
            count: payload.meta?.count || payload.data.length,
        };
    }

    async function updateReportStatus(reportId, status) {
        const payload = await request(`/reports/${encodeURIComponent(reportId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        return payload.data;
    }

    async function getDashboardKPIs(filters = {}) {
        const payload = await request(`/reports/dashboard${buildQueryString(filters)}`);
        return payload.data;
    }

    async function getSalesReport(filters = {}) {
        const payload = await request(`/reports/sales${buildQueryString(filters)}`);
        return payload.data;
    }

    async function getInventoryReport(filters = {}) {
        const payload = await request(`/reports/inventory${buildQueryString(filters)}`);
        return payload.data;
    }

    function getExportUrl(type, filters = {}) {
        return `${BASE_URL}/reports/export${buildQueryString({ ...filters, type })}`;
    }

    async function importProductsCSV(fileOrText) {
        if (typeof fileOrText === "string") {
            const payload = await request("/products/import-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csv_data: fileOrText }),
            });
            return payload.data;
        }
        const formData = new FormData();
        formData.append("file", fileOrText);
        const response = await fetch(`${BASE_URL}/products/import-csv`, {
            method: "POST",
            credentials: "include",
            body: formData,
        });
        const payload = await response.json();
        if (!response.ok) {
            const error = new Error(payload.message || "CSV import failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload.data;
    }

    async function listSupportTickets(filters = {}) {
        const payload = await request(`/support/tickets${buildQueryString(filters)}`);
        return payload.data;
    }

    async function getSupportTicketDetail(ticketNumber) {
        const payload = await request(`/support/tickets/${encodeURIComponent(ticketNumber)}`);
        return payload.data;
    }

    async function sendSupportMessage(ticketNumber, message) {
        const payload = await request(`/support/tickets/${encodeURIComponent(ticketNumber)}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
        });
        return payload.data;
    }

    async function updateSupportTicketStatus(ticketNumber, status) {
        const payload = await request(`/support/tickets/${encodeURIComponent(ticketNumber)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        return payload.data;
    }

    async function listReturns(filters = {}) {
        const payload = await request(`/returns${buildQueryString(filters)}`);
        return payload.data;
    }

    async function updateReturnStatus(returnNumber, data) {
        const payload = await request(`/returns/${encodeURIComponent(returnNumber)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function listCoupons(activeOnly = false) {
        const query = activeOnly ? "?active=true" : "";
        const payload = await request(`/coupons${query}`);
        return payload.data?.coupons || [];
    }

    async function createCoupon(data) {
        const payload = await request("/coupons", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function toggleCouponStatus(couponId, isActive) {
        const payload = await request(`/coupons/${encodeURIComponent(couponId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive }),
        });
        return payload.data;
    }

    async function updateCoupon(couponId, data) {
        const payload = await request(`/coupons/${encodeURIComponent(couponId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function deleteCoupon(couponId) {
        const payload = await request(`/coupons/${encodeURIComponent(couponId)}`, {
            method: "DELETE",
        });
        return payload.data;
    }

    async function getCouponRedemptions(couponId) {
        const payload = await request(`/coupons/${encodeURIComponent(couponId)}/redemptions`);
        return payload.data;
    }

    async function rootRequest(path, options = {}) {
        const response = await fetch(`/api/v1${path}`, {
            credentials: "include",
            headers: {
                Accept: "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });
        const payload = await response.json().catch(() => ({
            success: false,
            message: "The server returned an unreadable response.",
            error: { details: {} },
        }));

        if (!response.ok || payload.success === false) {
            const error = new Error(payload.message || "Request failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    async function globalSearch(query) {
        const qs = buildQueryString({ q: query });
        const payload = await request(`/search${qs}`);
        return payload.data;
    }

    async function listNotifications(params = {}) {
        const qs = buildQueryString(params);
        const payload = await rootRequest(`/notifications${qs}`);
        return payload.data;
    }

    async function getUnreadNotificationCount() {
        const payload = await rootRequest("/notifications/unread-count");
        return payload.data?.unread_count || 0;
    }

    async function markNotificationRead(notificationId) {
        const payload = await rootRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: "PATCH",
        });
        return payload.data;
    }

    async function markAllNotificationsRead() {
        const payload = await rootRequest("/notifications/mark-all-read", {
            method: "POST",
        });
        return payload.data;
    }

    async function listCustomers(params = {}) {
        const qs = buildQueryString(params);
        const payload = await request(`/customers${qs}`);
        return payload.data;
    }

    async function getCustomer(customerId) {
        const payload = await request(`/customers/${encodeURIComponent(customerId)}`);
        return payload.data;
    }

    async function updateCustomerStatus(customerId, status) {
        const payload = await request(`/customers/${encodeURIComponent(customerId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        return payload.data;
    }

    async function revokeCustomerSessions(customerId) {
        const payload = await request(`/customers/${encodeURIComponent(customerId)}/revoke-sessions`, {
            method: "POST",
        });
        return payload.data;
    }

    async function listPayments(params = {}) {
        const qs = buildQueryString(params);
        const payload = await request(`/payments${qs}`);
        return payload.data;
    }

    async function reconcilePayment(paymentId) {
        const payload = await request(`/payments/${encodeURIComponent(paymentId)}/reconcile`, {
            method: "POST",
        });
        return payload.data;
    }

    async function refundPayment(paymentId, data = {}) {
        const payload = await request(`/payments/${encodeURIComponent(paymentId)}/refund`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function getStoreSettings() {
        const payload = await request("/settings");
        return payload.data;
    }

    async function updateStoreSettings(data) {
        const payload = await request("/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function listStaff() {
        const payload = await request("/staff");
        return payload.data;
    }

    async function saveStaffMember(data) {
        const payload = await request("/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function listAuditLogs(params = {}) {
        const qs = buildQueryString(params);
        const payload = await request(`/audit-logs${qs}`);
        return payload.data;
    }

    function formatError(error) {
        const details = error?.payload?.error?.details || {};
        const messages = Object.values(details).flat().filter(Boolean);
        return messages.length ? messages.join(" ") : error.message || "The admin workspace is temporarily unavailable.";
    }

    window.SecondMarketAdminAPI = {
        buildQueryString,
        createCategory,
        deleteCategory,
        formatError,
        getDashboardKPIs,
        getExportUrl,
        getInventoryReport,
        getOrder,
        getSalesReport,
        listCategories,
        listOrders,
        listProducts,
        listReviews,
        listReports,
        updateCategory,
        updateCategoryStatus,
        updateOrderFulfillment,
        bulkOrdersAction,
        uploadCategoryImage,
        createProduct,
        deleteProduct,
        bulkUpdateProducts,
        uploadProductImage,
        updateProduct,
        updateProductInventory,
        getProductMovements,
        updateProductStatus,
        updateReviewStatus,
        updateReportStatus,
        importProductsCSV,
        listSupportTickets,
        getSupportTicketDetail,
        sendSupportMessage,
        updateSupportTicketStatus,
        listReturns,
        updateReturnStatus,
        listCoupons,
        createCoupon,
        updateCoupon,
        deleteCoupon,
        getCouponRedemptions,
        toggleCouponStatus,
        globalSearch,
        listNotifications,
        getUnreadNotificationCount,
        markNotificationRead,
        markAllNotificationsRead,
        listCustomers,
        getCustomer,
        updateCustomerStatus,
        revokeCustomerSessions,
        listPayments,
        reconcilePayment,
        refundPayment,
        getStoreSettings,
        updateStoreSettings,
        listStaff,
        saveStaffMember,
        listAuditLogs,
    };
})();

