(function () {
    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(isoString) {
        if (!isoString) return "";
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } catch (e) {
            return isoString;
        }
    }

    function renderStars(rating) {
        const full = Math.round(Number(rating) || 0);
        let stars = "";
        for (let i = 1; i <= 5; i++) {
            stars += `<span class="${i <= full ? 'text-[#6E614D]' : 'text-[#D7CEC1]'}" aria-hidden="true">★</span>`;
        }
        return `<span class="inline-flex items-center" role="img" aria-label="${full} out of 5 stars">${stars}</span>`;
    }

    function renderBreakdownBars(breakdown, total) {
        breakdown = breakdown || {};
        return [5, 4, 3, 2, 1].map((star) => {
            const count = breakdown[String(star)] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return `
                <div class="flex items-center gap-2 text-xs text-[#776B56]">
                    <span class="w-12 text-left">${star} stars</span>
                    <div class="flex-grow h-2 bg-[#D7CEC1]/40 rounded overflow-hidden">
                        <div class="h-full bg-[#6E614D]" style="width: ${pct}%"></div>
                    </div>
                    <span class="w-8 text-right font-medium">${count}</span>
                </div>
            `;
        }).join("");
    }

    function renderReviewsList(reviews) {
        if (!reviews || reviews.length === 0) {
            return `
                <div class="p-8 bg-[#FAF8F5] rounded border border-[#D7CEC1]/60 text-center">
                    <p class="font-serif text-lg text-[#4E4638]">No reviews yet</p>
                    <p class="text-xs text-[#776B56] mt-1">Verified buyers can review this secondhand item after receiving their delivery.</p>
                </div>
            `;
        }
        return reviews.map((review) => `
            <article class="p-5 bg-white rounded border border-[#D7CEC1]/60 space-y-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-sm">${renderStars(review.rating)}</span>
                        <strong class="text-xs text-[#4E4638]">${escapeHtml(review.title || "Secondhand purchase review")}</strong>
                    </div>
                    <span class="text-[11px] text-[#776B56]">${formatDate(review.created_at)}</span>
                </div>
                ${review.body ? `<p class="text-xs text-[#776B56] leading-relaxed">${escapeHtml(review.body)}</p>` : ""}
                <div class="flex items-center gap-2 text-[11px] text-[#6E614D]">
                    <span>By ${escapeHtml(review.user?.name || "Verified Buyer")}</span>
                    ${review.is_verified_purchase ? `<span class="px-1.5 py-0.5 bg-[#FAF8F5] border border-[#D7CEC1] rounded text-[10px] text-[#3F7A54]">Verified Purchase</span>` : ""}
                </div>
            </article>
        `).join("");
    }

    function renderReportModal(product, isOpen) {
        if (!isOpen) return "";
        return `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E4638]/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
                <div class="bg-white rounded max-w-md w-full p-6 border border-[#D7CEC1] shadow-xl space-y-4">
                    <div class="flex items-center justify-between border-b border-[#D7CEC1] pb-3">
                        <h3 id="report-modal-title" class="font-serif text-lg font-semibold text-[#4E4638]">Report This Listing</h3>
                        <button type="button" onclick="app.closeReportModal()" aria-label="Close report modal" class="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-[#776B56] hover:text-[#4E4638] hover:bg-[#FAF8F5]"><span aria-hidden="true">✕</span></button>
                    </div>
                    <p class="text-xs text-[#776B56]">Help keep SecondMarket safe and trusted. Tell us what is wrong with this listing.</p>
                    <form onsubmit="app.submitProductReport(event, '${escapeHtml(product.slug)}')" class="space-y-4">
                        <div>
                            <label for="report-reason" class="block text-xs font-bold text-[#4E4638] mb-1">Reason for report</label>
                            <select id="report-reason" name="reason" required class="w-full text-xs p-2.5 min-h-[44px] border border-[#D7CEC1] rounded bg-white text-[#4E4638]">
                                <option value="misleading">Misleading listing or photos</option>
                                <option value="inappropriate">Inappropriate content or language</option>
                                <option value="counterfeit">Suspected counterfeit item</option>
                                <option value="wrong_category">Wrong category placement</option>
                                <option value="other">Other issue</option>
                            </select>
                        </div>
                        <div>
                            <label for="report-details" class="block text-xs font-bold text-[#4E4638] mb-1">Additional details (optional)</label>
                            <textarea id="report-details" name="details" rows="3" maxlength="2000" placeholder="Provide extra context to help our moderation team..." class="w-full text-xs p-2.5 border border-[#D7CEC1] rounded text-[#4E4638]"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2">
                            <button type="button" onclick="app.closeReportModal()" class="btn-outline min-h-[44px] sm:min-h-[38px] text-xs px-4 py-2">Cancel</button>
                            <button type="submit" class="btn-primary min-h-[44px] sm:min-h-[38px] text-xs px-4 py-2">Submit Report</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderReviewModal(product, isOpen, eligibility) {
        if (!isOpen) return "";
        return `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E4638]/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
                <div class="bg-white rounded max-w-lg w-full p-6 border border-[#D7CEC1] shadow-xl space-y-4">
                    <div class="flex items-center justify-between border-b border-[#D7CEC1] pb-3">
                        <h3 id="review-modal-title" class="font-serif text-lg font-semibold text-[#4E4638]">Write a Verified Review</h3>
                        <button type="button" onclick="app.closeReviewModal()" aria-label="Close review modal" class="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-[#776B56] hover:text-[#4E4638] hover:bg-[#FAF8F5]"><span aria-hidden="true">✕</span></button>
                    </div>
                    <div class="text-xs text-[#776B56]">
                        <p class="font-semibold text-[#4E4638]">${escapeHtml(product.title)}</p>
                        ${eligibility?.order_number ? `<p class="mt-0.5 text-[#3F7A54]">Verified Purchase Order: ${escapeHtml(eligibility.order_number)}</p>` : ""}
                    </div>
                    <form onsubmit="app.submitReview(event, '${escapeHtml(product.slug)}')" class="space-y-4">
                        ${eligibility?.order_number ? `<input type="hidden" name="order_number" value="${escapeHtml(eligibility.order_number)}">` : ""}
                        <div>
                            <label for="review-rating" class="block text-xs font-bold text-[#4E4638] mb-1">Overall Rating</label>
                            <select id="review-rating" name="rating" required class="w-full text-xs p-2.5 min-h-[44px] border border-[#D7CEC1] rounded bg-white text-[#4E4638]">
                                <option value="5">5 ★ - Excellent / Exceeded expectations</option>
                                <option value="4" selected>4 ★ - Good / Accurately described</option>
                                <option value="3">3 ★ - Average / Acceptable</option>
                                <option value="2">2 ★ - Fair / Some issues</option>
                                <option value="1">1 ★ - Poor / Dissatisfied</option>
                            </select>
                        </div>
                        <div>
                            <label for="review-title" class="block text-xs font-bold text-[#4E4638] mb-1">Review Title</label>
                            <input id="review-title" type="text" name="title" maxlength="140" placeholder="Summary of your secondhand experience" class="w-full text-xs p-2.5 min-h-[44px] border border-[#D7CEC1] rounded text-[#4E4638]">
                        </div>
                        <div>
                            <label for="review-body" class="block text-xs font-bold text-[#4E4638] mb-1">Review Body</label>
                            <textarea id="review-body" name="body" rows="4" maxlength="2000" placeholder="Share item condition, packaging, and performance details..." class="w-full text-xs p-2.5 border border-[#D7CEC1] rounded text-[#4E4638]"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2">
                            <button type="button" onclick="app.closeReviewModal()" class="btn-outline min-h-[44px] sm:min-h-[38px] text-xs px-4 py-2">Cancel</button>
                            <button type="submit" class="btn-primary min-h-[44px] sm:min-h-[38px] text-xs px-4 py-2">Publish Review</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderPDPView(productId) {
        const product = this.getProductById(productId);
        if (this.state.productDetailLoading) {
            return `
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-12" aria-live="polite">
                        <div class="aspect-4/3 rounded skeleton"></div>
                        <div class="space-y-4">
                            <div class="h-4 skeleton rounded w-1/3"></div>
                            <div class="h-10 skeleton rounded"></div>
                            <div class="h-5 skeleton rounded w-1/2"></div>
                            <div class="h-24 skeleton rounded"></div>
                        </div>
                    </div>
                    <p class="sr-only">Product details are loading.</p>
                </div>
            `;
        }
        if (!product) {
            return `
                <div class="max-w-3xl mx-auto px-4 py-16 text-center">
                    <h1 class="font-serif text-3xl font-semibold text-[#4E4638]">Product Not Found</h1>
                    <p class="text-sm text-[#776B56] mt-3">This item may no longer be available.</p>
                    <button onclick="app.navigate('shop')" class="btn-primary mt-6 text-xs uppercase tracking-widest">Back To Catalog</button>
                </div>
            `;
        }

        const activeImage = this.state.pdpImage || product.gallery[0];
        const selectedColor = this.state.pdpColor || product.colors[0];
        const selectedSize = this.state.pdpSize || product.sizes[0];
        const quantitySelected = this.state.pdpQty || 1;
        const galleryButtons = product.gallery.map((image, idx) => `
            <button type="button" onclick="app.state.pdpImage = '${image}'; app.render();" aria-label="View product photo ${idx + 1} of ${product.gallery.length}" aria-pressed="${activeImage === image ? 'true' : 'false'}" class="w-20 h-20 rounded border-2 ${activeImage === image ? 'border-[#6E614D]' : 'border-transparent'} overflow-hidden flex-shrink-0">
                <img src="${image}" class="w-full h-full object-cover" alt="${escapeHtml(product.title)} thumbnail ${idx + 1}">
            </button>
        `).join('');
        const colorButtons = product.colors.map((color) => `
            <button type="button" onclick="app.state.pdpColor = '${color}'; app.render();" aria-pressed="${selectedColor === color ? 'true' : 'false'}" class="px-3 py-1.5 min-h-[44px] sm:min-h-[36px] border text-xs rounded ${selectedColor === color ? 'border-[#6E614D] bg-[#6E614D] text-white font-semibold' : 'border-[#D7CEC1] text-[#4E4638]'}">
                ${color}
            </button>
        `).join('');
        const sizeButtons = product.sizes.map((size) => `
            <button type="button" onclick="app.state.pdpSize = '${size}'; app.render();" aria-pressed="${selectedSize === size ? 'true' : 'false'}" class="px-3 py-1.5 min-h-[44px] sm:min-h-[36px] border text-xs rounded ${selectedSize === size ? 'border-[#6E614D] bg-[#6E614D] text-white font-semibold' : 'border-[#D7CEC1] text-[#4E4638]'}">
                ${size}
            </button>
        `).join('');

        const reviewData = (this.state.productReviews && this.state.productReviews[product.slug]) || {
            reviews: [],
            ratingSummary: product.ratingSummary || { average_rating: product.averageRating || 0, review_count: product.reviewsCount || 0, breakdown: {} },
            eligibility: null
        };
        const ratingSummary = reviewData.ratingSummary || {};
        const avgScore = Number(ratingSummary.average_rating || product.averageRating || 0);
        const reviewCount = Number(ratingSummary.review_count || product.reviewsCount || 0);
        const reviewsCountLabel = reviewCount === 1 ? "1 review" : reviewCount > 0 ? `${reviewCount} reviews` : "No reviews yet";
        const ratingDisplay = reviewCount > 0 ? `${avgScore.toFixed(1)} ★` : "New Listing";
        const averageRatingScore = reviewCount > 0 ? avgScore.toFixed(1) : "0.0";
        const ratingStarsMarkup = renderStars(avgScore);
        const ratingBreakdownBars = renderBreakdownBars(ratingSummary.breakdown, reviewCount);
        const reviewsListMarkup = renderReviewsList(reviewData.reviews);

        let reviewActionContainer = "";
        const isEligible = reviewData.eligibility && reviewData.eligibility.eligible;
        if (this.state.user && this.state.user.role === "buyer") {
            if (isEligible) {
                reviewActionContainer = `
                    <button type="button" onclick="app.openReviewModal('${product.slug}')" class="btn-primary text-xs py-2.5 px-4 uppercase tracking-wider">
                        Write a Review
                    </button>
                `;
            } else if (reviewData.eligibility && reviewData.eligibility.reason) {
                reviewActionContainer = `
                    <span class="text-xs text-[#776B56] italic">${escapeHtml(reviewData.eligibility.reason)}</span>
                `;
            } else {
                reviewActionContainer = `
                    <button type="button" onclick="app.checkEligibilityAndOpenReview('${product.slug}')" class="btn-outline text-xs py-2 px-3">
                        Check Review Eligibility
                    </button>
                `;
            }
        } else {
            reviewActionContainer = `
                <a href="/login.html" class="text-xs text-[#6E614D] underline hover:text-[#4E4638]">
                    Sign in with a buyer account to review
                </a>
            `;
        }

        const isReportOpen = this.state.isReportModalOpen && this.state.reportProductSlug === product.slug;
        const isReviewOpen = this.state.isReviewModalOpen && this.state.reviewProductSlug === product.slug;
        const availabilityBadgeMarkup = `
            <span class="status-badge ${product.inStock ? 'status-badge-available' : 'status-badge-unavailable'}">${product.inStock ? 'Available' : 'Unavailable'}</span>
        `;

        return this.renderPageTemplate('product-detail', {
            categorySlug: product.categorySlug,
            categoryName: product.category,
            title: product.title,
            activeImage,
            galleryButtons,
            price: this.formatPrice(product.price),
            conditionLabel: product.conditionLabel,
            quantity: product.quantity,
            availabilityBadgeMarkup,
            description: product.description,
            selectedColor,
            selectedSize,
            colorButtons,
            sizeButtons,
            quantitySelected,
            productId: product.id,
            lineTotal: this.formatPrice(product.price * quantitySelected),
            material: product.specs.material,
            brand: product.specs.origin,
            dimensions: product.specs.dimensions,
            sellerName: product.seller?.name || 'SecondMarket seller',
            ratingDisplay,
            reviewsCountLabel,
            averageRatingScore,
            ratingStars: ratingStarsMarkup,
            reviewActionContainer,
            ratingBreakdownBars,
            reviewsList: reviewsListMarkup,
            reportModalMarkup: renderReportModal(product, isReportOpen),
            reviewModalMarkup: renderReviewModal(product, isReviewOpen, reviewData.eligibility)
        });
    }

    window.SecondMarketMarketplacePages = window.SecondMarketMarketplacePages || {};
    window.SecondMarketMarketplacePages.renderPDPView = renderPDPView;
})();
