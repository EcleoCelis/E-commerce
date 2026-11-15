(function () {
    function renderProductCard(product) {
        const isWishlisted = this.state.wishlist.includes(product.id);
        const statusBadgeClass = product.inStock ? 'status-badge-available' : 'status-badge-unavailable';
        const statusLabel = product.inStock ? 'Available' : 'Unavailable';
        const stockQuantityLabel = product.inStock
            ? `${product.quantity} in stock`
            : 'Out of stock';

        return `
            <article class="group marketplace-product-card overflow-hidden flex flex-col justify-between h-full">
                <div class="relative marketplace-card-image overflow-hidden">
                    <img src="${product.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="${product.title}">
                    
                    <!-- Condition / Promotion Badge -->
                    ${product.badge ? `
                        <div class="absolute top-3 left-3">
                            <span class="badge ${product.badge === 'Sale' ? 'badge-sale' : product.badge === 'New' ? 'badge-new' : 'badge-condition'}">${product.badge}</span>
                        </div>
                    ` : ''}

                    <!-- Wishlist Button -->
                    <button type="button" onclick="app.toggleWishlist('${product.id}')" class="absolute top-3 right-3 w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center bg-white/95 hover:bg-white backdrop-blur-sm rounded-full text-[#4E4638] hover:text-[#6E614D] transition shadow-sm" aria-label="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}" aria-pressed="${isWishlisted ? 'true' : 'false'}">
                        <svg class="w-4 h-4 ${isWishlisted ? 'fill-[#6E614D] text-[#6E614D]' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21.364l-7.682-7.682a4.5 4.5 0 010-6.364z"/></svg>
                    </button>

                    <!-- Quick Action Overlay -->
                    <div class="marketplace-card-quick-actions absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#4E4638]/80 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition duration-300 flex gap-2">
                        <button type="button" onclick="app.navigate('pdp', {id: '${product.id}'})" class="btn-primary flex-1 min-h-[44px] sm:min-h-[38px] py-2 text-xs">View Details</button>
                        <button type="button" onclick="app.addToCart('${product.id}')" class="btn-secondary min-h-[44px] sm:min-h-[38px] py-2 px-3.5 text-xs" ${!product.inStock ? 'disabled' : ''}>Add</button>
                    </div>
                </div>

                <!-- Card Body -->
                <div class="p-5 flex flex-col flex-grow justify-between gap-4">
                    <div>
                        <p class="text-[10px] uppercase tracking-widest text-[#6E614D] font-bold">${product.category}</p>
                        <h3 class="marketplace-card-title font-serif text-base text-[#4E4638] font-medium mt-1">
                            <button type="button" onclick="app.navigate('pdp', {id: '${product.id}'})" class="text-left hover:text-[#6E614D] transition cursor-pointer focus-visible:underline">
                                ${product.title}
                            </button>
                        </h3>
                        <p class="text-xs text-[#776B56] mt-1.5 flex items-center gap-1.5">
                            <span class="font-medium text-[#4E4638]">${product.conditionLabel}</span>
                            <span class="text-[#6E614D]" aria-hidden="true">&bull;</span>
                            <span>${stockQuantityLabel}</span>
                        </p>
                    </div>
                    <div class="pt-3.5 border-t border-[#D7CEC1]/50 flex items-center justify-between gap-2">
                        <div class="flex items-baseline gap-2">
                            <span class="text-base font-bold text-[#4E4638]">${this.formatPrice(product.price)}</span>
                            ${product.originalPrice ? `<span class="text-xs text-[#776B56] line-through">${this.formatPrice(product.originalPrice)}</span>` : ''}
                        </div>
                        <span class="status-badge ${statusBadgeClass}">${statusLabel}</span>
                    </div>
                </div>
            </article>
        `;
    }

    window.SecondMarketMarketplaceComponents = window.SecondMarketMarketplaceComponents || {};
    window.SecondMarketMarketplaceComponents.renderProductCard = renderProductCard;
})();
