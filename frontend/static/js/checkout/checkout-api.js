(function () {
    const BASE_URL = "/api/v1/cart";
    const CHECKOUT_BASE_URL = "/api/v1/checkout";

    async function request(path = "", options = {}, baseUrl = BASE_URL, _retriedCsrf = false) {
        const method = String(options.method || "GET").toUpperCase();
        const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
        const headers = {
            Accept: "application/json",
            ...(options.headers || {}),
        };
        if (isMutating && !headers["X-CSRF-Token"] && window.SecondMarketAuthAPI?.getCsrfToken) {
            const csrfToken = await window.SecondMarketAuthAPI.getCsrfToken();
            if (csrfToken) {
                headers["X-CSRF-Token"] = csrfToken;
            }
        }

        const response = await fetch(`${baseUrl}${path}`, {
            credentials: "include",
            ...options,
            headers,
        });
        const payload = await response.json().catch(() => ({
            success: false,
            message: "The server returned an unreadable response.",
            error: { details: {} },
        }));

        if (
            response.status === 403
            && !_retriedCsrf
            && isMutating
            && payload?.error?.code === "csrf_token_invalid"
            && window.SecondMarketAuthAPI?.getCsrfToken
        ) {
            await window.SecondMarketAuthAPI.getCsrfToken(true);
            return request(path, options, baseUrl, true);
        }

        if (!response.ok || payload.success === false) {
            const error = new Error(payload.message || payload?.error?.message || "Cart request failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    async function getCart() {
        const payload = await request("");
        return payload.data;
    }

    async function addItem(productSlug, quantity = 1) {
        const payload = await request("/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_slug: productSlug, quantity }),
        });
        return payload.data;
    }

    async function updateItem(productSlug, quantity) {
        const payload = await request(`/items/${encodeURIComponent(productSlug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity }),
        });
        return payload.data;
    }

    async function removeItem(productSlug) {
        const payload = await request(`/items/${encodeURIComponent(productSlug)}`, {
            method: "DELETE",
        });
        return payload.data;
    }

    async function createDraft(checkoutData) {
        const payload = await request("/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(checkoutData),
        }, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function confirmOrder(checkoutData, idempotencyKey = "") {
        const headers = { "Content-Type": "application/json" };
        if (idempotencyKey) {
            headers["Idempotency-Key"] = idempotencyKey;
        }
        const payload = await request("/confirm", {
            method: "POST",
            headers,
            body: JSON.stringify(checkoutData),
        }, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function getOrderConfirmation(orderNumber) {
        const payload = await request(`/${encodeURIComponent(orderNumber)}`, {}, "/api/v1/orders");
        return payload.data;
    }

    async function applyCoupon(code, subtotalAmount) {
        const payload = await request("/coupons/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: String(code || "").trim(),
                subtotal: Number(subtotalAmount || 0),
            }),
        }, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function confirmPayment(orderNumber, referenceNumber = "") {
        const cleanRef = String(referenceNumber || "").trim();
        const payload = await request(`/payments/${encodeURIComponent(orderNumber)}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleanRef ? { reference_number: cleanRef } : {}),
        }, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function getPaymentMethods() {
        const payload = await request("/payments/methods", {}, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function getPaymentIntent(orderNumber) {
        const payload = await request(`/payments/${encodeURIComponent(orderNumber)}`, {}, CHECKOUT_BASE_URL);
        return payload.data;
    }

    async function verifyStripeSession(orderNumber, sessionId = "") {
        const cleanId = String(sessionId || "").trim();
        const payload = await request(`/payments/${encodeURIComponent(orderNumber)}/verify-stripe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleanId ? { session_id: cleanId } : {}),
        }, CHECKOUT_BASE_URL);
        return payload.data;
    }

    function collectDetailMessages(value) {
        if (!value) {
            return [];
        }
        if (typeof value === "string") {
            return [value];
        }
        if (Array.isArray(value)) {
            return value.flatMap((entry) => collectDetailMessages(entry));
        }
        if (typeof value === "object") {
            return Object.values(value).flatMap((entry) => collectDetailMessages(entry));
        }
        return [String(value)];
    }

    function formatError(error) {
        const details = error?.payload?.error?.details || {};
        const messages = collectDetailMessages(details).filter(Boolean);
        return messages.length ? messages.join(" ") : error.message || "The checkout workspace is temporarily unavailable.";
    }

    window.SecondMarketCheckoutAPI = {
        addItem,
        applyCoupon,
        confirmOrder,
        confirmPayment,
        createDraft,
        formatError,
        getCart,
        getOrderConfirmation,
        getPaymentIntent,
        getPaymentMethods,
        removeItem,
        updateItem,
        verifyStripeSession,
    };
})();
