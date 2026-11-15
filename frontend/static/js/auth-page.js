(function () {
    const form = document.querySelector("[data-auth-form]");
    const message = document.querySelector("[data-auth-message]");

    function setMessage(text, type = "error") {
        if (!message) return;

        message.textContent = text;
        message.className = `auth-message is-visible is-${type}`;
    }

    function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
        if (!button) return;

        button.disabled = isLoading;
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = isLoading ? loadingText : button.dataset.originalText;
    }

    function setLoading(isLoading) {
        setButtonLoading(form?.querySelector("button[type='submit']"), isLoading);
    }

    function getSafeNextUrl() {
        try {
            const rawNext = new URLSearchParams(window.location.search).get("next") || "";
            if (rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")) {
                return rawNext;
            }
        } catch (err) {
            // Ignore malformed URL search params
        }
        return "";
    }

    function redirectAuthenticatedUser(user) {
        if (user?.role === "admin") {
            window.location.href = "/admin";
            return;
        }

        const safeNext = getSafeNextUrl();
        if (safeNext) {
            sessionStorage.removeItem("secondmarket:nextView");
            window.location.href = safeNext;
            return;
        }

        sessionStorage.setItem("secondmarket:nextView", "account");
        window.location.href = form?.dataset.authSuccessUrl || "/";
    }

    async function rejectUnexpectedRole(requiredRole, actualRole) {
        await window.SecondMarketAuthAPI.logout().catch(() => {});
        throw new Error(
            requiredRole === "admin"
                ? "Use an admin seller account to access the admin workspace."
                : "This sign-in page is for buyer accounts only."
        );
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!form || !window.SecondMarketAuthAPI) return;

        const formData = new FormData(form);
        const mode = form.dataset.authForm;
        setLoading(true);

        try {
            let payload;
            if (mode === "register") {
                payload = await window.SecondMarketAuthAPI.register({
                    email: formData.get("email"),
                    password: formData.get("password"),
                    first_name: formData.get("first_name"),
                    last_name: formData.get("last_name"),
                    phone: formData.get("phone"),
                    role: "buyer",
                });
            } else {
                payload = await window.SecondMarketAuthAPI.login({
                    email: formData.get("email"),
                    password: formData.get("password"),
                });
            }

            const user = payload?.data?.user;
            const requiredRole = form.dataset.authRequiredRole;
            if (requiredRole && user?.role !== requiredRole) {
                await rejectUnexpectedRole(requiredRole, user?.role);
            }

            setMessage(
                mode === "register" ? "Your buyer account is ready." : "You are now signed in.",
                "success"
            );
            redirectAuthenticatedUser(user);
        } catch (error) {
            setMessage(window.SecondMarketAuthAPI.formatError(error), "error");
            setLoading(false);
        }
    }

    if (form) {
        form.addEventListener("submit", handleSubmit);
    }

    const forgotForm = document.querySelector("[data-forgot-form]");
    const resetForm = document.querySelector("[data-reset-form]");
    const LOGIN_MODE_COPY = {
        login: {
            eyebrow: "Customer Portal",
            title: "Sign In",
            subtitle: "Access your buyer account, saved items, and order activity.",
            docTitle: "Sign In | SecondMarket",
        },
        forgot: {
            eyebrow: "Account Recovery",
            title: "Reset Password",
            subtitle: "Enter your account email and we will send password reset instructions.",
            docTitle: "Reset Password | SecondMarket",
        },
        reset: {
            eyebrow: "Account Recovery",
            title: "Choose New Password",
            subtitle: "Paste your reset token and set a new password for your account.",
            docTitle: "Choose New Password | SecondMarket",
        },
    };

    function syncLoginModeUrl(mode, historyMode = "push") {
        if (!historyMode || typeof window.history?.pushState !== "function") return;
        try {
            const url = new URL(window.location.href);
            if (mode === "login") {
                url.searchParams.delete("mode");
                url.searchParams.delete("reset_token");
            } else {
                url.searchParams.set("mode", mode);
                if (mode === "forgot") {
                    url.searchParams.delete("reset_token");
                }
            }
            const nextUrl = `${url.pathname}${url.search}${url.hash}`;
            const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            if (nextUrl === currentUrl) return;
            if (historyMode === "replace") {
                window.history.replaceState({ authMode: mode }, "", nextUrl);
            } else {
                window.history.pushState({ authMode: mode }, "", nextUrl);
            }
        } catch (err) {
            // Ignore URL update errors
        }
    }

    function focusActiveLoginField(mode, hasToken) {
        let target = null;
        if (mode === "forgot") {
            target = forgotForm?.querySelector("[name='email']");
        } else if (mode === "reset") {
            target = hasToken
                ? resetForm?.querySelector("[name='new_password']")
                : resetForm?.querySelector("[name='token']");
        } else {
            target = form?.querySelector("[name='email']");
        }
        target?.focus();
    }

    function switchLoginMode(mode, prefillToken = "", options = {}) {
        if (!form || !forgotForm || !resetForm) return;
        const normalizedMode = mode === "forgot" || mode === "reset" ? mode : "login";
        const copy = LOGIN_MODE_COPY[normalizedMode];

        const formsByMode = { login: form, forgot: forgotForm, reset: resetForm };
        Object.entries(formsByMode).forEach(([key, targetForm]) => {
            const isActive = key === normalizedMode;
            targetForm.hidden = !isActive;
            targetForm.setAttribute("aria-hidden", isActive ? "false" : "true");
        });

        const footer = document.querySelector(".auth-footer");
        if (footer) {
            footer.hidden = normalizedMode !== "login";
            footer.setAttribute("aria-hidden", normalizedMode === "login" ? "false" : "true");
        }

        const heading = document.getElementById("login-title");
        const eyebrow = document.querySelector("[data-auth-eyebrow]");
        const subtitle = document.querySelector("[data-auth-subtitle]");
        if (heading) heading.textContent = copy.title;
        if (eyebrow) eyebrow.textContent = copy.eyebrow;
        if (subtitle) subtitle.textContent = copy.subtitle;
        document.title = copy.docTitle;

        if (normalizedMode === "forgot") {
            const loginEmail = form.querySelector("[name='email']")?.value?.trim();
            const forgotEmailInput = forgotForm.querySelector("[name='email']");
            if (forgotEmailInput && !forgotEmailInput.value.trim() && loginEmail) {
                forgotEmailInput.value = loginEmail;
            }
        }

        const tokenInput = resetForm.querySelector("[name='token']");
        if (prefillToken && tokenInput) {
            tokenInput.value = prefillToken;
        }

        if (message && !options.preserveMessage) {
            message.textContent = "";
            message.className = "auth-message";
        }

        syncLoginModeUrl(normalizedMode, options.history === undefined ? "push" : options.history);

        if (!options.skipFocus) {
            focusActiveLoginField(normalizedMode, Boolean(prefillToken || tokenInput?.value?.trim()));
        }
    }

    document.querySelectorAll("[data-auth-mode-switch]").forEach((btn) => {
        btn.addEventListener("click", () => {
            switchLoginMode(btn.getAttribute("data-auth-mode-switch") || "login");
        });
    });

    if (forgotForm && window.SecondMarketAuthAPI?.forgotPassword) {
        forgotForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitBtn = forgotForm.querySelector("button[type='submit']");
            const emailInput = forgotForm.querySelector("[name='email']");
            const email = (emailInput?.value || "").trim();
            if (!email) {
                setMessage("Enter the email address associated with your account.", "error");
                emailInput?.focus();
                return;
            }

            setButtonLoading(submitBtn, true, "Sending...");
            try {
                const payload = await window.SecondMarketAuthAPI.forgotPassword(email);
                const devToken = payload?.data?.dev_token;
                if (devToken) {
                    setMessage("Reset token generated. Choose your new password below.", "success");
                    switchLoginMode("reset", devToken, { preserveMessage: true });
                } else {
                    setMessage(
                        payload?.message || "If an account matches that email, reset instructions were sent.",
                        "success"
                    );
                }
            } catch (error) {
                setMessage(window.SecondMarketAuthAPI.formatError(error), "error");
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    if (resetForm && window.SecondMarketAuthAPI?.resetPassword) {
        resetForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitBtn = resetForm.querySelector("button[type='submit']");
            const tokenInput = resetForm.querySelector("[name='token']");
            const passwordInput = resetForm.querySelector("[name='new_password']");
            const token = (tokenInput?.value || "").trim();
            const newPassword = (passwordInput?.value || "").toString();

            if (!token) {
                setMessage("Paste your password reset token to continue.", "error");
                tokenInput?.focus();
                return;
            }
            if (!newPassword) {
                setMessage("Enter your new password.", "error");
                passwordInput?.focus();
                return;
            }

            setButtonLoading(submitBtn, true, "Updating...");
            try {
                const payload = await window.SecondMarketAuthAPI.resetPassword({ token, new_password: newPassword });
                resetForm.reset();
                setMessage(payload?.message || "Password updated. Sign in with your new password.", "success");
                switchLoginMode("login", "", { preserveMessage: true });
            } catch (error) {
                setMessage(window.SecondMarketAuthAPI.formatError(error), "error");
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    function applyLoginModeFromUrl(options = {}) {
        try {
            const params = new URLSearchParams(window.location.search);
            const urlToken = (params.get("reset_token") || "").trim();
            const urlMode = (params.get("mode") || "").trim();
            if (urlToken) {
                switchLoginMode("reset", urlToken, { history: false, ...options });
            } else if (urlMode === "forgot" || urlMode === "reset") {
                switchLoginMode(urlMode, "", { history: false, ...options });
            } else if (options.allowLoginFallback) {
                switchLoginMode("login", "", { history: false, ...options });
            }
        } catch (err) {
            // Ignore URL search parsing issues
        }
    }

    if (forgotForm && resetForm) {
        applyLoginModeFromUrl({ skipFocus: true });
        window.addEventListener("popstate", () => {
            applyLoginModeFromUrl({ allowLoginFallback: true, skipFocus: true });
        });
    }

    document.querySelectorAll("[data-password-toggle]").forEach((toggleButton) => {
        toggleButton.addEventListener("click", () => {
            const targetId = toggleButton.getAttribute("data-password-toggle");
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;
            const reveal = input.type === "password";
            input.type = reveal ? "text" : "password";
            toggleButton.textContent = reveal ? "Hide" : "Show";
            toggleButton.setAttribute("aria-pressed", reveal ? "true" : "false");
            toggleButton.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        });
    });

    const safeNext = getSafeNextUrl();
    if (safeNext) {
        document.querySelectorAll(".auth-switch-prompt a[href]").forEach((link) => {
            try {
                const url = new URL(link.getAttribute("href"), window.location.origin);
                url.searchParams.set("next", safeNext);
                link.setAttribute("href", `${url.pathname}${url.search}`);
            } catch (err) {
                // Keep existing href
            }
        });
    }
})();
