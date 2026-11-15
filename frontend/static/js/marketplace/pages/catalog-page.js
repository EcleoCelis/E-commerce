(function () {
    function renderShopView() {
        const category = this.state.viewParams.category || this.state.filterState.category;
        const filtered = this.state.products;
        const sortedCategories = [...this.state.categories].sort((a, b) => {
            const countDiff = (Number(b.productCount) || 0) - (Number(a.productCount) || 0);
            if (countDiff !== 0) return countDiff;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
        const totalAvailableItems = this.state.categories.reduce(
            (sum, cat) => sum + (Number(cat.productCount) || 0),
            0
        ) || this.state.products.length;
        const categoryOptions = [{ name: 'All Categories', slug: 'all', productCount: totalAvailableItems }, ...sortedCategories];
        const conditionOptions = [
            { label: 'All Conditions', value: 'all' },
            { label: 'New Other', value: 'new_other' },
            { label: 'Like New', value: 'like_new' },
            { label: 'Good', value: 'good' },
            { label: 'Fair', value: 'fair' },
            { label: 'For Repair', value: 'for_repair' }
        ];
        const sortOptions = [
            { label: 'Featured First', value: 'featured' },
            { label: 'Price: Low to High', value: 'price-low' },
            { label: 'Price: High to Low', value: 'price-high' },
            { label: 'Title: A to Z', value: 'title' }
        ];
        const categoryOptionsHtml = categoryOptions.map((cat) => {
            const isActive = category === cat.slug;
            const displayName = this.formatCategoryLabel
                ? this.formatCategoryLabel(cat.name)
                : String(cat.name || '');
            return `
            <li>
                <button type="button" onclick="app.applyMarketplaceFilters({category: '${cat.slug}'})" class="w-full text-left py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-2 rounded-md hover:bg-[#D7CEC1]/30 transition text-xs flex justify-between items-center gap-2 min-w-0 ${isActive ? 'font-bold text-[#4E4638] bg-[#D7CEC1]/40 border border-[#B9A995]/50' : 'text-[#776B56]'}">
                    <span class="truncate pr-1">${displayName}</span>
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isActive ? 'bg-[#4E4638] text-white' : 'bg-[#FAF8F5] text-[#6E614D] border border-[#D7CEC1]/60'}">${cat.productCount}</span>
                </button>
            </li>
        `;
        }).join('');
        const conditionOptionsHtml = conditionOptions.map((option) => `
            <option value="${option.value}" ${this.state.filterState.condition === option.value ? 'selected' : ''}>${option.label}</option>
        `).join('');
        const sortOptionsHtml = sortOptions.map((option) => `
            <option value="${option.value}" ${this.state.filterState.sortBy === option.value ? 'selected' : ''}>${option.label}</option>
        `).join('');
        const productGrid = filtered.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                ${filtered.map((product) => this.renderProductCard(product)).join('')}
            </div>
        ` : '';
        const emptyState = !this.state.marketplaceLoading && !this.state.marketplaceError && filtered.length === 0 ? `
            <div class="text-center py-16 bg-white rounded-lg border border-[#D7CEC1]/60 shadow-subtle">
                <p class="font-serif text-lg text-[#4E4638]">No secondhand items found in this selection</p>
                <p class="text-xs text-[#776B56] mt-1">Try selecting another category or resetting your active filters.</p>
                <button type="button" onclick="app.resetMarketplaceFilters()" class="btn-outline mt-4 text-xs py-2 px-5">Show All Items</button>
            </div>
        ` : '';
        const productCountLabel = totalAvailableItems > 0
            ? `Showing ${filtered.length} of ${totalAvailableItems} secondhand items`
            : `Showing ${filtered.length} secondhand items`;

        const catalogCap = Number(this.state.catalogMaxPrice) || 50000;
        const activePriceMax = this.state.filterState.priceMax;
        const effectiveSliderValue = activePriceMax === null || activePriceMax === undefined ? catalogCap : Math.min(Number(activePriceMax), catalogCap);
        const priceMaxLabel = activePriceMax === null || activePriceMax === undefined || Number(activePriceMax) >= catalogCap
            ? 'All prices'
            : this.formatPrice(effectiveSliderValue);

        return this.renderPageTemplate('catalog', {
            categoryName: this.categoryName(category),
            productCount: filtered.length,
            productCountLabel,
            sortOptions: sortOptionsHtml,
            searchQuery: this.state.searchQuery,
            clearSearchButton: this.state.searchQuery ? '<button type="button" onclick="app.clearCatalogSearch()" class="btn-outline h-11 px-5 text-xs uppercase tracking-widest whitespace-nowrap">Clear</button>' : '',
            categoryOptions: categoryOptionsHtml,
            catalogMaxPrice: catalogCap,
            priceMax: effectiveSliderValue,
            priceMinLabel: this.formatPrice(0),
            priceMaxLabel,
            conditionOptions: conditionOptionsHtml,
            catalogStatus: this.renderMarketplaceStatus(filtered, 'Marketplace products are loading.'),
            emptyState,
            productGrid,
        });
    }

    window.SecondMarketMarketplacePages = window.SecondMarketMarketplacePages || {};
    window.SecondMarketMarketplacePages.renderShopView = renderShopView;
})();
