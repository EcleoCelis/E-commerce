(function () {
    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(isoString) {
        if (!isoString) return "Recently joined";
        try {
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) return "Recently joined";
            return date.toLocaleDateString("en-PH", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch (err) {
            return "Recently joined";
        }
    }

    function getInitials(user) {
        if (!user) return "SM";
        const first = (user.firstName || user.first_name || user.name || "").trim().charAt(0);
        const last = (user.lastName || user.last_name || "").trim().charAt(0);
        return (first + last).toUpperCase() || "SM";
    }

    function renderAvatarMarkup(user, sizeClass = "profile-avatar-lg", previewDataUrl = null) {
        const avatarSrc = previewDataUrl || user?.avatarUrl || user?.avatar_url || "";
        const initials = escapeHtml(getInitials(user));
        const altName = escapeHtml(user?.name || "Customer Avatar");

        if (avatarSrc) {
            return `
                <div class="profile-avatar ${sizeClass}">
                    <img
                        src="${escapeHtml(avatarSrc)}"
                        alt="${altName}"
                        class="profile-avatar-img"
                        onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
                    >
                    <span class="profile-avatar-fallback" style="display:none;">${initials}</span>
                </div>
            `;
        }

        return `
            <div class="profile-avatar ${sizeClass}">
                <span class="profile-avatar-fallback">${initials}</span>
            </div>
        `;
    }

    function renderAuthView(state) {
        return `
            <section class="auth-shell" aria-labelledby="auth-title">
                <div class="auth-panel text-center">
                    <h1 id="auth-title" class="font-serif text-2xl font-semibold text-[#4E4638] text-center mb-2">Customer Portal</h1>
                    <p class="text-xs text-[#776B56] text-center mb-6">Access your buyer account for saved items, checkout, and orders.</p>
                    <a class="btn-primary w-full" href="/login.html">Sign In</a>
                    <div class="auth-footer">
                        <p class="auth-switch-prompt">
                            Don&rsquo;t have an account yet?
                            <a class="auth-text-link" href="/register.html">Create one</a>
                        </p>
                    </div>
                </div>
            </section>
        `;
    }

    function renderAccountRequiredView() {
        return `
            <section class="auth-shell" aria-labelledby="account-required-title">
                <div class="auth-panel text-center space-y-4">
                    <h1 id="account-required-title" class="font-serif text-2xl font-semibold text-[#4E4638]">Sign In Required</h1>
                    <p class="text-sm text-[#776B56]">Please sign in or create a buyer account to view and manage your customer profile.</p>
                    <a href="/login.html" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Go to Customer Sign In</a>
                    <div class="auth-footer">
                        <p class="auth-switch-prompt">
                            Don&rsquo;t have an account yet?
                            <a class="auth-text-link" href="/register.html">Create one</a>
                        </p>
                    </div>
                </div>
            </section>
        `;
    }

    function renderCheckoutAuthRequiredView() {
        return `
            <section class="auth-shell" aria-labelledby="checkout-auth-title">
                <div class="auth-panel text-center space-y-4">
                    <h1 id="checkout-auth-title" class="font-serif text-2xl font-semibold text-[#4E4638]">Sign In To Checkout</h1>
                    <p class="text-sm text-[#776B56]">Use your buyer account before placing an order.</p>
                    <a href="/login.html" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Go to Customer Portal</a>
                </div>
            </section>
        `;
    }

    function renderOverviewSection(state, formatPrice) {
        const user = state.user;
        const addresses = state.profileAddresses || user.addresses || [];
        const defaultAddress = addresses.find((a) => a.is_default) || addresses[0] || null;
        const orders = state.profileOrders || user.orders || [];
        const recentOrders = orders.slice(0, 4);
        const wishlistCount = (state.wishlist || []).length;
        const rawPreferred = user.preferredPaymentMethod || user.preferred_payment_method || "cash_on_delivery";
        const preferredPaymentLabel =
            rawPreferred === "gcash_pending"
                ? "GCash Reference"
                : rawPreferred === "credit_debit_card"
                    ? "Credit / Debit Card (Stripe)"
                    : "Cash on Delivery";

        return `
            <div class="profile-section-stack">
                <!-- KPI Summary Grid -->
                <div class="profile-kpi-grid">
                    <button type="button" onclick="app.setProfileTab('orders')" class="profile-kpi-card text-left">
                        <span class="profile-kpi-label">Total Orders</span>
                        <strong class="profile-kpi-value">${orders.length}</strong>
                        <span class="profile-kpi-meta">View order history &rarr;</span>
                    </button>
                    <button type="button" onclick="app.setProfileTab('addresses')" class="profile-kpi-card text-left">
                        <span class="profile-kpi-label">Delivery Addresses</span>
                        <strong class="profile-kpi-value">${addresses.length}</strong>
                        <span class="profile-kpi-meta">${defaultAddress ? `Default: ${escapeHtml(defaultAddress.label || "Home")}` : "Add delivery address &rarr;"}</span>
                    </button>
                    <button type="button" onclick="app.navigate('wishlist')" class="profile-kpi-card text-left">
                        <span class="profile-kpi-label">Saved Wishlist</span>
                        <strong class="profile-kpi-value">${wishlistCount}</strong>
                        <span class="profile-kpi-meta">Saved secondhand finds &rarr;</span>
                    </button>
                    <button type="button" onclick="app.setProfileTab('payments')" class="profile-kpi-card text-left">
                        <span class="profile-kpi-label">Checkout Preference</span>
                        <strong class="profile-kpi-value profile-kpi-value--sm">${escapeHtml(preferredPaymentLabel)}</strong>
                        <span class="profile-kpi-meta">Manage payment options &rarr;</span>
                    </button>
                </div>

                <!-- Two-column Overview Cards -->
                <div class="profile-two-col-grid">
                    <!-- Personal Details Summary Card -->
                    <div class="profile-card">
                        <div class="profile-card-header">
                            <div>
                                <p class="profile-eyebrow">Account Identity</p>
                                <h2 class="profile-card-title">Personal Information</h2>
                            </div>
                            <button type="button" onclick="app.setProfileTab('personal')" class="btn-outline py-1.5 px-3 text-xs">Edit Profile</button>
                        </div>
                        <dl class="profile-detail-list">
                            <div class="profile-detail-row">
                                <dt>Full Name</dt>
                                <dd>${escapeHtml(user.name)}</dd>
                            </div>
                            <div class="profile-detail-row">
                                <dt>Email Address</dt>
                                <dd class="flex items-center gap-2 flex-wrap">
                                    <span>${escapeHtml(user.email)}</span>
                                    <span class="status-badge status-badge-available">Verified</span>
                                </dd>
                            </div>
                            <div class="profile-detail-row">
                                <dt>Mobile Number</dt>
                                <dd>${escapeHtml(user.phone && user.phone !== "Not provided" ? user.phone : "Not set — add a phone number")}</dd>
                            </div>
                            <div class="profile-detail-row">
                                <dt>Member Since</dt>
                                <dd>${escapeHtml(formatDate(user.createdAt || user.created_at))}</dd>
                            </div>
                        </dl>
                    </div>

                    <!-- Default Delivery Address Summary Card -->
                    <div class="profile-card">
                        <div class="profile-card-header">
                            <div>
                                <p class="profile-eyebrow">Shipping Destination</p>
                                <h2 class="profile-card-title">Default Delivery Address</h2>
                            </div>
                            ${defaultAddress ? `
                                <button type="button" onclick="app.setProfileTab('addresses')" class="btn-outline py-1.5 px-3 text-xs">Manage</button>
                            ` : ""}
                        </div>
                        ${defaultAddress ? `
                            <div class="profile-address-preview">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="profile-pill profile-pill--accent">${escapeHtml(defaultAddress.label || "Home")}</span>
                                    <span class="status-badge status-badge-available">Default</span>
                                </div>
                                <p class="font-semibold text-sm text-[#4E4638]">${escapeHtml(defaultAddress.recipient_name)}</p>
                                <p class="text-xs text-[#776B56] mt-0.5">${escapeHtml(defaultAddress.phone)}</p>
                                <p class="text-xs text-[#776B56] mt-2 leading-relaxed">
                                    ${escapeHtml(defaultAddress.street_line1)}
                                    ${defaultAddress.street_line2 ? `, ${escapeHtml(defaultAddress.street_line2)}` : ""}<br>
                                    ${escapeHtml(defaultAddress.city)}, ${escapeHtml(defaultAddress.state_or_province)} ${escapeHtml(defaultAddress.postal_code)}<br>
                                    ${escapeHtml(defaultAddress.country || "Philippines")}
                                </p>
                                ${defaultAddress.delivery_instructions ? `
                                    <p class="text-[11px] text-[#776B56] italic mt-2 pt-2 border-t border-[#D7CEC1]/50">
                                        Note: ${escapeHtml(defaultAddress.delivery_instructions)}
                                    </p>
                                ` : ""}
                            </div>
                        ` : `
                            <div class="profile-empty-inline">
                                <p class="text-xs text-[#776B56] mb-3">You have not saved a default delivery address yet. Add one now to speed up checkout.</p>
                                <button type="button" onclick="app.openAddressForm()" class="btn-primary py-2 px-4 text-xs">Add Delivery Address</button>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Recent Orders Preview -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Purchase Activity</p>
                            <h2 class="profile-card-title">Recent Orders</h2>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="app.setProfileTab('orders')" class="btn-outline py-1.5 px-3 text-xs">All Orders</button>
                            <a href="/orders" class="btn-primary py-1.5 px-3 text-xs">Order Portal</a>
                        </div>
                    </div>

                    ${recentOrders.length === 0 ? `
                        <div class="profile-empty-state">
                            <p class="text-sm font-semibold text-[#4E4638]">No orders placed yet</p>
                            <p class="text-xs text-[#776B56] mt-1 mb-4">Explore inspected secondhand items in our catalog to place your first order.</p>
                            <button type="button" onclick="app.navigate('shop')" class="btn-primary py-2 px-5 text-xs uppercase tracking-wider">Browse Catalog</button>
                        </div>
                    ` : `
                        <div class="divide-y divide-[#D7CEC1]">
                            ${recentOrders.map((order) => {
                                const orderNum = order.order_number || order.id;
                                const totalAmount = order.total?.amount ?? order.total ?? 0;
                                const status = order.status || "confirmed";
                                const paymentStatus = order.payment_status || "pending";
                                const placedDate = formatDate(order.placed_at || order.date);
                                const itemCount = order.item_count || (order.items ? order.items.length : 1);
                                return `
                                    <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <div class="flex items-center gap-2.5 flex-wrap">
                                                <a href="/orders?order=${escapeHtml(orderNum)}" class="font-bold text-sm text-[#4E4638] hover:underline">${escapeHtml(orderNum)}</a>
                                                <span class="profile-pill">${escapeHtml(status.replace(/_/g, " "))}</span>
                                                <span class="text-[11px] text-[#776B56]">Payment: <strong>${escapeHtml(paymentStatus)}</strong></span>
                                            </div>
                                            <p class="text-xs text-[#776B56] mt-1">${escapeHtml(placedDate)} &bull; ${itemCount} item(s)</p>
                                        </div>
                                        <div class="flex items-center gap-3 self-start sm:self-center">
                                            <span class="font-bold text-sm text-[#4E4638]">${formatPrice(totalAmount)}</span>
                                            <a href="/orders?order=${escapeHtml(orderNum)}" class="btn-outline py-1.5 px-3 text-xs">Track / View</a>
                                        </div>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function renderPersonalSection(state) {
        const user = state.user;
        const previewUrl = state.avatarPreviewUrl || null;
        const avatarBusy = Boolean(state.avatarUploading);
        const profileSaving = Boolean(state.profileSaving);
        const isDirty = Boolean(state.profileFormDirty);
        const feedback = state.profileFeedback || null;

        return `
            <div class="profile-section-stack">
                ${feedback ? `
                    <div class="profile-feedback-banner ${feedback.type === "error" ? "is-error" : "is-success"}" role="status">
                        <span>${escapeHtml(feedback.message)}</span>
                        <button type="button" onclick="app.clearProfileFeedback()" class="text-xs font-bold ml-4">&times;</button>
                    </div>
                ` : ""}

                <!-- Profile Picture Management Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Profile Photo</p>
                            <h2 class="profile-card-title">Profile Picture Management</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">Upload a JPEG, PNG, WebP, or GIF image (maximum 30 MB). Images are validated and re-encoded securely.</p>
                        </div>
                    </div>

                    <div class="profile-avatar-manager">
                        <div class="profile-avatar-preview-wrap">
                            ${renderAvatarMarkup(user, "profile-avatar-xl", previewUrl)}
                            ${previewUrl ? `<span class="profile-pill profile-pill--accent mt-2">Unsaved Preview</span>` : ""}
                        </div>

                        <div class="profile-avatar-controls">
                            <input
                                id="profile-avatar-input"
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                                class="sr-only"
                                onchange="app.handleAvatarFileSelect(event)"
                            >
                            <div class="flex flex-wrap items-center gap-3">
                                <label for="profile-avatar-input" class="btn-outline py-2 px-4 text-xs cursor-pointer">
                                    ${user.avatarUrl || user.avatar_url ? "Replace Picture" : "Choose Image"}
                                </label>

                                ${previewUrl ? `
                                    <button type="button" onclick="app.saveAvatarUpload()" class="btn-primary py-2 px-4 text-xs" ${avatarBusy ? "disabled" : ""}>
                                        ${avatarBusy ? "Uploading..." : "Save New Picture"}
                                    </button>
                                    <button type="button" onclick="app.cancelAvatarPreview()" class="btn-outline py-2 px-3 text-xs" ${avatarBusy ? "disabled" : ""}>
                                        Cancel Preview
                                    </button>
                                ` : ""}

                                ${(user.avatarUrl || user.avatar_url) && !previewUrl ? `
                                    <button type="button" onclick="app.handleRemoveAvatar()" class="btn-outline py-2 px-4 text-xs text-red-600" ${avatarBusy ? "disabled" : ""}>
                                        ${avatarBusy ? "Removing..." : "Remove Picture"}
                                    </button>
                                ` : ""}
                            </div>
                            ${state.avatarPreviewName ? `
                                <p class="text-xs text-[#4E4638] font-medium mt-2">
                                    Selected file: <strong>${escapeHtml(state.avatarPreviewName)}</strong> (${escapeHtml(state.avatarPreviewSize || "")})
                                </p>
                            ` : `
                                <p class="text-xs text-[#776B56] mt-2">
                                    ${user.avatarUrl || user.avatar_url
                                        ? "Your custom profile picture is active across your buyer account."
                                        : "Using default initials avatar. Upload a photo to personalize your profile."}
                                </p>
                            `}
                        </div>
                    </div>
                </div>

                <!-- Personal Information Form Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Identity &amp; Contact</p>
                            <h2 class="profile-card-title">Personal Information</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">Keep your name, email address, and mobile number up to date for order and delivery coordination.</p>
                        </div>
                        ${isDirty ? `<span class="profile-pill profile-pill--warning">Unsaved changes</span>` : ""}
                    </div>

                    <form id="profile-personal-form" onsubmit="app.handleSavePersonalInfo(event)" oninput="app.markProfileFormDirty()" class="profile-form-grid">
                        <div class="profile-field">
                            <label for="profile-first-name">First Name <span class="text-red-600">*</span></label>
                            <input
                                id="profile-first-name"
                                name="first_name"
                                type="text"
                                required
                                maxlength="80"
                                autocomplete="given-name"
                                value="${escapeHtml(user.firstName || user.first_name || "")}"
                                class="form-input"
                            >
                        </div>

                        <div class="profile-field">
                            <label for="profile-last-name">Last Name <span class="text-red-600">*</span></label>
                            <input
                                id="profile-last-name"
                                name="last_name"
                                type="text"
                                required
                                maxlength="80"
                                autocomplete="family-name"
                                value="${escapeHtml(user.lastName || user.last_name || "")}"
                                class="form-input"
                            >
                        </div>

                        <div class="profile-field">
                            <label for="profile-email">Email Address <span class="text-red-600">*</span></label>
                            <input
                                id="profile-email"
                                name="email"
                                type="email"
                                required
                                maxlength="255"
                                autocomplete="email"
                                value="${escapeHtml(user.email || "")}"
                                class="form-input"
                            >
                            <span class="profile-field-hint">Used for sign-in, order confirmations, and security notices.</span>
                        </div>

                        <div class="profile-field">
                            <label for="profile-phone">Mobile / Contact Number</label>
                            <input
                                id="profile-phone"
                                name="phone"
                                type="tel"
                                maxlength="25"
                                autocomplete="tel"
                                placeholder="e.g. 0917 123 4567"
                                value="${escapeHtml(user.phone && user.phone !== "Not provided" ? user.phone : "")}"
                                class="form-input"
                            >
                            <span class="profile-field-hint">7 to 15 digits. Used by couriers during order delivery.</span>
                        </div>

                        <div class="profile-form-actions profile-field-full">
                            <button type="submit" class="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider" ${profileSaving ? "disabled" : ""}>
                                ${profileSaving ? "Saving Changes..." : "Save Personal Information"}
                            </button>
                            <button type="button" onclick="app.resetPersonalInfoForm()" class="btn-outline py-2.5 px-5 text-xs uppercase tracking-wider" ${profileSaving ? "disabled" : ""}>
                                Reset
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderAddressesSection(state) {
        const addresses = state.profileAddresses || state.user?.addresses || [];
        const editingAddress = state.editingAddress || null;
        const isFormOpen = Boolean(state.isAddressFormOpen);
        const addressSaving = Boolean(state.addressSaving);

        return `
            <div class="profile-section-stack">
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Saved Locations</p>
                            <h2 class="profile-card-title">Delivery Addresses</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">Manage your shipping addresses. Your default address automatically pre-fills during checkout.</p>
                        </div>
                        ${!isFormOpen ? `
                            <button type="button" onclick="app.openAddressForm()" class="btn-primary py-2 px-4 text-xs uppercase tracking-wider">
                                + Add New Address
                            </button>
                        ` : ""}
                    </div>

                    ${isFormOpen ? `
                        <form id="profile-address-form" onsubmit="app.handleSaveAddress(event)" class="profile-address-form-box">
                            <div class="flex items-center justify-between pb-3 mb-4 border-b border-[#D7CEC1]">
                                <h3 class="font-serif text-lg font-semibold text-[#4E4638]">
                                    ${editingAddress?.id ? "Edit Delivery Address" : "New Delivery Address"}
                                </h3>
                                <button type="button" onclick="app.closeAddressForm()" class="text-xs text-[#776B56] hover:text-[#4E4638] font-semibold">Cancel</button>
                            </div>

                            <input type="hidden" name="address_id" value="${escapeHtml(editingAddress?.id || "")}">

                            <div class="profile-form-grid">
                                <div class="profile-field">
                                    <label for="addr-label">Address Label</label>
                                    <select id="addr-label" name="label" class="form-input">
                                        ${["Home", "Work", "Apartment", "Other"].map((lbl) => `
                                            <option value="${lbl}" ${(editingAddress?.label || "Home") === lbl ? "selected" : ""}>${lbl}</option>
                                        `).join("")}
                                    </select>
                                </div>

                                <div class="profile-field">
                                    <label for="addr-recipient">Recipient Full Name <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-recipient"
                                        name="recipient_name"
                                        type="text"
                                        required
                                        maxlength="120"
                                        placeholder="Full name of recipient"
                                        value="${escapeHtml(editingAddress?.recipient_name || state.user?.name || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field">
                                    <label for="addr-phone">Recipient Mobile Number <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-phone"
                                        name="phone"
                                        type="tel"
                                        required
                                        maxlength="25"
                                        placeholder="0917 123 4567"
                                        value="${escapeHtml(editingAddress?.phone || (state.user?.phone !== "Not provided" ? state.user?.phone : "") || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field">
                                    <label for="addr-postal">Postal / ZIP Code <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-postal"
                                        name="postal_code"
                                        type="text"
                                        required
                                        maxlength="16"
                                        placeholder="e.g. 6300"
                                        value="${escapeHtml(editingAddress?.postal_code || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field profile-field-full">
                                    <label for="addr-line1">Street Address / House &amp; Building No. <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-line1"
                                        name="street_line1"
                                        type="text"
                                        required
                                        maxlength="255"
                                        placeholder="House/Unit number, street name"
                                        value="${escapeHtml(editingAddress?.street_line1 || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field profile-field-full">
                                    <label for="addr-line2">Barangay / Subdivision / Floor / Unit (Optional)</label>
                                    <input
                                        id="addr-line2"
                                        name="street_line2"
                                        type="text"
                                        maxlength="255"
                                        placeholder="Barangay, building wing, or subdivision"
                                        value="${escapeHtml(editingAddress?.street_line2 || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field">
                                    <label for="addr-city">City / Municipality <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-city"
                                        name="city"
                                        type="text"
                                        required
                                        maxlength="100"
                                        placeholder="e.g. Tagbilaran City"
                                        value="${escapeHtml(editingAddress?.city || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field">
                                    <label for="addr-province">Province / Region <span class="text-red-600">*</span></label>
                                    <input
                                        id="addr-province"
                                        name="state_or_province"
                                        type="text"
                                        required
                                        maxlength="100"
                                        placeholder="e.g. Bohol"
                                        value="${escapeHtml(editingAddress?.state_or_province || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field profile-field-full">
                                    <label for="addr-instructions">Delivery Instructions / Landmark Notes (Optional)</label>
                                    <input
                                        id="addr-instructions"
                                        name="delivery_instructions"
                                        type="text"
                                        maxlength="500"
                                        placeholder="Gate color, nearby landmark, or preferred drop-off instructions"
                                        value="${escapeHtml(editingAddress?.delivery_instructions || "")}"
                                        class="form-input"
                                    >
                                </div>

                                <div class="profile-field profile-field-full">
                                    <label class="profile-checkbox-row">
                                        <input
                                            type="checkbox"
                                            name="is_default"
                                            ${editingAddress?.is_default || addresses.length === 0 ? "checked" : ""}
                                        >
                                        <span>Set as my default delivery address for checkout</span>
                                    </label>
                                </div>

                                <div class="profile-form-actions profile-field-full">
                                    <button type="submit" class="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider" ${addressSaving ? "disabled" : ""}>
                                        ${addressSaving ? "Saving Address..." : (editingAddress?.id ? "Update Address" : "Save Address")}
                                    </button>
                                    <button type="button" onclick="app.closeAddressForm()" class="btn-outline py-2.5 px-5 text-xs uppercase tracking-wider">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </form>
                    ` : ""}

                    ${addresses.length === 0 && !isFormOpen ? `
                        <div class="profile-empty-state">
                            <p class="text-sm font-semibold text-[#4E4638]">No saved delivery addresses</p>
                            <p class="text-xs text-[#776B56] mt-1 mb-4">Save your home or office address so checkout is effortless.</p>
                            <button type="button" onclick="app.openAddressForm()" class="btn-primary py-2 px-5 text-xs uppercase tracking-wider">+ Add First Address</button>
                        </div>
                    ` : `
                        <div class="profile-address-grid">
                            ${addresses.map((addr) => `
                                <div class="profile-address-card ${addr.is_default ? "is-default" : ""}">
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <div class="flex items-center gap-2">
                                            <span class="profile-pill profile-pill--accent">${escapeHtml(addr.label || "Home")}</span>
                                            ${addr.is_default ? `<span class="status-badge status-badge-available">Default</span>` : ""}
                                        </div>
                                        <div class="flex items-center gap-2 text-xs">
                                            <button type="button" onclick="app.openAddressForm(${addr.id})" class="font-semibold text-[#4E4638] hover:underline">Edit</button>
                                            <span class="text-[#D7CEC1]">|</span>
                                            <button type="button" onclick="app.handleDeleteAddress(${addr.id})" class="font-semibold text-red-600 hover:underline">Delete</button>
                                        </div>
                                    </div>

                                    <p class="font-semibold text-sm text-[#4E4638]">${escapeHtml(addr.recipient_name)}</p>
                                    <p class="text-xs text-[#776B56] mt-0.5">${escapeHtml(addr.phone)}</p>
                                    <p class="text-xs text-[#776B56] mt-2 leading-relaxed">
                                        ${escapeHtml(addr.street_line1)}
                                        ${addr.street_line2 ? `, ${escapeHtml(addr.street_line2)}` : ""}<br>
                                        ${escapeHtml(addr.city)}, ${escapeHtml(addr.state_or_province)} ${escapeHtml(addr.postal_code)}<br>
                                        ${escapeHtml(addr.country || "Philippines")}
                                    </p>
                                    ${addr.delivery_instructions ? `
                                        <p class="text-[11px] text-[#776B56] italic mt-2 pt-2 border-t border-[#D7CEC1]/50">
                                            Landmark / Note: ${escapeHtml(addr.delivery_instructions)}
                                        </p>
                                    ` : ""}

                                    ${!addr.is_default ? `
                                        <div class="mt-4 pt-3 border-t border-[#D7CEC1]/60">
                                            <button type="button" onclick="app.handleSetDefaultAddress(${addr.id})" class="btn-outline py-1.5 px-3 text-xs w-full">
                                                Set as Default Address
                                            </button>
                                        </div>
                                    ` : ""}
                                </div>
                            `).join("")}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function renderPaymentsSection(state) {
        const user = state.user;
        const preferred = user.preferredPaymentMethod || user.preferred_payment_method || "cash_on_delivery";
        const payPrefs = user.paymentPreferences || user.payment_preferences || {
            enabled_methods: ["cash_on_delivery", "gcash_pending"],
            gcash_mobile: "",
        };
        const enabledMethods = Array.isArray(payPrefs.enabled_methods)
            ? payPrefs.enabled_methods
            : ["cash_on_delivery", "gcash_pending"];
        const gcashMobile = payPrefs.gcash_mobile || "";
        const saving = Boolean(state.paymentPrefsSaving);

        return `
            <div class="profile-section-stack">
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Checkout Integration</p>
                            <h2 class="profile-card-title">Payment Methods &amp; Preferences</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Select your default payment method for checkout. Only payment methods genuinely active in the SecondMarket checkout workflow can be enabled.
                            </p>
                        </div>
                    </div>

                    <form onsubmit="app.handleSavePaymentPreferences(event)" class="space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-xs uppercase tracking-widest font-bold text-[#4E4638]">Active &amp; Supported Checkout Payment Methods</h3>

                            <!-- Cash on Delivery -->
                            <div class="profile-payment-option ${preferred === "cash_on_delivery" ? "is-selected" : ""}">
                                <div class="flex items-start justify-between gap-4">
                                    <label class="flex items-start gap-3 cursor-pointer flex-1">
                                        <input
                                            type="radio"
                                            name="preferred_payment_method"
                                            value="cash_on_delivery"
                                            ${preferred === "cash_on_delivery" ? "checked" : ""}
                                            class="mt-1 accent-[#6E614D]"
                                        >
                                        <div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <span class="font-semibold text-sm text-[#4E4638]">Cash on Delivery (COD)</span>
                                                <span class="status-badge status-badge-available">Supported at Checkout</span>
                                                ${preferred === "cash_on_delivery" ? `<span class="profile-pill profile-pill--accent">Default</span>` : ""}
                                            </div>
                                            <p class="text-xs text-[#776B56] mt-1 leading-relaxed">
                                                Pay in Philippine Pesos (₱) directly to the courier upon physical delivery and inspection of your secondhand order.
                                            </p>
                                        </div>
                                    </label>
                                    <label class="profile-checkbox-row text-xs">
                                        <input
                                            type="checkbox"
                                            name="enabled_cash_on_delivery"
                                            ${enabledMethods.includes("cash_on_delivery") ? "checked" : ""}
                                        >
                                        <span>Enabled</span>
                                    </label>
                                </div>
                            </div>

                            <!-- GCash Reference / Sandbox Gateway -->
                            <div class="profile-payment-option ${preferred === "gcash_pending" ? "is-selected" : ""}">
                                <div class="flex items-start justify-between gap-4">
                                    <label class="flex items-start gap-3 cursor-pointer flex-1">
                                        <input
                                            type="radio"
                                            name="preferred_payment_method"
                                            value="gcash_pending"
                                            ${preferred === "gcash_pending" ? "checked" : ""}
                                            class="mt-1 accent-[#6E614D]"
                                        >
                                        <div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <span class="font-semibold text-sm text-[#4E4638]">GCash e-Wallet Reference</span>
                                                <span class="status-badge status-badge-available">Supported at Checkout</span>
                                                ${preferred === "gcash_pending" ? `<span class="profile-pill profile-pill--accent">Default</span>` : ""}
                                            </div>
                                            <p class="text-xs text-[#776B56] mt-1 leading-relaxed">
                                                Settle your order via GCash reference confirmation with server-verified webhook and order reference tracking.
                                            </p>
                                        </div>
                                    </label>
                                    <label class="profile-checkbox-row text-xs">
                                        <input
                                            type="checkbox"
                                            name="enabled_gcash_pending"
                                            ${enabledMethods.includes("gcash_pending") ? "checked" : ""}
                                        >
                                        <span>Enabled</span>
                                    </label>
                                </div>

                                <div class="mt-3 pt-3 border-t border-[#D7CEC1]/50 max-w-sm">
                                    <label for="profile-gcash-mobile" class="block text-xs font-semibold text-[#4E4638] mb-1">
                                        Preferred GCash Mobile Number (Optional)
                                    </label>
                                    <input
                                        id="profile-gcash-mobile"
                                        name="gcash_mobile"
                                        type="tel"
                                        maxlength="20"
                                        placeholder="e.g. 0917 123 4567"
                                        value="${escapeHtml(gcashMobile)}"
                                        class="form-input py-1.5 text-xs"
                                    >
                                </div>
                            </div>

                            <!-- Credit / Debit Card (Stripe Hosted Checkout) -->
                            <div class="profile-payment-option ${preferred === "credit_debit_card" ? "is-selected" : ""}">
                                <div class="flex items-start justify-between gap-4">
                                    <label class="flex items-start gap-3 cursor-pointer flex-1">
                                        <input
                                            type="radio"
                                            name="preferred_payment_method"
                                            value="credit_debit_card"
                                            ${preferred === "credit_debit_card" ? "checked" : ""}
                                            class="mt-1 accent-[#6E614D]"
                                        >
                                        <div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <span class="font-semibold text-sm text-[#4E4638]">Credit / Debit Card (Stripe)</span>
                                                <span class="status-badge status-badge-available">Supported at Checkout</span>
                                                ${preferred === "credit_debit_card" ? `<span class="profile-pill profile-pill--accent">Default</span>` : ""}
                                            </div>
                                            <p class="text-xs text-[#776B56] mt-1 leading-relaxed">
                                                Pay securely on Stripe Hosted Checkout using Visa, Mastercard, or test cards. Raw card numbers or CVVs are never collected or stored by SecondMarket.
                                            </p>
                                        </div>
                                    </label>
                                    <label class="profile-checkbox-row text-xs">
                                        <input
                                            type="checkbox"
                                            name="enabled_credit_debit_card"
                                            ${enabledMethods.includes("credit_debit_card") ? "checked" : ""}
                                        >
                                        <span>Enabled</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Unavailable Gateway Methods (Transparent Status) -->
                        <div class="space-y-3 pt-4 border-t border-[#D7CEC1]">
                            <h3 class="text-xs uppercase tracking-widest font-bold text-[#776B56]">Unavailable in Current Storefront Configuration</h3>
                            <div class="grid grid-cols-1 gap-3">
                                <div class="profile-payment-option is-disabled">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-semibold text-xs text-[#776B56]">Maya / Direct Bank Transfer</span>
                                        <span class="status-badge status-badge-unavailable">Unavailable</span>
                                    </div>
                                    <p class="text-[11px] text-[#776B56] mt-1">
                                        Not enabled in the current checkout workflow. Choose Cash on Delivery, GCash Reference, or Credit / Debit Card (Stripe).
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="profile-form-actions">
                            <button type="submit" class="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider" ${saving ? "disabled" : ""}>
                                ${saving ? "Saving Preferences..." : "Save Payment Preferences"}
                            </button>
                            <a href="/checkout" class="btn-outline py-2.5 px-5 text-xs uppercase tracking-wider">Go to Checkout</a>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderOrdersSection(state, formatPrice) {
        const orders = state.profileOrders || state.user?.orders || [];
        const activeFilter = state.profileOrderFilter || "all";
        const filteredOrders = activeFilter === "all"
            ? orders
            : orders.filter((o) => (o.status || "").toLowerCase() === activeFilter);

        return `
            <div class="profile-section-stack">
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Order History &amp; Reordering</p>
                            <h2 class="profile-card-title">Your Orders (${orders.length})</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">Track active deliveries, inspect payment status, or reorder available items.</p>
                        </div>
                        <a href="/orders" class="btn-primary py-2 px-4 text-xs uppercase tracking-wider">Open Full Order Portal</a>
                    </div>

                    <!-- Filter Tabs -->
                    <div class="profile-filter-pills">
                        ${[
                            { id: "all", label: "All Orders" },
                            { id: "confirmed", label: "Confirmed" },
                            { id: "processing", label: "Processing" },
                            { id: "shipped", label: "Shipped" },
                            { id: "delivered", label: "Delivered" },
                            { id: "cancelled", label: "Cancelled" },
                        ].map((tab) => `
                            <button
                                type="button"
                                onclick="app.setProfileOrderFilter('${tab.id}')"
                                class="profile-filter-pill ${activeFilter === tab.id ? "is-active" : ""}"
                            >
                                ${tab.label}
                            </button>
                        `).join("")}
                    </div>

                    ${filteredOrders.length === 0 ? `
                        <div class="profile-empty-state">
                            <p class="text-sm font-semibold text-[#4E4638]">No matching orders found</p>
                            <p class="text-xs text-[#776B56] mt-1 mb-4">
                                ${activeFilter === "all"
                                    ? "You haven't placed any orders yet."
                                    : `You have no orders with status "${escapeHtml(activeFilter)}".`}
                            </p>
                            <button type="button" onclick="app.navigate('shop')" class="btn-primary py-2 px-5 text-xs uppercase tracking-wider">Explore Catalog</button>
                        </div>
                    ` : `
                        <div class="space-y-4">
                            ${filteredOrders.map((order) => {
                                const orderNum = order.order_number || order.id;
                                const totalAmount = order.total?.amount ?? order.total ?? 0;
                                const status = order.status || "confirmed";
                                const paymentStatus = order.payment_status || "pending";
                                const shippingStatus = order.shipping_status || "not_ready";
                                const placedDate = formatDate(order.placed_at || order.date);
                                const items = order.items || [];
                                const firstSlug = items[0]?.product_slug || "";

                                return `
                                    <div class="profile-order-card">
                                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#D7CEC1]/60">
                                            <div>
                                                <div class="flex items-center gap-2.5 flex-wrap">
                                                    <span class="font-serif font-bold text-base text-[#4E4638]">${escapeHtml(orderNum)}</span>
                                                    <span class="profile-pill profile-pill--accent">${escapeHtml(status.replace(/_/g, " "))}</span>
                                                    <span class="profile-pill">Payment: ${escapeHtml(paymentStatus.replace(/_/g, " "))}</span>
                                                    <span class="profile-pill">Shipping: ${escapeHtml(shippingStatus.replace(/_/g, " "))}</span>
                                                </div>
                                                <p class="text-xs text-[#776B56] mt-1">Placed on ${escapeHtml(placedDate)}</p>
                                            </div>
                                            <div class="text-left sm:text-right">
                                                <span class="text-xs text-[#776B56] block">Order Total</span>
                                                <strong class="text-base font-bold text-[#4E4638]">${formatPrice(totalAmount)}</strong>
                                            </div>
                                        </div>

                                        <div class="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div class="text-xs text-[#776B56]">
                                                ${items.length > 0
                                                    ? items.map((it) => `${escapeHtml(it.product_title)} (x${it.quantity})`).join(" &bull; ")
                                                    : `${order.item_count || 1} item(s) in this order`}
                                            </div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                ${firstSlug ? `
                                                    <button type="button" onclick="app.navigate('pdp', {id: '${escapeHtml(firstSlug)}'})" class="btn-outline py-1.5 px-3 text-xs">
                                                        View Item
                                                    </button>
                                                ` : ""}
                                                <a href="/orders?order=${escapeHtml(orderNum)}" class="btn-primary py-1.5 px-3.5 text-xs">
                                                    Order Details &amp; Tracking
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function renderPreferencesSection(state) {
        const currentTheme = window.SecondMarketTheme
            ? window.SecondMarketTheme.getPreference()
            : (state.user?.themePreference || state.user?.theme_preference || "light");
        const notifPrefs = state.user?.notificationPreferences || state.user?.notification_preferences || {
            order_updates: true,
            shipping_alerts: true,
            promotional_emails: false,
            security_alerts: true,
        };
        const saving = Boolean(state.preferencesSaving);

        return `
            <div class="profile-section-stack">
                <!-- Appearance / Theme Settings Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Visual Theme</p>
                            <h2 class="profile-card-title">Appearance &amp; Theme Settings</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Choose how SecondMarket looks on your device. Changes apply immediately and sync to your buyer profile.
                            </p>
                        </div>
                    </div>

                    <div class="profile-theme-grid" role="radiogroup" aria-label="Theme preference">
                        ${[
                            {
                                id: "light",
                                title: "Light Mode",
                                subtitle: "Warm editorial parchment & espresso contrast",
                                previewClass: "profile-theme-preview--light",
                            },
                            {
                                id: "dark",
                                title: "Dark Mode",
                                subtitle: "Low-glare dark slate with warm sand typography",
                                previewClass: "profile-theme-preview--dark",
                            },
                            {
                                id: "system",
                                title: "System Default",
                                subtitle: "Automatically matches your OS appearance setting",
                                previewClass: "profile-theme-preview--system",
                            },
                        ].map((theme) => {
                            const active = currentTheme === theme.id;
                            return `
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked="${active}"
                                    onclick="app.handleThemeChange('${theme.id}')"
                                    class="profile-theme-card ${active ? "is-active" : ""}"
                                >
                                    <div class="profile-theme-preview ${theme.previewClass}">
                                        <span class="profile-theme-swatch-bar"></span>
                                        <span class="profile-theme-swatch-card"></span>
                                    </div>
                                    <div class="flex items-center justify-between w-full mt-3">
                                        <span class="font-semibold text-sm text-[#4E4638]">${theme.title}</span>
                                        ${active ? `<span class="status-badge status-badge-available">Active</span>` : ""}
                                    </div>
                                    <p class="text-xs text-[#776B56] mt-1 text-left">${theme.subtitle}</p>
                                </button>
                            `;
                        }).join("")}
                    </div>
                </div>

                <!-- Notification Preferences Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Communications</p>
                            <h2 class="profile-card-title">Notification Preferences</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Control which updates and alerts you receive from SecondMarket.
                            </p>
                        </div>
                    </div>

                    <form onsubmit="app.handleSaveNotificationPreferences(event)" class="space-y-4">
                        <label class="profile-toggle-row">
                            <div>
                                <span class="font-semibold text-sm text-[#4E4638] block">Order Status Updates</span>
                                <span class="text-xs text-[#776B56]">Receive notifications when your order is confirmed, processed, or cancelled.</span>
                            </div>
                            <input type="checkbox" name="order_updates" ${notifPrefs.order_updates !== false ? "checked" : ""} class="accent-[#6E614D] w-4 h-4">
                        </label>

                        <label class="profile-toggle-row">
                            <div>
                                <span class="font-semibold text-sm text-[#4E4638] block">Delivery &amp; Courier Alerts</span>
                                <span class="text-xs text-[#776B56]">Receive dispatch tracking numbers and delivery completion updates.</span>
                            </div>
                            <input type="checkbox" name="shipping_alerts" ${notifPrefs.shipping_alerts !== false ? "checked" : ""} class="accent-[#6E614D] w-4 h-4">
                        </label>

                        <label class="profile-toggle-row">
                            <div>
                                <span class="font-semibold text-sm text-[#4E4638] block">Promotional Offers &amp; Curated Finds</span>
                                <span class="text-xs text-[#776B56]">Optional highlights of newly listed secondhand pieces and seasonal coupon codes.</span>
                            </div>
                            <input type="checkbox" name="promotional_emails" ${notifPrefs.promotional_emails ? "checked" : ""} class="accent-[#6E614D] w-4 h-4">
                        </label>

                        <div class="profile-toggle-row opacity-80">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-semibold text-sm text-[#4E4638]">Security &amp; Account Alerts</span>
                                    <span class="profile-pill">Required</span>
                                </div>
                                <span class="text-xs text-[#776B56]">Critical alerts for password changes, session activity, and account verification.</span>
                            </div>
                            <input type="checkbox" checked disabled aria-label="Security &amp; Account Alerts (Required)" class="accent-[#6E614D] w-4 h-4">
                        </div>

                        <div class="profile-form-actions pt-2">
                            <button type="submit" class="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider" ${saving ? "disabled" : ""}>
                                ${saving ? "Saving..." : "Save Notification Preferences"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderSecuritySection(state) {
        const sessions = state.profileSessions || [];
        const passwordSaving = Boolean(state.passwordSaving);
        const deactivating = Boolean(state.accountDeactivating);

        return `
            <div class="profile-section-stack">
                <!-- Change Password Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Credentials</p>
                            <h2 class="profile-card-title">Change Password</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Use a strong password with at least 8 characters, including an uppercase letter, a lowercase letter, and a number.
                            </p>
                        </div>
                    </div>

                    <form id="profile-password-form" onsubmit="app.handleChangePassword(event)" class="profile-form-grid">
                        <div class="profile-field profile-field-full">
                            <label for="sec-current-password">Current Password <span class="text-red-700">*</span></label>
                            <div class="auth-password-wrap">
                                <input
                                    id="sec-current-password"
                                    name="current_password"
                                    type="password"
                                    required
                                    autocomplete="current-password"
                                    placeholder="Enter your current password"
                                    class="form-input"
                                >
                                <button type="button" class="auth-password-toggle" onclick="app.togglePasswordVisibility('sec-current-password', this)" aria-label="Show password" aria-pressed="false">Show</button>
                            </div>
                        </div>

                        <div class="profile-field">
                            <label for="sec-new-password">New Password <span class="text-red-700">*</span></label>
                            <div class="auth-password-wrap">
                                <input
                                    id="sec-new-password"
                                    name="new_password"
                                    type="password"
                                    required
                                    minlength="8"
                                    autocomplete="new-password"
                                    placeholder="Minimum 8 characters"
                                    class="form-input"
                                >
                                <button type="button" class="auth-password-toggle" onclick="app.togglePasswordVisibility('sec-new-password', this)" aria-label="Show password" aria-pressed="false">Show</button>
                            </div>
                        </div>

                        <div class="profile-field">
                            <label for="sec-confirm-password">Confirm New Password <span class="text-red-700">*</span></label>
                            <div class="auth-password-wrap">
                                <input
                                    id="sec-confirm-password"
                                    name="confirm_password"
                                    type="password"
                                    required
                                    minlength="8"
                                    autocomplete="new-password"
                                    placeholder="Re-enter new password"
                                    class="form-input"
                                >
                                <button type="button" class="auth-password-toggle" onclick="app.togglePasswordVisibility('sec-confirm-password', this)" aria-label="Show password" aria-pressed="false">Show</button>
                            </div>
                        </div>

                        <div class="profile-form-actions profile-field-full">
                            <button type="submit" class="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider" ${passwordSaving ? "disabled" : ""}>
                                ${passwordSaving ? "Updating Password..." : "Update Password"}
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Active Sessions Card -->
                <div class="profile-card">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow">Device Access</p>
                            <h2 class="profile-card-title">Active Login Sessions</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Review devices currently signed in to your buyer account.
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="app.handleRevokeOtherSessions()" class="btn-outline py-1.5 px-3 text-xs">
                                Sign Out Other Sessions
                            </button>
                            <button type="button" onclick="app.handleLogout()" class="btn-outline py-1.5 px-3 text-xs text-red-600">
                                Sign Out Current Device
                            </button>
                        </div>
                    </div>

                    <div class="divide-y divide-[#D7CEC1]">
                        ${sessions.length === 0 ? `
                            <div class="py-3 flex items-center justify-between text-xs">
                                <div>
                                    <p class="font-semibold text-[#4E4638]">Current Web Session</p>
                                    <p class="text-[#776B56]">Authenticated browser session</p>
                                </div>
                                <span class="status-badge status-badge-available">Current Session</span>
                            </div>
                        ` : sessions.map((sess) => `
                            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-semibold text-[#4E4638]">${escapeHtml(sess.user_agent || "Browser Session")}</span>
                                        ${sess.is_current ? `<span class="status-badge status-badge-available">Current Session</span>` : ""}
                                    </div>
                                    <p class="text-[#776B56] mt-0.5">
                                        IP: ${escapeHtml(sess.ip_address || "127.0.0.1")} &bull; Signed in ${escapeHtml(formatDate(sess.created_at))}
                                    </p>
                                </div>
                                ${!sess.is_current ? `
                                    <button type="button" onclick="app.handleRevokeSession(${sess.id})" class="btn-outline py-1 px-3 text-xs text-red-600">
                                        Revoke
                                    </button>
                                ` : ""}
                            </div>
                        `).join("")}
                    </div>
                </div>

                <!-- Account Deactivation Card -->
                <div class="profile-card profile-card--danger">
                    <div class="profile-card-header">
                        <div>
                            <p class="profile-eyebrow text-red-600">Account Closure</p>
                            <h2 class="profile-card-title">Deactivate Buyer Account</h2>
                            <p class="text-xs text-[#776B56] mt-0.5">
                                Deactivating your account immediately revokes all active sessions and disables future sign-ins. Historical order records are retained for audit compliance.
                            </p>
                        </div>
                    </div>

                    <form onsubmit="app.handleDeactivateAccount(event)" class="space-y-4">
                        <div class="profile-field max-w-md">
                            <label for="deactivate-password">Confirm Current Password <span class="text-red-700">*</span></label>
                            <div class="auth-password-wrap">
                                <input
                                    id="deactivate-password"
                                    name="password"
                                    type="password"
                                    required
                                    autocomplete="current-password"
                                    placeholder="Enter password to confirm deactivation"
                                    class="form-input"
                                >
                                <button type="button" class="auth-password-toggle" onclick="app.togglePasswordVisibility('deactivate-password', this)" aria-label="Show password" aria-pressed="false">Show</button>
                            </div>
                        </div>
                        <label class="profile-checkbox-row text-xs">
                            <input type="checkbox" name="confirm_deactivation" required class="accent-[#6E614D]">
                            <span>I understand that deactivating my account will sign me out and disable access.</span>
                        </label>
                        <div>
                            <button type="submit" class="btn-outline py-2 px-5 text-xs uppercase tracking-wider text-red-700 border-red-600 hover:bg-red-50" ${deactivating ? "disabled" : ""}>
                                ${deactivating ? "Deactivating..." : "Deactivate My Account"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderAccountView(state, formatPrice) {
        if (!state.user) {
            return renderAccountRequiredView();
        }

        if (state.user.role === "admin") {
            window.location.href = "/admin";
            return `
                <section class="auth-shell" aria-labelledby="admin-redirect-title">
                    <div class="auth-panel text-center space-y-4">
                        <h1 id="admin-redirect-title" class="font-serif text-2xl font-semibold text-[#4E4638]">Redirecting To Admin</h1>
                        <p class="text-sm text-[#776B56]">Admin seller accounts are managed in the admin workspace.</p>
                        <a href="/admin" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Open Admin Workspace</a>
                    </div>
                </section>
            `;
        }

        const activeTab = state.profileTab || "overview";
        const user = state.user;
        const tabs = [
            { id: "overview", label: "Overview" },
            { id: "personal", label: "Personal Info & Photo" },
            { id: "addresses", label: "Delivery Addresses" },
            { id: "payments", label: "Payment Preferences" },
            { id: "orders", label: "Orders & Activity" },
            { id: "preferences", label: "Appearance & Alerts" },
            { id: "security", label: "Security & Privacy" },
        ];

        let sectionMarkup = "";
        switch (activeTab) {
            case "personal":
                sectionMarkup = renderPersonalSection(state);
                break;
            case "addresses":
                sectionMarkup = renderAddressesSection(state);
                break;
            case "payments":
                sectionMarkup = renderPaymentsSection(state);
                break;
            case "orders":
                sectionMarkup = renderOrdersSection(state, formatPrice);
                break;
            case "preferences":
                sectionMarkup = renderPreferencesSection(state);
                break;
            case "security":
                sectionMarkup = renderSecuritySection(state);
                break;
            case "overview":
            default:
                sectionMarkup = renderOverviewSection(state, formatPrice);
                break;
        }

        return `
            <section class="profile-shell max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" aria-labelledby="profile-heading">
                <!-- Profile Hero Header Banner -->
                <div class="profile-hero-card">
                    <div class="profile-hero-identity">
                        ${renderAvatarMarkup(user, "profile-avatar-lg", state.avatarPreviewUrl)}
                        <div>
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <h1 id="profile-heading" class="font-serif text-2xl sm:text-3xl font-semibold text-[#4E4638]">
                                    Welcome, ${escapeHtml(user.name)}
                                </h1>
                                <span class="status-badge status-badge-available">Verified Buyer</span>
                            </div>
                            <p class="text-xs text-[#776B56] mt-1">
                                ${escapeHtml(user.email)} &bull; ${escapeHtml(user.phone && user.phone !== "Not provided" ? user.phone : "No phone on file")} &bull; Member since ${escapeHtml(formatDate(user.createdAt || user.created_at))}
                            </p>
                        </div>
                    </div>

                    <div class="profile-hero-actions">
                        <button type="button" onclick="app.setProfileTab('personal')" class="btn-outline py-2 px-4 text-xs">
                            Edit Profile
                        </button>
                        <button type="button" onclick="app.handleLogout()" class="btn-outline py-2 px-4 text-xs">
                            Sign Out
                        </button>
                    </div>
                </div>

                <!-- Profile Layout: Sticky Section Navigation + Active Section Content -->
                <div class="profile-layout-grid">
                    <aside class="profile-sidebar-nav" aria-label="Customer profile sections">
                        <nav class="profile-nav-list">
                            ${tabs.map((tab) => `
                                <button
                                    type="button"
                                    onclick="app.setProfileTab('${tab.id}')"
                                    class="profile-nav-button ${activeTab === tab.id ? "is-active" : ""}"
                                    aria-current="${activeTab === tab.id ? "page" : "false"}"
                                >
                                    <span>${escapeHtml(tab.label)}</span>
                                    <span aria-hidden="true">&rsaquo;</span>
                                </button>
                            `).join("")}
                        </nav>
                    </aside>

                    <div class="profile-main-panel">
                        ${sectionMarkup}
                    </div>
                </div>
            </section>
        `;
    }

    window.SecondMarketAuthViews = {
        renderAccountRequiredView,
        renderAccountView,
        renderAuthView,
        renderCheckoutAuthRequiredView,
        renderAvatarMarkup,
    };
})();
