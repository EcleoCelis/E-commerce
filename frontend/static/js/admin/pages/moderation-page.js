(function () {
    function optionList(options, selectedValue) {
        return options.map((option) => `
            <option value="${option.value}" ${option.value === selectedValue ? "selected" : ""}>${option.label}</option>
        `).join("");
    }

    function renderReportsTab() {
        const reports = this.state.moderationReports || [];
        const filters = this.state.moderationReportFilters || { status: "all", reason: "all" };
        const disabled = this.actionDisabledAttribute();

        const statusOptions = optionList([
            { value: "all", label: "All Statuses" },
            { value: "open", label: "Open" },
            { value: "reviewing", label: "Reviewing" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
        ], filters.status);

        const reasonOptions = optionList([
            { value: "all", label: "All Reasons" },
            { value: "misleading", label: "Misleading" },
            { value: "inappropriate", label: "Inappropriate" },
            { value: "counterfeit", label: "Counterfeit" },
            { value: "wrong_category", label: "Wrong Category" },
            { value: "other", label: "Other" },
        ], filters.reason);

        const rows = reports.map((report) => `
            <tr>
                <td>
                    ${report.product?.slug ? `
                        <button type="button" class="admin-text-button" style="padding:0; font-weight:600; text-align:left;" onclick="adminApp.navigate('products').then(() => adminApp.openEditProductModal('${this.escapeAttribute(report.product.slug)}'))">
                            ${this.escapeHtml(report.product?.title || "Listing")}
                        </button>
                    ` : `<strong>${this.escapeHtml(report.product?.title || "Listing")}</strong>`}
                    <div class="admin-muted">${this.escapeHtml(report.product?.slug || "")}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(report.reporter?.name || "Buyer")}</strong>
                    <div class="admin-muted">${this.escapeHtml(report.reporter?.email || "")}</div>
                </td>
                <td>
                    <span class="admin-badge ${this.escapeAttribute(report.reason)}">${this.escapeHtml(report.reason)}</span>
                    ${report.details ? `<p class="admin-muted" style="margin-top: 0.25rem; font-size: 0.75rem;">${this.escapeHtml(report.details)}</p>` : ""}
                </td>
                <td>${this.statusBadge(report.status)}</td>
                <td>
                    ${report.resolved_by ? `
                        <span class="admin-muted">By ${this.escapeHtml(report.resolved_by.name)}</span>
                        <div class="admin-muted">${this.escapeHtml(this.formatDate(report.resolved_at))}</div>
                    ` : `<span class="admin-muted">${this.escapeHtml(this.formatDate(report.created_at))}</span>`}
                </td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        ${report.status === "open" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.setReportStatus(${report.id}, 'reviewing')" ${disabled}>Review</button>
                        ` : ""}
                        ${report.status !== "resolved" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.setReportStatus(${report.id}, 'resolved')" ${disabled}>Resolve</button>
                        ` : ""}
                        ${report.status !== "dismissed" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-muted" onclick="adminApp.setReportStatus(${report.id}, 'dismissed')" ${disabled}>Dismiss</button>
                        ` : ""}
                        ${report.product?.slug ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-danger" onclick="adminApp.setProductStatus('${this.escapeAttribute(report.product.slug)}', 'hidden')" ${disabled} title="Archive / hide reported product">Hide Item</button>
                        ` : ""}
                    </div>
                </td>
            </tr>
        `).join("") || this.emptyTableRow("No product reports match the selected filters.", 6);

        return `
            <form class="admin-filter-bar admin-filter-bar-compact" onsubmit="adminApp.applyReportFilters(event)">
                <label class="admin-field">
                    <span>Status</span>
                    <select name="status">
                        ${statusOptions}
                    </select>
                </label>
                <label class="admin-field">
                    <span>Reason</span>
                    <select name="reason">
                        ${reasonOptions}
                    </select>
                </label>
                <button type="submit" class="admin-button-secondary">Filter</button>
            </form>

            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h3>${reports.length} Product Reports</h3>
                    <button type="button" onclick="adminApp.resetReportFilters()" class="admin-text-button">Reset</button>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Product</th>
                                <th scope="col">Reporter</th>
                                <th scope="col">Reason & Details</th>
                                <th scope="col">Status</th>
                                <th scope="col">Date / Resolver</th>
                                <th scope="col" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderReviewsTab() {
        const reviews = this.state.moderationReviews || [];
        const filters = this.state.moderationReviewFilters || { status: "all" };
        const disabled = this.actionDisabledAttribute();

        const statusOptions = optionList([
            { value: "all", label: "All Statuses" },
            { value: "published", label: "Published" },
            { value: "hidden", label: "Hidden" },
            { value: "flagged", label: "Flagged" },
        ], filters.status);

        const rows = reviews.map((review) => `
            <tr>
                <td>
                    <strong>${this.escapeHtml(review.product?.title || "Listing")}</strong>
                    <div class="admin-muted">${this.escapeHtml(review.product?.slug || "")}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(review.user?.name || "Buyer")}</strong>
                    <div class="admin-muted">${this.escapeHtml(review.user?.email || "")}</div>
                    ${review.is_verified_purchase ? `<span class="admin-badge available">Verified</span>` : ""}
                </td>
                <td>
                    <strong>${review.rating} ★</strong> ${review.title ? `— <strong>${this.escapeHtml(review.title)}</strong>` : ""}
                    ${review.body ? `<p class="admin-muted" style="margin-top: 0.25rem; font-size: 0.75rem;">${this.escapeHtml(review.body)}</p>` : ""}
                </td>
                <td>${this.statusBadge(review.status)}</td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(review.created_at))}</span></td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        ${review.status !== "published" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.setReviewStatus(${review.id}, 'published')" ${disabled}>Publish</button>
                        ` : ""}
                        ${review.status !== "hidden" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-danger" onclick="adminApp.setReviewStatus(${review.id}, 'hidden')" ${disabled}>Hide</button>
                        ` : ""}
                        ${review.status !== "flagged" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-muted" onclick="adminApp.setReviewStatus(${review.id}, 'flagged')" ${disabled}>Flag</button>
                        ` : ""}
                    </div>
                </td>
            </tr>
        `).join("") || this.emptyTableRow("No customer reviews match the selected filters.", 6);

        return `
            <form class="admin-filter-bar admin-filter-bar-compact" onsubmit="adminApp.applyReviewFilters(event)">
                <label class="admin-field">
                    <span>Status</span>
                    <select name="status">
                        ${statusOptions}
                    </select>
                </label>
                <button type="submit" class="admin-button-secondary">Filter</button>
            </form>

            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h3>${reviews.length} Customer Reviews</h3>
                    <button type="button" onclick="adminApp.resetReviewFilters()" class="admin-text-button">Reset</button>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Product</th>
                                <th scope="col">Author</th>
                                <th scope="col">Rating & Review</th>
                                <th scope="col">Status</th>
                                <th scope="col">Date</th>
                                <th scope="col" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderModerationPage() {
        const tab = this.state.moderationTab || "reports";
        const reportsCount = (this.state.moderationReports || []).length;
        const reviewsCount = (this.state.moderationReviews || []).length;

        const moderationContent = tab === "reviews" ? renderReviewsTab.call(this) : renderReportsTab.call(this);

        return this.renderPageTemplate("moderation", {
            reportsCount,
            reviewsCount,
            reportsTabActive: tab === "reports" ? "is-active" : "",
            reviewsTabActive: tab === "reviews" ? "is-active" : "",
            moderationStatus: this.renderInventoryStatus("Loading moderation queue..."),
            moderationContent,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderModerationPage = renderModerationPage;
})();

