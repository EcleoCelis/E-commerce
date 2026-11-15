(function () {
    function selectFeaturedCategories(categories) {
        const preferredSlugs = ['fashion', 'electronics', 'furniture', 'smartphones', 'books', 'lighting'];
        const sorted = [...(categories || [])].sort((a, b) => {
            const countDiff = (Number(b.productCount) || 0) - (Number(a.productCount) || 0);
            if (countDiff !== 0) return countDiff;
            const aPref = preferredSlugs.indexOf(String(a.slug || '').toLowerCase());
            const bPref = preferredSlugs.indexOf(String(b.slug || '').toLowerCase());
            if (aPref !== -1 || bPref !== -1) {
                return (aPref === -1 ? 999 : aPref) - (bPref === -1 ? 999 : bPref);
            }
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
        return sorted.slice(0, 4);
    }

    function filterHomeProducts(products, activeTab) {
        const list = products || [];
        switch (activeTab) {
            case 'fashion':
                return list.filter((p) => String(p.categorySlug || '').toLowerCase() === 'fashion');
            case 'electronics':
                return list.filter((p) => String(p.categorySlug || '').toLowerCase() === 'electronics');
            case 'like_new':
                return list.filter((p) => p.condition === 'like_new' || p.condition === 'new_other');
            case 'under_1000':
                return list.filter((p) => Number(p.price) <= 1000);
            default:
                return list;
        }
    }

    function renderHeroSpotlight(appInstance) {
        const products = appInstance.state.products || [];
        const item = products.find((p) => p.image && !String(p.image).includes('3794066')) || products[0] || null;

        if (!item) {
            return `
                <button type="button" onclick="app.navigate('shop')" class="group hero-spotlight-card w-full text-left">
                    <img src="/static/productImages/headphones/m502t0016_13june22_headphone_03.jpg" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="Curated secondhand find">
                    <span class="home-category-overlay" aria-hidden="true"></span>
                    <span class="absolute inset-x-0 bottom-0 p-6 text-white flex items-end justify-between gap-4">
                        <span>
                            <span class="block font-serif text-2xl font-medium text-white">Curated Secondhand Finds</span>
                            <span class="block text-xs text-[#D7CEC1] mt-1">Explore inspected pieces ready for a new home</span>
                        </span>
                        <span class="text-sm font-semibold text-white group-hover:translate-x-1 transition" aria-hidden="true">&rarr;</span>
                    </span>
                </button>
            `;
        }

        return `
            <button type="button" onclick="app.navigate('pdp', {id: '${item.id}'})" class="group hero-spotlight-card w-full text-left">
                <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="${item.title}">
                <span class="home-category-overlay" aria-hidden="true"></span>
                <span class="absolute inset-x-0 bottom-0 p-6 text-white flex items-end justify-between gap-4">
                    <span>
                        <span class="block font-serif text-2xl font-medium text-white group-hover:underline">${item.title}</span>
                        <span class="block text-xs text-[#D7CEC1] mt-1">${item.conditionLabel} &bull; ${item.inStock ? `${item.quantity} in stock` : 'Out of stock'}</span>
                    </span>
                    <span class="text-lg font-bold text-white whitespace-nowrap">${appInstance.formatPrice(item.price)}</span>
                </span>
            </button>
        `;
    }

    function renderHomeView() {
        const activeTab = this.state.homeFeaturedTab || 'all';
        const filteredFeatured = filterHomeProducts(this.state.products, activeTab);
        const featuredProducts = filteredFeatured.slice(0, 6);
        const categoryTiles = selectFeaturedCategories(this.state.categories);
        const availableCount = this.state.products.filter((p) => p.inStock).length;
        const activeCategoryCount = this.state.categories.filter((c) => Number(c.productCount) > 0).length || this.state.categories.length;

        const categoryTileHtml = categoryTiles.map((cat, index) => {
            const countLabel = `${cat.productCount} available`;

            return `
                <button type="button" onclick="app.navigate('shop', {category: '${cat.slug}'})" class="group home-category-card w-full text-left">
                    <img src="${this.categoryImage(index, cat.slug, cat.imageUrl)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="${cat.name}">
                    <span class="home-category-overlay" aria-hidden="true"></span>
                    <span class="absolute inset-x-0 bottom-0 p-6 text-white flex flex-col justify-end">
                        <span class="block font-serif text-2xl font-medium text-white">${cat.name}</span>
                        <span class="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-xs text-[#D7CEC1]">
                            <span class="uppercase tracking-wider font-medium group-hover:text-white transition">${countLabel}</span>
                            <span class="transform group-hover:translate-x-1 transition" aria-hidden="true">&rarr;</span>
                        </span>
                    </span>
                </button>
            `;
        }).join('');

        const tabs = [
            { id: 'all', label: `All Finds (${this.state.products.length})` },
            { id: 'fashion', label: 'Fashion' },
            { id: 'electronics', label: 'Electronics' },
            { id: 'like_new', label: 'Like New' },
            { id: 'under_1000', label: 'Under ₱1,000' }
        ];

        const featuredFilterTabsHtml = `
            <div class="home-filter-tabs mb-8" role="tablist" aria-label="Filter featured secondhand finds">
                ${tabs.map((tab) => `
                    <button type="button" role="tab" aria-selected="${activeTab === tab.id}" onclick="app.setHomeFeaturedTab('${tab.id}')" class="home-filter-tab ${activeTab === tab.id ? 'is-active' : ''}">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
        `;

        const featuredProductsHtml = featuredProducts.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                ${featuredProducts.map((product) => this.renderProductCard(product)).join('')}
            </div>
            <div class="mt-10 text-center">
                <button type="button" onclick="app.navigate('shop')" class="btn-outline px-8 py-3 text-xs uppercase tracking-widest">
                    View Full Catalog (${this.state.products.length} Items) &rarr;
                </button>
            </div>
        ` : (!this.state.marketplaceLoading && !this.state.marketplaceError ? `
            <div class="text-center py-12 bg-white rounded-lg border border-[#D7CEC1]/70 shadow-subtle">
                <p class="font-serif text-lg text-[#4E4638]">No items match this quick filter yet</p>
                <p class="text-xs text-[#776B56] mt-1">Switch back to All Finds or explore the full catalog.</p>
                <button type="button" onclick="app.setHomeFeaturedTab('all')" class="btn-outline mt-4 py-2 px-5 text-xs">Show All Featured Finds</button>
            </div>
        ` : '');

        return this.renderPageTemplate('home', {
            heroSpotlight: renderHeroSpotlight(this),
            availableCount: availableCount || this.state.products.length,
            activeCategoryCount,
            categoryTiles: categoryTileHtml,
            featuredFilterTabs: featuredFilterTabsHtml,
            featuredStatus: this.renderMarketplaceStatus(featuredProducts, 'Featured products are loading.'),
            featuredProducts: featuredProductsHtml,
        });
    }

    window.SecondMarketMarketplacePages = window.SecondMarketMarketplacePages || {};
    window.SecondMarketMarketplacePages.renderHomeView = renderHomeView;
})();
