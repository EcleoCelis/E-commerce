(function () {
    const CATEGORY_ICONS = {
        sofa: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 5v6"/></svg>`,
        coffee: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`,
        lamp: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6l3 7H6l3-7Z"/><path d="M12 9v9"/><path d="M8 22h8"/><path d="M10 18h4"/></svg>`,
        sparkles: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>`,
        laptop: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/><path d="M10 16h4"/></svg>`,
        gem: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M2 9h20"/></svg>`,
        layers: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
        cutlery: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20"/><path d="M18 7a3 3 0 0 0 3-3V2h-6v2a3 3 0 0 0 3 3z"/><path d="M6 2v20"/><path d="M3 2v6a3 3 0 0 0 6 0V2"/></svg>`,
        candle: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.67 19a2 2 0 0 0 1.73 3h11.2a2 2 0 0 0 1.73-3L14 9.31V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>`,
        box: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    };

    const CUBE_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 16-9 5-9-5V8l9-5 9 5v8Z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.01V12"/></svg>`;
    const EDIT_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    const DELETE_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

    function resolveCategoryIcon(category) {
        if (category.image_url && category.image_url.startsWith("icon:")) {
            const key = category.image_url.slice(5).trim();
            if (CATEGORY_ICONS[key]) return key;
        }

        const slug = (category.slug || "").toLowerCase();
        const name = (category.name || "").toLowerCase();

        if (slug.includes("furn") || name.includes("furn") || slug.includes("sofa")) return "sofa";
        if (slug.includes("ceramic") || slug.includes("dining") || slug.includes("coffee") || name.includes("ceramic") || name.includes("coffee")) return "coffee";
        if (slug.includes("kitchen") || name.includes("kitchen") || slug.includes("cutlery")) return "cutlery";
        if (slug.includes("aroma") || slug.includes("candle") || name.includes("aroma")) return "candle";
        if (slug.includes("light") || slug.includes("lamp") || name.includes("light")) return "lamp";
        if (slug.includes("textile") || slug.includes("rug") || slug.includes("fashion") || name.includes("textile") || name.includes("fashion")) return "sparkles";
        if (slug.includes("work") || slug.includes("office") || slug.includes("electron") || slug.includes("laptop") || slug.includes("phone")) return "laptop";
        if (slug.includes("decor") || slug.includes("object") || slug.includes("gem") || slug.includes("art")) return "gem";
        if (slug.includes("layer")) return "layers";

        return "box";
    }

    function formatCategoryDate(isoString) {
        if (!isoString) return "Added Jan 10, 2025";
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return "Added Jan 10, 2025";
        return `Added ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }

    function renderCategoriesPage() {
        const disabled = this.actionDisabledAttribute();

        const products = this.state.products || [];
        const productOptionsChecklist = products.length > 0
            ? products.slice(0, 100).map((p) => `
                <label class="admin-picker-item" data-search="${this.escapeAttribute(p.title.toLowerCase())}">
                    <input type="checkbox" name="product_ids" value="${p.id}" ${p.category?.slug === (this.state.editingCategorySlug || "") ? "checked" : ""} onchange="adminApp.updateSelectedProductsCount()">
                    <span class="admin-picker-title">${this.escapeHtml(p.title)}</span>
                    <span class="admin-picker-meta">${this.escapeHtml(p.category?.name || "Uncategorized")}</span>
                </label>
            `).join("")
            : '<div class="admin-empty-picker">No products in inventory to assign.</div>';

        // 1. Render 3-Column SaaS Cards Grid
        const categoryCards = (this.state.categories || []).map((category) => {
            const iconKey = resolveCategoryIcon(category);
            const isCustomImage = category.image_url && (category.image_url.startsWith("/") || category.image_url.startsWith("http"));
            const iconBadgeContent = isCustomImage
                ? `<img src="${this.escapeAttribute(category.image_url)}" alt="${this.escapeAttribute(category.name)}">`
                : (CATEGORY_ICONS[iconKey] || CATEGORY_ICONS.box);

            const statusPillClass = category.is_active ? "is-active" : "is-inactive";
            const statusText = category.is_active ? "active" : "inactive";
            const dateFormatted = formatCategoryDate(category.created_at);
            const prodCount = category.product_count || 0;
            const prodCountText = `${prodCount} associated product${prodCount === 1 ? "" : "s"}`;

            return `
            <div class="admin-category-card" data-slug="${this.escapeAttribute(category.slug)}">
                <div class="admin-category-card-top">
                    <div class="admin-category-icon-badge" aria-hidden="true">
                        ${iconBadgeContent}
                    </div>
                    <span class="admin-category-status-pill ${statusPillClass}">
                        <span class="admin-category-status-dot">●</span> ${statusText}
                    </span>
                </div>
                <div class="admin-category-card-body">
                    <h3 class="admin-category-card-name">${this.escapeHtml(category.name)}</h3>
                    <div class="admin-category-card-slug">/${this.escapeHtml(category.slug)}</div>
                    <div class="admin-category-card-desc" title="${this.escapeAttribute(category.description || "")}">
                        ${this.escapeHtml(category.description || "No description provided.")}
                    </div>
                    <div class="admin-category-assoc-products">
                        <span class="admin-category-assoc-icon">${CUBE_ICON_SVG}</span>
                        <span>${prodCountText}</span>
                    </div>
                </div>
                <div class="admin-category-card-footer">
                    <span class="admin-category-card-date">${dateFormatted}</span>
                    <div class="admin-category-card-actions">
                        <button type="button" class="admin-cat-card-action-btn" onclick="adminApp.openEditCategoryModal('${this.escapeAttribute(category.slug)}')" ${disabled} title="Edit Category" aria-label="Edit category ${this.escapeAttribute(category.name)}">
                            ${EDIT_ICON_SVG}
                        </button>
                        <button type="button" class="admin-cat-card-action-btn admin-cat-card-delete-btn" onclick="adminApp.openDeleteCategoryModal('${this.escapeAttribute(category.slug)}', '${this.escapeAttribute(category.name)}', ${prodCount})" ${disabled} title="Delete Category" aria-label="Delete category ${this.escapeAttribute(category.name)}">
                            ${DELETE_ICON_SVG}
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join("") || `<div class="admin-empty-card" style="grid-column: 1 / -1; padding: 3rem; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b;">No categories created yet. Click "+ Add Category" above to create one.</div>`;

        // 2. Render Category Table Rows (for Table view & contract compliance)
        const categoryRows = (this.state.categories || []).map((category) => {
            const iconKey = resolveCategoryIcon(category);
            const isCustomImage = category.image_url && (category.image_url.startsWith("/") || category.image_url.startsWith("http"));
            const imageThumb = isCustomImage
                ? `<img src="${this.escapeAttribute(category.image_url)}" alt="${this.escapeAttribute(category.name)}" class="admin-cat-thumb">`
                : `<div class="admin-cat-thumb-placeholder">${CATEGORY_ICONS[iconKey] || (category.name || "C")[0].toUpperCase()}</div>`;
            return `
            <tr>
                <td>
                    <div class="admin-cat-cell">
                        ${imageThumb}
                        <div class="admin-cat-info">
                            <strong class="admin-table-primary-text">${this.escapeHtml(category.name)}</strong>
                            <div class="admin-muted admin-cat-desc" title="${this.escapeAttribute(category.description || '')}">${this.escapeHtml(category.description || "No description provided.")}</div>
                        </div>
                    </div>
                </td>
                <td><code class="admin-code-pill">${this.escapeHtml(category.slug)}</code></td>
                <td class="admin-num-cell">
                    <span class="admin-count-pill">${category.product_count || 0}</span>
                </td>
                <td>
                    <select data-admin-action class="admin-table-select ${category.is_active ? 'is-active' : 'is-inactive'}" onchange="adminApp.setCategoryStatus('${this.escapeAttribute(category.slug)}', this.value)" ${disabled} title="Click to change category status">
                        <option value="true" ${category.is_active ? "selected" : ""}>● Active</option>
                        <option value="false" ${!category.is_active ? "selected" : ""}>○ Inactive</option>
                    </select>
                </td>
                <td class="admin-num-cell">
                    <form class="admin-quantity-action admin-sort-inline-form" onsubmit="adminApp.setCategorySortOrder(event, '${this.escapeAttribute(category.slug)}')">
                        <input data-admin-action name="sort_order" type="number" min="0" step="1" value="${category.sort_order}" ${disabled} class="admin-sort-num-input" aria-label="Sort order">
                        <button data-admin-action type="submit" ${disabled} class="admin-sort-btn" title="Save sort order">Save</button>
                    </form>
                </td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions admin-table-actions-cluster">
                        <button type="button" class="admin-btn-table-action" onclick="adminApp.openEditCategoryModal('${this.escapeAttribute(category.slug)}')" ${disabled} title="Edit category details">
                            Edit
                        </button>
                        <button type="button" class="admin-btn-table-action" style="color: #ef4444;" onclick="adminApp.openDeleteCategoryModal('${this.escapeAttribute(category.slug)}', '${this.escapeAttribute(category.name)}', ${category.product_count || 0})" ${disabled} title="Delete category">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No categories are available yet.", 6);

        return this.renderPageTemplate("categories", {
            categoryCount: this.state.categories.length,
            categoryStatus: this.renderInventoryStatus("Categories are loading."),
            categoryActionDisabled: disabled,
            categoryCards,
            categoryRows,
            productOptionsChecklist,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderCategoriesPage = renderCategoriesPage;
    window.SecondMarketAdminPages.resolveCategoryIcon = resolveCategoryIcon;
})();
