class SecondMarketCheckoutApp {
    constructor() {
        this.state = {
            currentView: "cart",
            user: null,
            cart: null,
            addresses: [],
            selectedAddressId: null,
            preferredPaymentMethod: "cash_on_delivery",
            selectedPaymentMethod: "cash_on_delivery",
            appliedCoupon: null,
            couponInput: "",
            draftForm: null,
            fieldErrors: {},
            orderConfirmation: null,
            confirmationOrderNumber: "",
            confirmationLoading: false,
            confirmationError: "",
            pendingIdempotencyKey: "",
            stripeConfigured: true,
            stripeSessionId: "",
            stripeCancelled: false,
            loading: true,
            actionLoading: false,
            submittingOrder: false,
            error: "",
        };
        this.templateCache = {};
        this.init();
    }

    async init() {
        this.syncStateFromLocation();
        window.addEventListener("popstate", () => {
            this.syncStateFromLocation();
            if (this.state.currentView === "confirmation" && this.state.confirmationOrderNumber && !this.state.orderConfirmation) {
                this.loadConfirmedOrder(this.state.confirmationOrderNumber);
            } else {
                this.render();
            }
        });

        this.render();
        await this.loadCurrentUser();
        if (this.state.user?.role === "buyer") {
            await this.refreshCart();
            if (this.state.currentView === "confirmation" && this.state.confirmationOrderNumber) {
                await this.loadConfirmedOrder(this.state.confirmationOrderNumber);
            }
        }
    }

    syncStateFromLocation() {
        try {
            const params = new URLSearchParams(window.location.search);
            const confirmed = (params.get("confirmed") || "").trim();
            const view = (params.get("view") || "").trim();
            this.state.stripeSessionId = (params.get("stripe_session_id") || "").trim();
            this.state.stripeCancelled = params.get("stripe_cancelled") === "1";
            if (confirmed) {
                this.state.currentView = "confirmation";
                this.state.confirmationOrderNumber = confirmed;
            } else if (view === "summary") {
                this.state.currentView = "summary";
                this.state.confirmationOrderNumber = "";
            } else {
                this.state.currentView = "cart";
                this.state.confirmationOrderNumber = "";
            }
        } catch (err) {
            this.state.currentView = "cart";
        }
    }

