(function () {
    const API_BASE_URL = "/api/v1/auth";
    const THEME_STORAGE_KEY = "secondmarket:theme";
    const VALID_THEMES = ["light", "dark", "system"];

    function getSystemDarkPreference() {
        try {
            return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        } catch (err) {
            return false;
        }
    }

    function normalizeThemePreference(value) {
        const cleaned = String(value || "").trim().toLowerCase();
        return VALID_THEMES.includes(cleaned) ? cleaned : "light";
    }

    function getStoredThemePreference() {
        try {
            return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY) || "light");
        } catch (err) {
            return "light";
        }
    }

    function resolveEffectiveTheme(preference) {
        const pref = normalizeThemePreference(preference);
        if (pref === "system") {
            return getSystemDarkPreference() ? "dark" : "light";
        }
        return pref;
    }

    function applyThemeToDocument(preference, persistLocal = true) {
        const pref = normalizeThemePreference(preference);
        const effective = resolveEffectiveTheme(pref);
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.setAttribute("data-theme", effective);
            document.documentElement.setAttribute("data-theme-preference", pref);
            document.documentElement.style.colorScheme = effective;
        }
        if (persistLocal) {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, pref);
            } catch (err) {
                // Ignore storage quota / privacy errors
            }
        }
        if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
            window.dispatchEvent(
                new CustomEvent("secondmarket:themechange", {
                    detail: { preference: pref, effective },
                })
            );
        }
        return { preference: pref, effective };
    }

    // Apply stored theme immediately on script load to prevent FOUC
    applyThemeToDocument(getStoredThemePreference(), false);

    // Listen to OS dark mode changes when preference is "system"
    try {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            const handleSystemChange = () => {
                if (getStoredThemePreference() === "system") {
                    applyThemeToDocument("system", false);
                }
            };
            if (typeof mediaQuery.addEventListener === "function") {
                mediaQuery.addEventListener("change", handleSystemChange);
            } else if (typeof mediaQuery.addListener === "function") {
                mediaQuery.addListener(handleSystemChange);
            }
        }
    } catch (err) {
        // Ignore matchMedia listener errors
    }

    window.SecondMarketTheme = {
        getPreference: getStoredThemePreference,
        getEffectiveTheme: () => resolveEffectiveTheme(getStoredThemePreference()),
        setPreference: (preference, persistLocal = true) => applyThemeToDocument(preference, persistLocal),
        syncFromUser: (user) => {
            if (user && user.theme_preference && VALID_THEMES.includes(user.theme_preference)) {
                return applyThemeToDocument(user.theme_preference, true);
            }
            return applyThemeToDocument(getStoredThemePreference(), false);
        },
    };

    let cachedCsrfToken = null;

    async function getCsrfToken(forceRefresh = false) {
        if (!forceRefresh && cachedCsrfToken) {
            return cachedCsrfToken;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/csrf-token`, {
                credentials: "include",
                headers: { Accept: "application/json" },
            });
            const payload = await response.json().catch(() => null);
            const token = payload?.data?.csrf_token || "";
            if (token) {
                cachedCsrfToken = token;
            }
            return token;
        } catch (err) {
            return "";
        }
    }

    async function jsonFetch(url, options = {}, _retriedCsrf = false) {
        const method = String(options.method || "GET").toUpperCase();
        const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
        const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
        const headers = {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(options.headers || {}),
        };

        if (isMutating && !headers["X-CSRF-Token"]) {
            const csrfToken = await getCsrfToken();
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
        ) {
            await getCsrfToken(true);
            return jsonFetch(url, options, true);
        }

        if (!response.ok) {
            const error = new Error(payload.message || "Request failed.");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function request(path, options = {}) {
        return jsonFetch(`${API_BASE_URL}${path}`, options);
    }

    function register(data) {
        return request("/register", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    function login(data) {
        return request("/login", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    function logout() {
        return request("/logout", { method: "POST" });
    }

    async function me() {
        const payload = await request("/me");
        if (payload?.data?.authenticated && payload?.data?.user) {
            window.SecondMarketTheme.syncFromUser(payload.data.user);
        }
        return payload;
    }

    function getProfileSummary() {
        return request("/profile-summary");
    }

    function forgotPassword(email) {
        return request("/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
        });
    }

    function resetPassword(data) {
        return request("/reset-password", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    function changePassword(data) {
        return request("/change-password", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async function updateProfile(data) {
        const payload = await request("/profile", {
            method: "PATCH",
            body: JSON.stringify(data),
        });
        if (payload?.data?.theme_preference) {
            window.SecondMarketTheme.syncFromUser(payload.data);
        }
        return payload;
    }

    function uploadAvatar(file) {
        const formData = new FormData();
        formData.append("avatar", file);
        return request("/profile/avatar", {
            method: "POST",
            body: formData,
        });
    }

    function removeAvatar() {
        return request("/profile/avatar", {
            method: "DELETE",
        });
    }

    function getPaymentPreferences() {
        return request("/payment-preferences");
    }

    function updatePaymentPreferences(data) {
        return request("/payment-preferences", {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }

    function listSessions() {
        return request("/sessions");
    }

    function revokeOtherSessions() {
        return request("/sessions/revoke-others", {
            method: "POST",
        });
    }

    function revokeSession(sessionId) {
        return request(`/sessions/${sessionId}`, {
            method: "DELETE",
        });
    }

    function deactivateAccount(data) {
        return request("/deactivate", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async function listAddresses() {
        const payload = await jsonFetch("/api/v1/addresses");
        return payload.data?.addresses || [];
    }

    async function createAddress(data) {
        const payload = await jsonFetch("/api/v1/addresses", {
            method: "POST",
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function updateAddress(addressId, data) {
        const payload = await jsonFetch(`/api/v1/addresses/${addressId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
        return payload.data;
    }

    async function deleteAddress(addressId) {
        await jsonFetch(`/api/v1/addresses/${addressId}`, {
            method: "DELETE",
        });
        return true;
    }

    async function setDefaultAddress(addressId) {
        const payload = await jsonFetch(`/api/v1/addresses/${addressId}/set-default`, {
            method: "POST",
        });
        return payload.data;
    }

    async function listBuyerOrders() {
        const payload = await jsonFetch("/api/v1/orders");
        return Array.isArray(payload.data) ? payload.data : [];
    }

    function formatError(error) {
        const details = error?.payload?.error?.details || {};
        const messages = Object.values(details).flat().filter(Boolean);
        return messages.length ? messages.join(" ") : error.message || "Something went wrong.";
    }

    window.SecondMarketAuthAPI = {
        formatError,
        getCsrfToken,
        login,
        logout,
        me,
        getProfileSummary,
        register,
        forgotPassword,
        resetPassword,
        changePassword,
        updateProfile,
        uploadAvatar,
        removeAvatar,
        getPaymentPreferences,
        updatePaymentPreferences,
        listSessions,
        revokeOtherSessions,
        revokeSession,
        deactivateAccount,
        listAddresses,
        createAddress,
        updateAddress,
        deleteAddress,
        setDefaultAddress,
        listBuyerOrders,
    };
})();
