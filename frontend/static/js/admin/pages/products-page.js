(function () {
    function generateSKU(product) {
        if (product.sku && product.sku.trim()) {
            return product.sku.trim();
        }
        if (product.brand && product.brand.trim()) {
            return product.brand.trim();
        }
        const catCode = (product.category?.name || "GEN").substring(0, 3).toUpperCase();
        const titleParts = (product.title || "PRD").split(/\s+/).map((w) => w[0]).join("").substring(0, 3).toUpperCase();
        const idNum = String(product.id || 1).padStart(3, "0");
        return `${catCode}-${titleParts || "ITM"}-${idNum}`;
    }

    function renderProductsPage() {
        const allProducts = this.state.products || [];
        const categories = this.state.categories || [];
        const disabled = this.actionDisabledAttribute();

        // 1. Filter products locally based on filters if not already server filtered
        let filtered = allProducts;
        const query = (this.state.productFilters?.q || "").toLowerCase().trim();
        const selectedCat = this.state.productFilters?.category_slug || "all";
        const selectedStatus = this.state.productFilters?.status || "all";
        const selectedStock = this.state.productFilters?.stock_level || "all";

        if (query) {
            filtered = filtered.filter((p) =>
                p.title.toLowerCase().includes(query) ||
                (p.slug && p.slug.toLowerCase().includes(query)) ||
                (p.category?.name && p.category.name.toLowerCase().includes(query)) ||
                generateSKU(p).toLowerCase().includes(query)
            );
        }

        if (selectedCat !== "all") {
            filtered = filtered.filter((p) => p.category?.slug === selectedCat);
        }

        if (selectedStatus !== "all") {
            filtered = filtered.filter((p) => p.status === selectedStatus);
        }

        if (selectedStock === "in_stock") {
            filtered = filtered.filter((p) => p.quantity > (p.low_stock_threshold ?? 5));
        } else if (selectedStock === "low_stock") {
            filtered = filtered.filter((p) => p.quantity > 0 && p.quantity <= (p.low_stock_threshold ?? 5));
        } else if (selectedStock === "out_of_stock") {
            filtered = filtered.filter((p) => p.quantity === 0);
        }

        // 2. Pagination calculation (8 per page matching UI screenshot)
        const pageSize = this.state.productPageSize || 8;
        const currentPage = this.state.productPageNumber || 1;
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const startIdx = (safePage - 1) * pageSize;
        const paginatedProducts = filtered.slice(startIdx, startIdx + pageSize);

        // 3. Category options for filter and modal
        const categoryFilterOptions = categories.map((c) => `
            <option value="${this.escapeAttribute(c.slug)}" ${c.slug === selectedCat ? "selected" : ""}>${this.escapeHtml(c.name)}</option>
        `).join("");

        const categoryModalOptions = categories.length
            ? categories.map((c) => `
            <option value="${this.escapeAttribute(c.slug)}">${this.escapeHtml(c.name)}</option>
        `).join("")
            : `<option value="" disabled selected>No categories available</option>`;

        // 4. Status filter options
        const statusOptions = [
            { value: "all", label: "All Statuses" },
            { value: "available", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "hidden", label: "Archived / Hidden" },
            { value: "reserved", label: "Reserved" },
            { value: "sold", label: "Sold" },
        ].map((opt) => `
            <option value="${opt.value}" ${opt.value === selectedStatus ? "selected" : ""}>${opt.label}</option>
        `).join("");

        // 5. Stock level filter options
        const stockLevelOptions = [
            { value: "all", label: "All Stock Levels" },
            { value: "in_stock", label: "In Stock (> 5)" },
            { value: "low_stock", label: "Low Stock (1-5)" },
            { value: "out_of_stock", label: "Out of Stock (0)" },
        ].map((opt) => `
            <option value="${opt.value}" ${opt.value === selectedStock ? "selected" : ""}>${opt.label}</option>
        `).join("");

        // 6. Sort options
        const currentSort = this.state.productFilters?.sort || "recent";
        const sortOptions = [
            { value: "recent", label: "Newest First" },
            { value: "title_asc", label: "Title: A to Z" },
            { value: "price_asc", label: "Price: Low to High" },
            { value: "price_desc", label: "Price: High to Low" },
            { value: "quantity_desc", label: "Inventory: High to Low" },
        ].map((opt) => `
            <option value="${opt.value}" ${opt.value === currentSort ? "selected" : ""}>${opt.label}</option>
        `).join("");

        // 7. Product table rows
        const productRows = paginatedProducts.map((product) => {
            const sku = generateSKU(product);
            const primaryImgUrl = product.primary_image?.url || product.images?.[0]?.url || "";
            const thumbHtml = primaryImgUrl
                ? `<img src="${this.escapeAttribute(primaryImgUrl)}" alt="${this.escapeAttribute(product.title)}" class="admin-product-table-thumb">`
                : `<div class="admin-product-table-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;

            // Inventory pill rendering
            const lowThreshold = product.low_stock_threshold ?? 5;
            let stockPillClass = "stock-in";
            let stockLabel = `${product.quantity} in stock`;
            if (product.quantity === 0) {
                stockPillClass = "stock-out";
                stockLabel = "Out of stock";
            } else if (product.quantity <= lowThreshold) {
                stockPillClass = "stock-low";
                stockLabel = `${product.quantity} low stock`;
            }

            // Status pill rendering
            let statusPillClass = "status-active";
            let statusLabel = "active";
            if (product.status === "draft") {
                statusPillClass = "status-draft";
                statusLabel = "draft";
            } else if (product.status === "hidden") {
                statusPillClass = "status-archived";
                statusLabel = "archived";
            } else if (product.status === "sold") {
                statusPillClass = "status-sold";
                statusLabel = "sold";
            } else if (product.status === "reserved") {
                statusPillClass = "status-reserved";
                statusLabel = "reserved";
            }

            const formattedPrice = this.formatPrice(product.price);
            const conditionText = this.conditionLabel ? this.conditionLabel(product.condition) : "Standard product";
            const rawComparePrice = product.compare_at_price ?? product.market_price;
            const comparePriceHtml = rawComparePrice && (rawComparePrice.amount > 0 || rawComparePrice > 0)
                ? `<span class="admin-price-strike">${this.formatPrice(rawComparePrice)}</span>`
                : "";
            const isChecked = (this.state.selectedProductSlugs || []).includes(product.slug);

            return `
            <tr data-product-slug="${this.escapeAttribute(product.slug)}" class="${isChecked ? 'is-selected' : ''}">
                <td>
                    <input type="checkbox" class="admin-checkbox admin-row-checkbox" data-product-slug="${this.escapeAttribute(product.slug)}" value="${product.id}" ${isChecked ? "checked" : ""} onchange="adminApp.toggleSelectProductRow(this, '${this.escapeAttribute(product.slug)}')" aria-label="Select product">
                </td>
                <td>
                    <div class="admin-table-product-cell">
                        ${thumbHtml}
                        <div class="admin-table-product-meta">
                            <strong class="admin-table-product-title" onclick="adminApp.openEditProductModal('${this.escapeAttribute(product.slug)}')">${this.escapeHtml(product.title)}</strong>
                            <span class="admin-table-product-sub">${this.escapeHtml(conditionText)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="admin-sku-pill">${this.escapeHtml(sku)}</span>
                </td>
                <td>
                    <span class="admin-cat-pill-saas">${this.escapeHtml(product.category?.name || "General")}</span>
                </td>
                <td>
                    <div class="admin-price-cell-saas">
                        <strong class="admin-price-bold">${formattedPrice}</strong>
                        ${comparePriceHtml}
                    </div>
                </td>
                <td>
                    <div class="admin-stock-cell-wrap">
                        <span class="admin-pill-badge ${stockPillClass}">
                            <span class="admin-pill-dot"></span>
                            <span>${stockLabel}</span>
                        </span>
                        <!-- Quick Quantity Editor Form -->
                        <form class="admin-quantity-action admin-mini-qty-form" onsubmit="adminApp.setProductQuantity(event, '${this.escapeAttribute(product.slug)}')">
                            <input data-admin-action name="quantity" type="number" min="0" step="1" value="${product.quantity}" ${disabled} class="admin-mini-qty-input" aria-label="Quantity">
                            <button data-admin-action type="submit" ${disabled} class="admin-mini-qty-btn" title="Save quantity">Save</button>
                        </form>
                    </div>
                </td>
                <td>
                    <div class="admin-status-cell-wrap">
                        <span class="admin-pill-badge ${statusPillClass}">
                            <span class="admin-pill-dot"></span>
                            <span>${statusLabel}</span>
                        </span>
                        <select data-admin-action class="admin-select-hidden-trigger" onchange="adminApp.setProductStatus('${this.escapeAttribute(product.slug)}', this.value)" ${disabled} title="Change status">
                            <option value="available" ${product.status === "available" ? "selected" : ""}>Active</option>
                            <option value="draft" ${product.status === "draft" ? "selected" : ""}>Draft</option>
                            <option value="hidden" ${product.status === "hidden" ? "selected" : ""}>Archived</option>
                            <option value="reserved" ${product.status === "reserved" ? "selected" : ""}>Reserved</option>
                            <option value="sold" ${product.status === "sold" ? "selected" : ""}>Sold</option>
                        </select>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions admin-table-actions-row">
                        <button type="button" class="admin-action-icon-btn" onclick="adminApp.openProductMovementsModal('${this.escapeAttribute(product.slug)}')" ${disabled} title="Stock Movement Ledger" aria-label="Stock Movement Ledger">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </button>
                        <button type="button" class="admin-action-icon-btn" onclick="adminApp.openEditProductModal('${this.escapeAttribute(product.slug)}')" ${disabled} title="Edit Product">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button type="button" class="admin-action-icon-btn admin-action-btn-danger" onclick="adminApp.confirmDeleteProduct('${this.escapeAttribute(product.slug)}')" ${disabled} title="Permanently Delete Product" aria-label="Delete Product">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join("") || this.emptyTableRow("No products found matching your catalog filters.", 8);

        // 8. Pagination info and controls
        const endIdx = Math.min(startIdx + pageSize, totalItems);
        const paginationInfo = totalItems > 0
            ? `Showing ${startIdx + 1} to ${endIdx} of ${totalItems} products`
            : "No products in catalog";

        let paginationControls = "";
        if (totalPages > 1) {
            paginationControls += `
                <button type="button" class="admin-page-nav-btn" ${safePage <= 1 ? "disabled" : ""} onclick="adminApp.setProductPage(${safePage - 1})" aria-label="Previous page">&lsaquo;</button>
            `;
            for (let i = 1; i <= totalPages; i++) {
                paginationControls += `
                    <button type="button" class="admin-page-num-btn ${i === safePage ? "is-active" : ""}" onclick="adminApp.setProductPage(${i})">${i}</button>
                `;
            }
            paginationControls += `
                <button type="button" class="admin-page-nav-btn" ${safePage >= totalPages ? "disabled" : ""} onclick="adminApp.setProductPage(${safePage + 1})" aria-label="Next page">&rsaquo;</button>
            `;
        }

        const selectedSlugs = this.state.selectedProductSlugs || [];
        const bulkActionBar = selectedSlugs.length > 0 ? `
            <div class="admin-bulk-action-bar" role="region" aria-label="Bulk Product Actions">
                <div class="admin-bulk-count">
                    <strong>${selectedSlugs.length}</strong> product${selectedSlugs.length === 1 ? "" : "s"} selected
                </div>
                <div class="admin-bulk-buttons">
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkProductAction('status', 'available')" ${disabled}>Set Active</button>
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkProductAction('status', 'draft')" ${disabled}>Set Draft</button>
                    <button type="button" class="admin-btn-action-outline" onclick="adminApp.executeBulkProductAction('status', 'hidden')" ${disabled}>Archive</button>
                    <button type="button" class="admin-btn-action-outline admin-bulk-danger" onclick="adminApp.executeBulkProductAction('delete')" ${disabled}>Delete Selected</button>
                    <button type="button" class="admin-text-button" onclick="adminApp.clearProductSelection()">Clear</button>
                </div>
            </div>
        ` : "";

        const lowStockCount = allProducts.filter((p) => p.quantity > 0 && p.quantity <= (p.low_stock_threshold ?? 5)).length;
        const outOfStockCount = allProducts.filter((p) => p.quantity === 0).length;
        const stockSummaryChips = `
            <div class="admin-filter-pill-bar" role="group" aria-label="Stock health filters" style="margin-bottom:0.85rem;">
                <button type="button" class="admin-pill-btn ${selectedStock === "all" ? "is-active" : ""}" onclick="adminApp.setProductStockFilter('all')">All Stock (${allProducts.length})</button>
                <button type="button" class="admin-pill-btn ${selectedStock === "low_stock" ? "is-active" : ""}" onclick="adminApp.setProductStockFilter('low_stock')">Low Stock (${lowStockCount})</button>
                <button type="button" class="admin-pill-btn ${selectedStock === "out_of_stock" ? "is-active" : ""}" onclick="adminApp.setProductStockFilter('out_of_stock')">Out of Stock (${outOfStockCount})</button>
            </div>
        `;

        return this.renderPageTemplate("products", {
            searchQuery: this.escapeAttribute(this.state.productFilters?.q || ""),
            categoryFilterOptions,
            categoryModalOptions,
            statusOptions,
            stockLevelOptions,
            sortOptions,
            stockSummaryChips,
            stockMovementsModalBody: "",
            productCount: totalItems,
            bulkActionBar,
            productStatus: this.renderInventoryStatus("Product inventory is loading."),
            productRows,
            paginationInfo,
            paginationControls,
        });
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderProductsPage = renderProductsPage;
})();