    updateBrowserUrl(viewName, orderNumber = "", replace = false) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("view");
            url.searchParams.delete("confirmed");
            url.searchParams.delete("stripe_session_id");
            url.searchParams.delete("stripe_cancelled");
            if (viewName === "confirmation" && orderNumber) {
                url.searchParams.set("confirmed", orderNumber);
            } else if (viewName === "summary") {
                url.searchParams.set("view", "summary");
            }
            const nextUrl = `${url.pathname}${url.search}`;
            if (replace) {
                window.history.replaceState({ viewName, orderNumber }, "", nextUrl);
            } else {
                window.history.pushState({ viewName, orderNumber }, "", nextUrl);
            }
        } catch (err) {
            // Ignore history API issues
        }
    }

    getCurrentCheckoutRelativeUrl() {
        try {
            return `${window.location.pathname}${window.location.search}` || "/checkout";
        } catch (err) {
            return "/checkout";
        }
    }

    async loadCurrentUser() {
        try {
            const payload = await window.SecondMarketAuthAPI.me();
            this.state.user = payload.data.authenticated ? payload.data.user : null;
            if (this.state.user?.role === "buyer") {
                const preferred = this.state.user.preferred_payment_method || "cash_on_delivery";
                this.state.preferredPaymentMethod = preferred;
                this.state.selectedPaymentMethod = preferred;
                if (window.SecondMarketAuthAPI.listAddresses) {
                    try {
                        const addresses = await window.SecondMarketAuthAPI.listAddresses();
                        this.state.addresses = addresses;
                        const defaultAddress = addresses.find((a) => a.is_default) || addresses[0] || null;
                        this.state.selectedAddressId = defaultAddress ? defaultAddress.id : null;
                    } catch (err) {
                        this.state.addresses = [];
                    }
                }
            }
            if (window.SecondMarketCheckoutAPI?.getPaymentMethods) {
                try {
                    const methodsData = await window.SecondMarketCheckoutAPI.getPaymentMethods();
                    if (typeof methodsData?.stripe_configured === "boolean") {
                        this.state.stripeConfigured = methodsData.stripe_configured;
                    }
                } catch (err) {
                    // Keep optimistic default if catalog probe fails
                }
            }
        } catch (error) {
            this.state.user = null;
        }
        this.render();
    }

    async loadConfirmedOrder(orderNumber) {
        if (!orderNumber || !window.SecondMarketCheckoutAPI?.getOrderConfirmation) return;

        this.state.confirmationLoading = true;
        this.state.confirmationError = "";
        this.render();
        try {
            const sessionId = (this.state.stripeSessionId || "").trim();
            if (sessionId && window.SecondMarketCheckoutAPI.verifyStripeSession) {
                try {
                    await window.SecondMarketCheckoutAPI.verifyStripeSession(orderNumber, sessionId);
                    this.showToast("Stripe card payment verified and confirmed.");
                } catch (verifyErr) {
                    this.showToast(window.SecondMarketCheckoutAPI.formatError(verifyErr), "error");
                } finally {
                    this.state.stripeSessionId = "";
                    this.updateBrowserUrl("confirmation", orderNumber, true);
                }
            } else if (this.state.stripeCancelled) {
                this.updateBrowserUrl("confirmation", orderNumber, true);
            }

            const order = await window.SecondMarketCheckoutAPI.getOrderConfirmation(orderNumber);
            const primaryPayment = Array.isArray(order.payments) && order.payments.length
                ? { ...order.payments[0] }
                : {
                    method: order.payment_method || "cash_on_delivery",
                    status: order.payment_status || "pending",
                    reference_number: null,
                };
            if (
                (primaryPayment.method === "credit_debit_card" || primaryPayment.method === "stripe")
                && order.payment_status !== "paid"
                && order.status !== "cancelled"
                && window.SecondMarketCheckoutAPI.getPaymentIntent
            ) {
                try {
                    const paymentInfo = await window.SecondMarketCheckoutAPI.getPaymentIntent(orderNumber);
                    if (paymentInfo?.intent) {
                        primaryPayment.intent = paymentInfo.intent;
                    }
                } catch (intentErr) {
                    // Keep confirmation visible even if Stripe intent cannot be refreshed
                }
            }
            this.state.orderConfirmation = {
                order,
                items: order.items || [],
                payment: primaryPayment,
                shipping_address: order.shipping_record || null,
            };
        } catch (error) {
            this.state.orderConfirmation = null;
            this.state.confirmationError = window.SecondMarketCheckoutAPI.formatError(error);
        } finally {
            this.state.confirmationLoading = false;
            this.render();
        }
    }

    selectSavedAddress(addressId) {
        this.saveDraftFormValues();
        const paymentMethod = this.state.draftForm?.payment_method || this.state.selectedPaymentMethod;
        this.state.draftForm = paymentMethod ? { payment_method: paymentMethod } : null;
        this.state.fieldErrors = {};
        this.state.selectedAddressId = addressId;
        this.render();
    }

    selectPaymentMethod(method) {
        this.state.selectedPaymentMethod = method;
        if (!this.state.draftForm) {
            this.state.draftForm = {};
        }
        this.state.draftForm.payment_method = method;
        delete this.state.fieldErrors.payment_method;
        this.saveDraftFormValues();
        this.render();
    }

    saveDraftFormValues() {
        const form = document.getElementById("checkout-summary-form");
        if (!form) return;
        const fields = [
            "recipient_name",
            "phone",
            "address_line1",
            "address_line2",
            "city",
            "province",
            "postal_code",
        ];
        const snapshot = { ...(this.state.draftForm || {}) };
        fields.forEach((name) => {
            const input = form.querySelector(`[name="${name}"]`);
            if (input) {
                snapshot[name] = input.value;
            }
        });
        const checkedPayment = form.querySelector('[name="payment_method"]:checked');
        const selectPayment = form.querySelector('select[name="payment_method"]');
        if (checkedPayment) {
            snapshot.payment_method = checkedPayment.value;
        } else if (selectPayment) {
            snapshot.payment_method = selectPayment.value;
        }
        const saveBox = form.querySelector('[name="save_address"]');
        if (saveBox) {
            snapshot.save_address = saveBox.checked;
        }
        this.state.draftForm = snapshot;
    }

    applyCheckoutPrefill() {
        const form = document.getElementById("checkout-summary-form");
        if (!form) return;

        const addresses = this.state.addresses || [];
        const selected = this.state.selectedAddressId !== null
            ? addresses.find((a) => Number(a.id) === Number(this.state.selectedAddressId))
            : null;

        const setFieldValue = (name, value) => {
            const input = form.querySelector(`[name="${name}"]`);
            if (input && value !== undefined && value !== null) {
                input.value = value;
            }
        };

        if (selected) {
            setFieldValue("recipient_name", selected.recipient_name || "");
            setFieldValue("phone", selected.phone || "");
            setFieldValue("address_line1", selected.street_line1 || selected.address_line1 || "");
            setFieldValue(
                "address_line2",
                selected.street_line2 || selected.delivery_instructions || ""
            );
            setFieldValue("city", selected.city || "");
            setFieldValue("province", selected.state_or_province || selected.province || "");
            setFieldValue("postal_code", selected.postal_code || "");
        } else if (this.state.user) {
            setFieldValue(
                "recipient_name",
                `${this.state.user.first_name || ""} ${this.state.user.last_name || ""}`.trim()
            );
            setFieldValue("phone", this.state.user.phone || "");
            setFieldValue("address_line1", "");
            setFieldValue("address_line2", "");
            setFieldValue("city", "");
            setFieldValue("province", "");
            setFieldValue("postal_code", "");
        }

        const draft = this.state.draftForm;
        if (draft) {
            Object.entries(draft).forEach(([key, val]) => {
                if (key === "payment_method" || key === "save_address") return;
                if (val !== undefined && val !== null) {
                    setFieldValue(key, val);
                }
            });
            const saveBox = form.querySelector('[name="save_address"]');
            if (saveBox && typeof draft.save_address === "boolean") {
                saveBox.checked = draft.save_address;
            }
        }

        const desiredMethod = draft?.payment_method || this.state.selectedPaymentMethod || this.state.preferredPaymentMethod;
        const radios = form.querySelectorAll('input[type="radio"][name="payment_method"]');
        if (radios.length) {
            let matched = false;
            radios.forEach((radio) => {
                if (radio.value === desiredMethod) {
                    radio.checked = true;
                    matched = true;
                }
            });
            if (!matched) {
                radios[0].checked = true;
            }
        } else {
            const paymentSelect = form.querySelector('[name="payment_method"]');
            if (paymentSelect) {
                const hasOption = Array.from(paymentSelect.options).some((opt) => opt.value === desiredMethod);
                if (desiredMethod && hasOption) {
                    paymentSelect.value = desiredMethod;
                } else if (paymentSelect.options.length > 0 && !paymentSelect.value) {
                    paymentSelect.selectedIndex = 0;
                }
            }
        }

        this.renderFieldErrors();
        form.querySelectorAll("input, select").forEach((el) => {
            el.addEventListener("input", () => {
                const errKey = el.name === "payment_method" ? "payment_method" : `shipping_address.${el.name}`;
                if (this.state.fieldErrors[errKey]) {
                    delete this.state.fieldErrors[errKey];
                    this.renderFieldErrors();
                }
            });
        });
    }

    renderFieldErrors() {
        const form = document.getElementById("checkout-summary-form");
        if (!form) return;

        form.querySelectorAll("[data-error-for]").forEach((node) => {
            const key = node.dataset.errorFor;
            const msg = this.state.fieldErrors?.[key] || "";
            node.textContent = msg;
            const inputName = key.replace(/^shipping_address\./, "");
            const fieldEl = form.querySelector(`[name="${inputName}"]`);
            if (fieldEl) {
                fieldEl.classList.toggle("is-invalid", Boolean(msg));
                fieldEl.setAttribute("aria-invalid", msg ? "true" : "false");
            }
        });
    }

    validateSummaryFormClient(payload) {
        const fieldErrors = {};
        const shipping = payload.shipping_address || {};
        const labels = {
            recipient_name: "Recipient name is required.",
            phone: "Mobile number is required.",
            address_line1: "Street address is required.",
            city: "City is required.",
            province: "Province is required.",
            postal_code: "Postal code is required.",
        };
        Object.entries(labels).forEach(([key, message]) => {
            if (!String(shipping[key] || "").trim()) {
                fieldErrors[`shipping_address.${key}`] = message;
            }
        });
        if (!payload.payment_method) {
            fieldErrors.payment_method = "Please choose a payment method.";
        }
        return fieldErrors;
    }

    async revalidateAppliedCoupon() {
        if (!this.state.appliedCoupon?.code || !window.SecondMarketCheckoutAPI?.applyCoupon) return;

        const cart = this.state.cart || { items: [], subtotal: { amount: 0 } };
        const hasItems = (cart.items || []).length > 0;
        if (!hasItems) {
            this.state.appliedCoupon = null;
            this.state.couponInput = "";
            return;
        }

        const subtotalAmount = typeof cart.subtotal === "object" && cart.subtotal !== null
            ? Number(cart.subtotal.amount || 0)
            : Number(cart.subtotal || 0);

        try {
            this.state.appliedCoupon = await window.SecondMarketCheckoutAPI.applyCoupon(
                this.state.appliedCoupon.code,
                subtotalAmount
            );
        } catch (error) {
            const removedCode = this.state.appliedCoupon.code;
            this.state.appliedCoupon = null;
            this.showToast(
                `Coupon ${removedCode} was removed: ${window.SecondMarketCheckoutAPI.formatError(error)}`,
                "error"
            );
        }
    }

    resetPendingIdempotencyKey() {
        this.state.pendingIdempotencyKey = "";
    }

    getOrCreateIdempotencyKey() {
        if (!this.state.pendingIdempotencyKey) {
            if (window.crypto?.randomUUID) {
                this.state.pendingIdempotencyKey = `chk-${window.crypto.randomUUID()}`;
            } else {
                this.state.pendingIdempotencyKey = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            }
        }
        return this.state.pendingIdempotencyKey;
    }

    async refreshCart() {
        if (!window.SecondMarketCheckoutAPI) {
            this.state.error = "The checkout API client is unavailable.";
            this.state.loading = false;
            this.render();
            return;
        }

        this.state.loading = true;
        this.state.error = "";
        this.render();

        try {
            this.state.cart = await window.SecondMarketCheckoutAPI.getCart();
            await this.revalidateAppliedCoupon();
        } catch (error) {
            this.state.error = window.SecondMarketCheckoutAPI.formatError(error);
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    parsePositiveInteger(value, fieldLabel) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
            throw new Error(`${fieldLabel} must be at least 1.`);
        }
        return parsed;
    }

    async changeCartItemQuantity(productSlug, nextQuantity) {
        if (this.state.actionLoading || !window.SecondMarketCheckoutAPI) return;
        const parsed = parseInt(nextQuantity, 10);
        if (Number.isNaN(parsed) || parsed < 1) return;

        try {
            this.state.actionLoading = true;
            this.render();
            this.state.cart = await window.SecondMarketCheckoutAPI.updateItem(productSlug, parsed);
            this.resetPendingIdempotencyKey();
            await this.revalidateAppliedCoupon();
            this.showToast("Cart quantity updated.");
        } catch (error) {
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.state.actionLoading = false;
            this.render();
        }
    }

    async updateCartItemQuantity(event, productSlug) {
        event.preventDefault();
        if (this.state.actionLoading) return;

        const form = new FormData(event.currentTarget);
        let quantity;

        try {
            quantity = this.parsePositiveInteger(form.get("quantity"), "Quantity");
        } catch (error) {
            this.showToast(error.message, "error");
            return;
        }

        await this.changeCartItemQuantity(productSlug, quantity);
    }

    async removeCartItem(productSlug) {
        if (this.state.actionLoading) return;

        try {
            this.state.actionLoading = true;
            this.render();
            this.state.cart = await window.SecondMarketCheckoutAPI.removeItem(productSlug);
            this.resetPendingIdempotencyKey();
            await this.revalidateAppliedCoupon();
            this.showToast("Item removed from cart.", "info");
        } catch (error) {
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.state.actionLoading = false;
            this.render();
        }
    }

    checkoutPayloadFromForm(formElement) {
        const form = new FormData(formElement);
        const payload = {
            shipping_address: {
                recipient_name: (form.get("recipient_name") || "").toString().trim(),
                phone: (form.get("phone") || "").toString().trim(),
                address_line1: (form.get("address_line1") || "").toString().trim(),
                address_line2: (form.get("address_line2") || "").toString().trim(),
                city: (form.get("city") || "").toString().trim(),
                province: (form.get("province") || "").toString().trim(),
                postal_code: (form.get("postal_code") || "").toString().trim(),
                country: "Philippines",
            },
            payment_method: (form.get("payment_method") || "").toString(),
        };
        if (this.state.appliedCoupon?.code) {
            payload.coupon_code = this.state.appliedCoupon.code;
        }
        return payload;
    }

    async applyCouponCode(event) {
        event.preventDefault();
        if (this.state.actionLoading || this.state.submittingOrder || !window.SecondMarketCheckoutAPI) return;

        const form = new FormData(event.currentTarget);
        const code = (form.get("coupon_code") || "").toString().trim().toUpperCase();
        this.state.couponInput = code;
        if (!code) {
            this.showToast("Please enter a coupon code.", "error");
            return;
        }

        const cart = this.state.cart || { subtotal: { amount: 0 } };
        const subtotalAmount = typeof cart.subtotal === "object" && cart.subtotal !== null
            ? Number(cart.subtotal.amount || 0)
            : Number(cart.subtotal || 0);

        this.saveDraftFormValues();
        try {
            this.state.actionLoading = true;
            this.render();
            this.state.appliedCoupon = await window.SecondMarketCheckoutAPI.applyCoupon(code, subtotalAmount);
            this.showToast(`Coupon ${this.state.appliedCoupon.code} applied.`);
        } catch (error) {
            this.state.appliedCoupon = null;
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.state.actionLoading = false;
            this.render();
        }
    }

    removeCouponCode() {
        if (this.state.submittingOrder) return;
        this.saveDraftFormValues();
        this.state.appliedCoupon = null;
        this.state.couponInput = "";
        this.render();
        this.showToast("Coupon removed.");
    }

    setOrderSubmitPending(isPending) {
        this.state.submittingOrder = isPending;
        const submitBtn = document.getElementById("checkout-place-order-btn");
        if (submitBtn) {
            submitBtn.disabled = isPending;
            submitBtn.textContent = isPending ? "Placing Order..." : "Place Order";
            submitBtn.setAttribute("aria-busy", isPending ? "true" : "false");
        }
    }

    applyServerValidationErrors(error) {
        const details = error?.payload?.error?.details;
        if (!details || typeof details !== "object") return;
        const nextErrors = {};
        Object.entries(details).forEach(([key, val]) => {
            if (Array.isArray(val) && val.length) {
                nextErrors[key] = String(val[0]);
            } else if (typeof val === "string" && val) {
                nextErrors[key] = val;
            }
        });
        this.state.fieldErrors = nextErrors;
        this.renderFieldErrors();
        const firstKey = Object.keys(nextErrors)[0];
        if (firstKey) {
            const inputName = firstKey.replace(/^shipping_address\./, "");
            document.querySelector(`#checkout-summary-form [name="${inputName}"]`)?.focus();
        }
    }

    async maybeSaveCustomAddress(formElement, shippingAddress) {
        const saveBox = formElement?.querySelector('[name="save_address"]');
        if (!saveBox?.checked || this.state.selectedAddressId !== null || !window.SecondMarketAuthAPI?.createAddress) {
            return;
        }
        try {
            const created = await window.SecondMarketAuthAPI.createAddress({
                label: "Saved Checkout Address",
                recipient_name: shippingAddress.recipient_name,
                phone: shippingAddress.phone,
                street_line1: shippingAddress.address_line1,
                street_line2: shippingAddress.address_line2 || "",
                city: shippingAddress.city,
                state_or_province: shippingAddress.province,
                postal_code: shippingAddress.postal_code,
                country: shippingAddress.country || "Philippines",
                is_default: (this.state.addresses || []).length === 0,
            });
            if (created) {
                this.state.addresses = [...(this.state.addresses || []), created];
            }
        } catch (err) {
            // Address book save failure should not fail confirmed order
        }
    }

    async submitCheckout(event) {
        event.preventDefault();
        if (this.state.actionLoading || this.state.submittingOrder) return;

        const formElement = event.currentTarget;
        this.saveDraftFormValues();
        const payload = this.checkoutPayloadFromForm(formElement);
        const clientErrors = this.validateSummaryFormClient(payload);
        if (Object.keys(clientErrors).length > 0) {
            this.state.fieldErrors = clientErrors;
            this.renderFieldErrors();
            const firstKey = Object.keys(clientErrors)[0];
            const inputName = firstKey.replace(/^shipping_address\./, "");
            formElement.querySelector(`[name="${inputName}"]`)?.focus();
            this.showToast("Please complete the highlighted required delivery fields.", "error");
            return;
        }

        this.state.fieldErrors = {};
        this.renderFieldErrors();
        const idempotencyKey = this.getOrCreateIdempotencyKey();
        this.setOrderSubmitPending(true);

        try {
            const confirmation = await window.SecondMarketCheckoutAPI.confirmOrder(payload, idempotencyKey);
            await this.maybeSaveCustomAddress(formElement, payload.shipping_address);

            this.state.orderConfirmation = confirmation;
            this.state.confirmationOrderNumber = confirmation.order?.order_number || "";
            this.resetPendingIdempotencyKey();
            this.state.appliedCoupon = null;
            this.state.couponInput = "";
            this.state.draftForm = null;
            this.state.cart = await window.SecondMarketCheckoutAPI.getCart().catch(() => ({ items: [], total_items: 0, subtotal: { amount: 0 } }));

            this.state.currentView = "confirmation";
            this.updateBrowserUrl("confirmation", this.state.confirmationOrderNumber);

            const redirectUrl = confirmation?.payment?.intent?.redirect_required
                && confirmation?.payment?.intent?.checkout_url;
            if (redirectUrl) {
                this.showToast("Redirecting to Stripe Checkout...");
                window.location.assign(redirectUrl);
                return;
            }

            const isGcash = confirmation?.payment?.method === "gcash_pending";
            this.clearToasts();
            this.showToast(isGcash
                ? "Order placed. Submit your GCash reference number to complete payment."
                : "Order placed successfully.");
        } catch (error) {
            if (error?.payload?.error?.code === "validation_error") {
                this.applyServerValidationErrors(error);
            } else if (error?.payload?.error?.code === "cart_not_checkout_ready") {
                await this.refreshCart();
            }
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.setOrderSubmitPending(false);
            this.render();
        }
    }

    async confirmOrderPayment(event, orderNumber) {
        event.preventDefault();
        if (this.state.actionLoading || !window.SecondMarketCheckoutAPI) return;

        const form = new FormData(event.currentTarget);
        const referenceNumber = (form.get("reference_number") || "").toString().trim();

        try {
            this.state.actionLoading = true;
            this.render();
            const result = await window.SecondMarketCheckoutAPI.confirmPayment(orderNumber, referenceNumber);
            if (this.state.orderConfirmation) {
                this.state.orderConfirmation = {
                    ...this.state.orderConfirmation,
                    order: result.order,
                    payment: {
                        ...this.state.orderConfirmation.payment,
                        ...result.payment,
                    },
                };
            }
            this.showToast("Payment confirmed and recorded.");
        } catch (error) {
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.state.actionLoading = false;
            this.render();
        }
    }

    async payWithStripe(orderNumber) {
        if (this.state.actionLoading || !window.SecondMarketCheckoutAPI) return;

        const existingUrl = this.state.orderConfirmation?.payment?.intent?.checkout_url;
        if (existingUrl && this.state.orderConfirmation?.order?.order_number === orderNumber) {
            this.showToast("Redirecting to Stripe Checkout...");
            window.location.assign(existingUrl);
            return;
        }

        try {
            this.state.actionLoading = true;
            this.render();
            const paymentInfo = await window.SecondMarketCheckoutAPI.getPaymentIntent(orderNumber);
            const url = paymentInfo?.intent?.checkout_url;
            if (!url) {
                throw new Error(paymentInfo?.intent?.instructions || "Unable to start Stripe Checkout session.");
            }
            this.showToast("Redirecting to Stripe Checkout...");
            window.location.assign(url);
        } catch (error) {
            this.showToast(window.SecondMarketCheckoutAPI.formatError(error), "error");
        } finally {
            this.state.actionLoading = false;
            this.render();
        }
    }

    navigate(viewName) {
        if (this.state.submittingOrder) return;
        if (viewName === "summary") {
            const items = this.state.cart?.items || [];
            if (!this.state.loading && items.length === 0) {
                this.showToast("Add items to your cart before proceeding to checkout.", "error");
                this.state.currentView = "cart";
                this.updateBrowserUrl("cart");
                this.render();
                return;
            }
        }
        if (this.state.currentView === "summary" && viewName !== "summary") {
            this.saveDraftFormValues();
        }
        if (viewName === "cart") {
            this.state.orderConfirmation = null;
            this.state.confirmationOrderNumber = "";
        }
        this.state.currentView = viewName;
        this.clearToasts();
        this.updateBrowserUrl(viewName);
        this.render();
        document.getElementById("checkout-main-content")?.focus();
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
        request.open("GET", `/checkout/pages/${templateName}.html`, false);
        request.send(null);

        if (request.status < 200 || request.status >= 300) {
            return `
                <section class="checkout-state-panel">
                    <h1>Page Template Missing</h1>
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

    renderCartStatus() {
        if (this.state.loading) {
            return `<div class="checkout-state-panel" aria-live="polite"><h1>Loading Cart</h1><p>Your saved cart is being prepared.</p></div>`;
        }

        if (this.state.error) {
            return `<div class="checkout-state-panel" role="alert"><h1>Unable To Load Cart</h1><p>${this.escapeHtml(this.state.error)}</p></div>`;
        }

        return "";
    }

    render() {
        const main = document.getElementById("checkout-main-content");
        if (!main) return;

        this.updateUserDisplay();
        this.updateNavigation();

        if (!this.state.user) {
            const nextParam = encodeURIComponent(this.getCurrentCheckoutRelativeUrl());
            main.innerHTML = this.renderAccessPanel(
                "Buyer Sign In Required",
                "Sign in with a buyer account to review your cart and continue checkout.",
                `/login.html?next=${nextParam}`,
                "Go To Sign In"
            );
            return;
        }

        if (this.state.user.role !== "buyer") {
            main.innerHTML = this.renderAccessPanel(
                "Buyer Access Required",
                "Admin seller accounts cannot place buyer checkout orders.",
                "/",
                "Back To Storefront"
            );
            return;
        }

        if (this.state.currentView === "confirmation") {
            main.innerHTML = window.SecondMarketCheckoutPages.renderConfirmationPage.call(this);
            return;
        }

        if (this.state.currentView === "summary") {
            main.innerHTML = window.SecondMarketCheckoutPages.renderSummaryPage.call(this);
            this.applyCheckoutPrefill();
            return;
        }

        main.innerHTML = window.SecondMarketCheckoutPages.renderCartPage.call(this);
    }

    renderAccessPanel(title, message, href, actionText) {
        return `
            <section class="checkout-state-panel" aria-live="polite">
                <h1>${this.escapeHtml(title)}</h1>
                <p>${this.escapeHtml(message)}</p>
                <a href="${this.escapeAttribute(href)}" class="checkout-primary-button">${this.escapeHtml(actionText)}</a>
            </section>
        `;
    }

    updateUserDisplay() {
        const container = document.querySelector(".checkout-user");
        const label = document.querySelector("[data-checkout-user-name]");
        if (container) {
            if (this.state.user) {
                container.innerHTML = `
                    <div style="display:flex; align-items:center; gap:0.45rem;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span data-checkout-user-name>${this.escapeHtml(this.state.user.first_name)} ${this.escapeHtml(this.state.user.last_name)}</span>
                    </div>
                `;
            } else {
                const nextParam = encodeURIComponent(this.getCurrentCheckoutRelativeUrl());
                container.innerHTML = `
                    <div style="display:flex; align-items:center; gap:0.4rem; font-size:0.8rem; font-weight:600;">
                        <a href="/login.html?next=${nextParam}" style="color:var(--checkout-accent); text-decoration:none;">Log in</a>
                        <span style="opacity:0.4;">|</span>
                        <a href="/register.html?next=${nextParam}" style="color:var(--checkout-accent); text-decoration:none;">Sign up</a>
                        <span data-checkout-user-name style="display:none;">Not signed in</span>
                    </div>
                `;
            }
            return;
        }
        if (label) {
            label.textContent = this.state.user
                ? `${this.state.user.first_name} ${this.state.user.last_name}`
                : "Not signed in";
        }
    }

    updateNavigation() {
        document.querySelectorAll("[data-checkout-nav]").forEach((el) => {
            const isActive = el.dataset.checkoutNav === this.state.currentView;
            el.classList.toggle("is-active", isActive);
            el.setAttribute("aria-current", isActive ? "step" : "false");
        });
    }

    actionDisabledAttribute() {
        return this.state.actionLoading || this.state.submittingOrder ? "disabled" : "";
    }

    clearToasts() {
        const container = document.getElementById("checkout-toast-container");
        if (container) {
            container.innerHTML = "";
        }
    }

    showToast(message, type = "success") {
        const container = document.getElementById("checkout-toast-container");
        if (!container) return;

        container.innerHTML = "";
        const toast = document.createElement("div");
        toast.className = `checkout-toast ${type === "error" ? "is-error" : ""}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    formatPrice(price) {
        const rawAmount = typeof price === "number"
            ? price
            : typeof price === "string"
                ? Number(price)
                : price?.amount;
        const amount = Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : 0;
        return `₱${amount.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })}`;
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

let checkoutApp;
window.addEventListener("DOMContentLoaded", () => {
    checkoutApp = new SecondMarketCheckoutApp();
});
