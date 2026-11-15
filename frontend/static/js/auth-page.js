(function () {
    const form = document.querySelector("[data-auth-form]");
    const message = document.querySelector("[data-auth-message]");

    function setMessage(text, type = "error") {
        if (!message) return;

        message.textContent = text;
        message.className = `auth-message is-visible is-${type}`;
    }

    function setLoading(isLoading) {
        const submitButton = form?.querySelector("button[type='submit']");
        if (!submitButton) return;

        submitButton.disabled = isLoading;
        submitButton.dataset.originalText = submitButton.dataset.originalText || submitButton.textContent;
        submitButton.textContent = isLoading ? "Please wait..." : submitButton.dataset.originalText;
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

    function switchLoginMode(mode, prefillToken = "") {
        if (!form || !forgotForm || !resetForm) return;
        form.hidden = mode !== "login";
        forgotForm.hidden = mode !== "forgot";
        resetForm.hidden = mode !== "reset";
        const heading = document.getElementById("login-title");
        if (heading) {
            heading.textContent = mode === "forgot" ? "Reset Password" : mode === "reset" ? "Choose New Password" : "Sign In";
        }
        if (prefillToken) {
            const tokenInput = resetForm.querySelector("[name='token']");
            if (tokenInput) tokenInput.value = prefillToken;
        }
        if (message) {
            message.textContent = "";
            message.className = "auth-message";
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
            const email = (new FormData(forgotForm).get("email") || "").toString().trim();
            if (submitBtn) submitBtn.disabled = true;
            try {
                const payload = await window.SecondMarketAuthAPI.forgotPassword(email);
                const devToken = payload?.data?.dev_token;
                if (devToken) {
                    switchLoginMode("reset", devToken);
                    setMessage("Reset token generated. Choose your new password below.", "success");
                } else {
                    setMessage(payload?.message || "If an account matches that email, reset instructions were sent.", "success");
                }
            } catch (error) {
                setMessage(window.SecondMarketAuthAPI.formatError(error), "error");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    if (resetForm && window.SecondMarketAuthAPI?.resetPassword) {
        resetForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitBtn = resetForm.querySelector("button[type='submit']");
            const data = new FormData(resetForm);
            const token = (data.get("token") || "").toString().trim();
            const newPassword = (data.get("new_password") || "").toString();
            if (submitBtn) submitBtn.disabled = true;
            try {
                const payload = await window.SecondMarketAuthAPI.resetPassword({ token, new_password: newPassword });
                switchLoginMode("login");
                setMessage(payload?.message || "Password updated. Sign in with your new password.", "success");
            } catch (error) {
                setMessage(window.SecondMarketAuthAPI.formatError(error), "error");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    try {
        const params = new URLSearchParams(window.location.search);
        const urlToken = (params.get("reset_token") || "").trim();
        const urlMode = (params.get("mode") || "").trim();
        if (urlToken) {
            switchLoginMode("reset", urlToken);
        } else if (urlMode === "forgot" || urlMode === "reset") {
            switchLoginMode(urlMode);
        }
    } catch (err) {
        // Ignore URL search parsing issues
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
