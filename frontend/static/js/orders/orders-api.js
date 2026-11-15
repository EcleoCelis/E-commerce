(function () {
    const BASE_URL = "/api/v1/orders";

    async function fetchJson(url, options = {}, fallbackError = "Order request failed.", _retriedCsrf = false) {
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

        const response = await fetch(url, {
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
            return fetchJson(url, options, fallbackError, true);
        }

        if (!response.ok || payload?.success === false) {
            const error = new Error(payload?.message || payload?.error?.message || fallbackError);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    async function request(path = "", options = {}) {
        return fetchJson(`${BASE_URL}${path}`, options, "Order request failed.");
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

    async function listOrders(filters = {}) {
        const payload = await request(buildQueryString(filters));
        return {
            orders: payload.data,
            count: payload.meta?.count || payload.data.length,
        };
    }

    async function getOrder(orderNumber) {
        const payload = await request(`/${encodeURIComponent(orderNumber)}`);
        return payload.data;
    }

    async function cancelOrder(orderNumber) {
        const payload = await request(`/${encodeURIComponent(orderNumber)}/cancel`, {
            method: "PATCH",
        });
        return payload.data;
    }

    async function confirmPayment(orderNumber, referenceNumber = "") {
        const cleanRef = String(referenceNumber || "").trim();
        const payload = await fetchJson(
            `/api/v1/checkout/payments/${encodeURIComponent(orderNumber)}/confirm`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cleanRef ? { reference_number: cleanRef } : {}),
            },
            "Payment confirmation failed."
        );
        return payload.data;
    }

    async function getPaymentIntent(orderNumber) {
        const payload = await fetchJson(
            `/api/v1/checkout/payments/${encodeURIComponent(orderNumber)}`,
            {},
            "Unable to initialize payment session."
        );
        return payload.data;
    }

    async function verifyStripeSession(orderNumber, sessionId = "") {
        const cleanId = String(sessionId || "").trim();
        const payload = await fetchJson(
            `/api/v1/checkout/payments/${encodeURIComponent(orderNumber)}/verify-stripe`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cleanId ? { session_id: cleanId } : {}),
            },
            "Stripe payment verification failed."
        );
        return payload.data;
    }

    async function getOrderReturn(orderNumber) {
        const payload = await request(`/${encodeURIComponent(orderNumber)}/returns`);
        return payload.data?.return_request || null;
    }

    async function requestReturn(orderNumber, data) {
        const payload = await request(`/${encodeURIComponent(orderNumber)}/returns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
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
        return messages.length ? messages.join(" ") : error.message || "The order workspace is temporarily unavailable.";
    }

    window.SecondMarketOrdersAPI = {
        buildQueryString,
        cancelOrder,
        confirmPayment,
        formatError,
        getOrder,
        getOrderReturn,
        getPaymentIntent,
        listOrders,
        requestReturn,
        verifyStripeSession,
    };
})();
