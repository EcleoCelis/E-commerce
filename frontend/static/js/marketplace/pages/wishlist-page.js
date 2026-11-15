(function () {
    function renderWishlistView() {
        const wishlistProductMap = new Map();
        (this.state.wishlistProducts || []).forEach((product) => {
            if (product?.id) wishlistProductMap.set(product.id, product);
        });
        const wishlistedProducts = (this.state.wishlist || [])
            .map((slug) => (
                wishlistProductMap.get(slug)
                || this.state.productDetails?.[slug]
                || (this.state.products || []).find((product) => product.id === slug)
            ))
            .filter(Boolean);
        const emptyState = !this.state.wishlistLoading && !this.state.marketplaceLoading && !this.state.marketplaceError && wishlistedProducts.length === 0 ? `
            <div class="text-center py-16 bg-white rounded border border-[#D7CEC1]">
                <p class="text-sm text-[#776B56]">Your wishlist is currently empty.</p>
            </div>
        ` : '';
        const wishlistGrid = wishlistedProducts.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                ${wishlistedProducts.map((product) => this.renderProductCard(product)).join('')}
            </div>
        ` : '';

        return this.renderPageTemplate('wishlist', {
            wishlistStatus: this.renderMarketplaceStatus(wishlistedProducts, 'Wishlist products are loading.'),
            emptyState,
            wishlistGrid,
        });
    }

    window.SecondMarketMarketplacePages = window.SecondMarketMarketplacePages || {};
    window.SecondMarketMarketplacePages.renderWishlistView = renderWishlistView;
})();
