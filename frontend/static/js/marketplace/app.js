class SecondMarketApp {
            constructor() {
                this.state = {
                    currentView: 'home',
                    viewParams: {},
                    cart: [],
                    wishlist: [],
                    wishlistProducts: [],
                    catalogMaxPrice: 50000,
                    currency: { code: 'PHP', rate: 1, symbol: '₱' },
                    searchQuery: '',
                    filterState: { category: 'all', condition: 'all', priceMax: null, sortBy: 'featured' },
                    categories: [],
                    products: [],
                    searchResults: [],
                    productDetails: {},
                    marketplaceLoading: true,
                    marketplaceError: '',
                    systemInfo: null,
                    systemInfoLoaded: false,
                    searchLoading: false,
                    wishlistLoading: false,
                    productDetailLoading: false,
                    user: null,
                    authMode: 'login',
                    authLoading: false,
                    cartUpdating: false,
                    checkoutStep: 1,
                    quickViewProduct: null,
                    productReviews: {},
                    isReportModalOpen: false,
                    reportProductSlug: null,
                    isReviewModalOpen: false,
                    reviewProductSlug: null,
                    homeFeaturedTab: 'all',
                    heroSpotlightIndex: 0,
                    heroBackgroundIndex: 0,
                    profileTab: 'overview',
                    profileOrderFilter: 'all',
                    profileAddresses: [],
                    profileOrders: [],
                    profileSessions: [],
                    profileStats: null,
                    profileFormDirty: false,
                    profileSaving: false,
                    profileFeedback: null,
                    avatarPreviewUrl: null,
                    avatarPreviewFile: null,
                    avatarPreviewName: '',
                    avatarPreviewSize: '',
                    avatarUploading: false,
                    isAddressFormOpen: false,
                    editingAddress: null,
                    addressSaving: false,
                    paymentPrefsSaving: false,
                    preferencesSaving: false,
                    passwordSaving: false,
                    accountDeactivating: false
                };

                this.heroSlideIntervalMs = 5000;
                this.heroSlideTimer = null;
                this.init();
            }

            init() {
                const path = (window.location.pathname || '').toLowerCase();
                const urlParams = new URLSearchParams(window.location.search || '');
                const requestedView = urlParams.get('view');
                const requestedTab = urlParams.get('tab');
                const requestedId = (urlParams.get('id') || '').trim();
                if (path === '/profile' || path === '/account' || requestedView === 'account' || requestedView === 'profile') {
                    this.state.currentView = 'account';
                } else if (path === '/about' || path === '/about/' || requestedView === 'about') {
                    this.state.currentView = 'about';
                } else if (requestedView === 'pdp' && requestedId) {
                    this.state.currentView = 'pdp';
                    this.state.viewParams = { id: requestedId };
                } else if (requestedView === 'shop' || requestedView === 'catalog' || requestedView === 'wishlist' || requestedView === 'cart') {
                    this.state.currentView = requestedView === 'catalog' ? 'shop' : requestedView;
                }
                if (requestedTab) {
                    this.state.profileTab = requestedTab;
                }
                this.render();
                this.updateCounters();
                this.updateAuthHeader();
                this.setupKeyboardListeners();
                this.loadCurrentUser();
                this.loadMarketplaceData();
                if (this.state.currentView === 'about') {
                    this.loadSystemInfo();
                }
                if (this.state.currentView === 'pdp' && requestedId) {
                    this.loadProductDetail(requestedId);
                }
            }

            async loadMarketplaceData() {
                if (!window.SecondMarketMarketplaceAPI) {
                    this.state.marketplaceLoading = false;
                    this.state.marketplaceError = 'Marketplace client is unavailable.';
                    this.render();
                    return;
                }

                this.state.marketplaceLoading = true;
                this.state.marketplaceError = '';
                this.render();

                try {
                    const [categories, productResult] = await Promise.all([
                        window.SecondMarketMarketplaceAPI.listCategories(),
                        window.SecondMarketMarketplaceAPI.listProducts(this.marketplaceQueryParams())
                    ]);
                    this.state.categories = categories;
                    this.state.products = productResult.products;
                    this.updateCatalogMaxPrice(productResult.products);
                    this.state.marketplaceLoading = false;
                    this.render();
                } catch (error) {
                    this.state.marketplaceLoading = false;
                    this.state.marketplaceError = window.SecondMarketMarketplaceAPI.formatError(error);
                    this.render();
                }
            }

            async refreshMarketplaceProducts() {
                if (!window.SecondMarketMarketplaceAPI) return;

                this.state.marketplaceLoading = true;
                this.state.marketplaceError = '';
                this.render();

                try {
                    const productResult = await window.SecondMarketMarketplaceAPI.listProducts(this.marketplaceQueryParams());
                    this.state.products = productResult.products;
                } catch (error) {
                    this.state.marketplaceError = window.SecondMarketMarketplaceAPI.formatError(error);
                } finally {
                    this.state.marketplaceLoading = false;
                    this.render();
                }
            }

            updateCatalogMaxPrice(products = []) {
                const maxFound = (products || []).reduce((max, item) => Math.max(max, Number(item.price) || 0), 0);
                if (maxFound > 0) {
                    const rounded = Math.max(5000, Math.ceil(maxFound / 1000) * 1000);
                    if (rounded > (Number(this.state.catalogMaxPrice) || 0)) {
                        this.state.catalogMaxPrice = rounded;
                    }
                }
            }

            marketplaceQueryParams(overrides = {}) {
                const category = overrides.category ?? this.state.filterState.category;
                const condition = overrides.condition ?? this.state.filterState.condition;
                const sortBy = overrides.sortBy ?? this.state.filterState.sortBy;
                const priceMax = overrides.priceMax !== undefined ? overrides.priceMax : this.state.filterState.priceMax;
                const searchQuery = overrides.q ?? this.state.searchQuery;
                const sortMap = {
                    featured: 'recent',
                    'price-low': 'price_asc',
                    'price-high': 'price_desc',
                    title: 'title_asc'
                };
                const catalogCap = Number(this.state.catalogMaxPrice) || 50000;
                const hasUpperBound = priceMax !== null && priceMax !== undefined && Number(priceMax) < catalogCap;

                return {
                    q: searchQuery.trim(),
                    category,
                    condition,
                    sort: sortMap[sortBy] || 'recent',
                    max_price_cents: hasUpperBound ? Number(priceMax) * 100 : ''
                };
            }

            applyMarketplaceFilters(nextFilters = {}) {
                this.state.filterState = {
                    ...this.state.filterState,
                    ...nextFilters
                };
                if (Object.prototype.hasOwnProperty.call(nextFilters, 'category')) {
                    this.state.viewParams.category = nextFilters.category;
                }
                this.refreshMarketplaceProducts();
            }

            applyCatalogSearch(event) {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                this.state.searchQuery = (form.get('q') || '').toString();
                this.refreshMarketplaceProducts();
            }

            clearCatalogSearch() {
                this.state.searchQuery = '';
                this.refreshMarketplaceProducts();
            }

            resetMarketplaceFilters() {
                this.state.searchQuery = '';
                this.state.filterState = { category: 'all', condition: 'all', priceMax: null, sortBy: 'featured' };
                this.state.viewParams = {};
                this.refreshMarketplaceProducts();
            }

            async loadProductDetail(productSlug) {
                if (!window.SecondMarketMarketplaceAPI || this.state.productDetails[productSlug]) return;

                this.state.productDetailLoading = true;
                this.render();

                try {
                    const product = await window.SecondMarketMarketplaceAPI.getProduct(productSlug);
                    this.state.productDetails[productSlug] = product;
                    const productIndex = this.state.products.findIndex((item) => item.id === productSlug);
                    if (productIndex > -1) {
                        this.state.products[productIndex] = product;
                    }
                } catch (error) {
                    this.showToast(window.SecondMarketMarketplaceAPI.formatError(error), 'error');
                } finally {
                    this.state.productDetailLoading = false;
                    this.render();
                }
                this.loadProductReviews(productSlug);
            }

            async loadProductReviews(productSlug) {
                if (!window.SecondMarketMarketplaceAPI?.listProductReviews) return;
                try {
                    const result = await window.SecondMarketMarketplaceAPI.listProductReviews(productSlug);
                    this.state.productReviews = this.state.productReviews || {};
                    this.state.productReviews[productSlug] = {
                        ...(this.state.productReviews[productSlug] || {}),
                        reviews: result.reviews,
                        ratingSummary: result.ratingSummary
                    };
                    if (this.state.user && this.state.user.role === 'buyer') {
                        this.fetchReviewEligibility(productSlug);
                    } else {
                        this.render();
                    }
                } catch (error) {
                    console.error('Failed to load reviews:', error);
                }
            }

            async fetchReviewEligibility(productSlug) {
                if (!window.SecondMarketMarketplaceAPI?.checkReviewEligibility) return;
                try {
                    const eligibility = await window.SecondMarketMarketplaceAPI.checkReviewEligibility(productSlug);
                    this.state.productReviews = this.state.productReviews || {};
                    this.state.productReviews[productSlug] = {
                        ...(this.state.productReviews[productSlug] || {}),
                        eligibility
                    };
                    this.render();
                } catch (error) {
                    // silently handle if eligibility check fails
                }
            }

            async checkEligibilityAndOpenReview(productSlug) {
                await this.fetchReviewEligibility(productSlug);
                const reviewData = this.state.productReviews?.[productSlug];
                if (reviewData?.eligibility?.eligible) {
                    this.openReviewModal(productSlug);
                } else if (reviewData?.eligibility?.reason) {
                    this.showToast(reviewData.eligibility.reason, 'info');
                }
            }

            openReviewModal(productSlug) {
                this.state.isReviewModalOpen = true;
                this.state.reviewProductSlug = productSlug;
                this.render();
            }

            closeReviewModal() {
                this.state.isReviewModalOpen = false;
                this.state.reviewProductSlug = null;
                this.render();
            }

            async submitReview(event, productSlug) {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const payload = {
                    rating: parseInt(form.get('rating'), 10),
                    title: (form.get('title') || '').toString().trim(),
                    body: (form.get('body') || '').toString().trim(),
                    order_number: (form.get('order_number') || '').toString().trim() || undefined
                };

                try {
                    await window.SecondMarketMarketplaceAPI.submitReview(productSlug, payload);
                    this.showToast('Your verified review was published.', 'success');
                    this.closeReviewModal();
                    await this.loadProductReviews(productSlug);
                } catch (error) {
                    this.showToast(window.SecondMarketMarketplaceAPI.formatError(error), 'error');
                }
            }

            openReportModal(productSlug) {
                if (!this.state.user) {
                    this.showToast('Please sign in to report a listing.', 'info');
                    window.location.href = '/login.html';
                    return;
                }
                this.state.isReportModalOpen = true;
                this.state.reportProductSlug = productSlug;
                this.render();
            }

            closeReportModal() {
                this.state.isReportModalOpen = false;
                this.state.reportProductSlug = null;
                this.render();
            }

            async submitProductReport(event, productSlug) {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const payload = {
                    reason: (form.get('reason') || '').toString().trim(),
                    details: (form.get('details') || '').toString().trim()
                };

                try {
                    await window.SecondMarketMarketplaceAPI.submitProductReport(productSlug, payload);
                    this.showToast('Listing reported. Thank you for helping keep SecondMarket safe.', 'success');
                    this.closeReportModal();
                } catch (error) {
                    this.showToast(window.SecondMarketMarketplaceAPI.formatError(error), 'error');
                }
            }


            getProductById(productId) {
                return this.state.productDetails[productId] || this.state.products.find((product) => product.id === productId) || null;
            }

            categoryName(categorySlug) {
                if (!categorySlug || categorySlug === 'all') return 'All Secondhand Finds';
                return this.state.categories.find((category) => category.slug === categorySlug)?.name || categorySlug;
            }

            categoryImage(index, categorySlug = '', categoryImageUrl = '') {
                const rawUrl = (categoryImageUrl || '').trim();
                if (rawUrl && (rawUrl.startsWith('/') || /^https?:\/\//i.test(rawUrl))) {
                    return rawUrl;
                }
                const slug = (categorySlug || '').toLowerCase();
                const map = {
                    electronics: '/static/productImages/smartphones/330788-P9NVVS-165.jpg',
                    fashion: '/static/productImages/shirts/men-rsquo-s-black-short-sleeve-shirt-casual-apparel.jpg',
                    books: '/static/productImages/bags/young-girl-with-gray-student-backpack.jpg',
                    furniture: '/static/productImages/sleepware/e2818e87-ffaf-4391-9019-450bf92552af.jpg',
                    smartphones: '/static/productImages/headphones/m502t0016_13june22_headphone_03.jpg',
                    phone: '/static/productImages/smartphones/330788-P9NVVS-165.jpg',
                    cellphone: '/static/productImages/smartphones/330788-P9NVVS-165.jpg',
                    lighting: '/static/productImages/watch/f85e8d4c-ef9a-4b92-9c66-4592728c2e7a.jpg',
                    home: '/static/productImages/sleepware/31427.jpg'
                };
                if (slug && map[slug]) return map[slug];

                const images = [
                    '/static/productImages/smartphones/330788-P9NVVS-165.jpg',
                    '/static/productImages/shirts/men-rsquo-s-black-short-sleeve-shirt-casual-apparel.jpg',
                    '/static/productImages/headphones/m502t0016_13june22_headphone_03.jpg',
                    '/static/productImages/shoe/shoes-sand.jpg',
                    '/static/productImages/bags/young-girl-with-gray-student-backpack.jpg',
                    '/static/productImages/watch/f85e8d4c-ef9a-4b92-9c66-4592728c2e7a.jpg'
                ];
                return images[Math.abs(index) % images.length];
            }

            setHomeFeaturedTab(tab) {
                this.state.homeFeaturedTab = tab || 'all';
                this.render();
            }

            setHeroSpotlightIndex(index) {
                const count = Math.max(1, Math.min(this.state.products.length, 5));
                this.state.heroSpotlightIndex = ((Number(index) || 0) % count + count) % count;
                this.render();
            }

            stepHeroSpotlight(delta) {
                const count = Math.max(1, Math.min(this.state.products.length, 5));
                const current = Number(this.state.heroSpotlightIndex) || 0;
                this.state.heroSpotlightIndex = (current + delta + count) % count;
                this.render();
            }

            async handleHeroSearch(event) {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const query = (formData.get('q') || '').toString().trim();
                this.state.searchQuery = query;
                this.state.currentView = 'shop';
                this.state.viewParams = {};
                await this.refreshMarketplaceProducts();
            }

            async quickShopFilter(filters = {}) {
                this.state.filterState = {
                    category: 'all',
                    condition: 'all',
                    priceMax: null,
                    sortBy: 'featured',
                    ...filters
                };
                this.state.currentView = 'shop';
                this.state.viewParams = filters.category && filters.category !== 'all' ? { category: filters.category } : {};
                window.scrollTo({ top: 0, behavior: 'smooth' });
                await this.refreshMarketplaceProducts();
            }

            renderMarketplaceStatus(products, loadingMessage) {
                if (this.state.marketplaceLoading) {
                    return `
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-live="polite">
                            ${[1, 2, 3].map(() => `
                                <div class="bg-white border border-[#D7CEC1]/60 rounded overflow-hidden">
                                    <div class="h-56 skeleton"></div>
                                    <div class="p-5 space-y-3">
                                        <div class="h-3 skeleton rounded"></div>
                                        <div class="h-5 skeleton rounded"></div>
                                        <div class="h-3 skeleton rounded w-1/2"></div>
                                    </div>
                                </div>
                            `).join('')}
                            <p class="sr-only">${loadingMessage}</p>
                        </div>
                    `;
                }

                if (this.state.marketplaceError) {
                    return `
                        <div class="text-center py-12 bg-white rounded border border-[#D7CEC1]/50">
                            <p class="text-sm text-[#776B56]">${this.state.marketplaceError}</p>
                            <button onclick="app.loadMarketplaceData()" class="btn-outline mt-4 text-xs py-2">Try Again</button>
                        </div>
                    `;
                }

                if (!products.length && this.state.products.length === 0) {
                    return `
                        <div class="text-center py-12 bg-white rounded border border-[#D7CEC1]/50">
                            <p class="text-sm text-[#776B56]">No products are available right now.</p>
                        </div>
                    `;
                }

                return '';
            }

            loadPageTemplate(templateName) {
                this.templateCache = this.templateCache || {};
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
                request.open('GET', `/marketplace/pages/${templateName}.html`, false);
                request.send(null);

                if (request.status < 200 || request.status >= 300) {
                    return `
                        <section class="max-w-3xl mx-auto px-4 py-16 text-center">
                            <h1 class="font-serif text-3xl font-semibold text-[#4E4638]">Page Template Missing</h1>
                            <p class="text-sm text-[#776B56] mt-3">${templateName} could not be loaded.</p>
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
                    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value ?? ''),
                    this.loadPageTemplate(templateName)
                );
            }

            normalizeApiUser(user) {
                if (!user) return null;

                return {
                    id: user.id,
                    name: `${user.first_name} ${user.last_name}`.trim(),
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    phone: user.phone || 'Not provided',
                    role: user.role,
                    status: user.status,
                    avatarUrl: user.avatar_url || null,
                    emailVerified: user.email_verified !== false,
                    themePreference: user.theme_preference || 'light',
                    preferredPaymentMethod: user.preferred_payment_method || 'cash_on_delivery',
                    paymentPreferences: user.payment_preferences || {
                        enabled_methods: ['cash_on_delivery', 'gcash_pending', 'credit_debit_card'],
                        gcash_mobile: null
                    },
                    notificationPreferences: user.notification_preferences || {
                        order_updates: true,
                        shipping_alerts: true,
                        promotional_emails: false,
                        security_alerts: true
                    },
                    createdAt: user.created_at || null,
                    updatedAt: user.updated_at || null,
                    addresses: this.state.profileAddresses || [],
                    orders: this.state.profileOrders || []
                };
            }

            async loadCurrentUser() {
                if (!window.SecondMarketAuthAPI) {
                    this.updateAuthHeader();
                    return;
                }

                try {
                    const payload = await window.SecondMarketAuthAPI.me();
                    this.state.user = payload.data.authenticated ? this.normalizeApiUser(payload.data.user) : null;
                    if (this.state.user && window.SecondMarketTheme) {
                        window.SecondMarketTheme.syncFromUser(payload.data.user);
                    }
                    const nextView = sessionStorage.getItem('secondmarket:nextView');
                    if (this.state.user && nextView) {
                        sessionStorage.removeItem('secondmarket:nextView');
                        this.navigate(nextView);
                        this.loadWishlist();
                        this.loadProfileSummary();
                        this.updateAuthHeader();
                        return;
                    }
                    if (this.state.currentView === 'account' || this.state.currentView === 'auth') {
                        this.render();
                    }
                    if (this.state.user) {
                        this.loadWishlist();
                        this.loadCart();
                        this.loadProfileSummary();
                    }
                } catch (error) {
                    this.state.user = null;
                } finally {
                    this.updateAuthHeader();
                }
            }

            async loadProfileSummary() {
                if (!this.state.user || !window.SecondMarketAuthAPI?.getProfileSummary) return;

                try {
                    const payload = await window.SecondMarketAuthAPI.getProfileSummary();
                    const summary = payload?.data;
                    if (!summary) return;

                    this.state.profileAddresses = summary.addresses || [];
                    this.state.profileSessions = summary.active_sessions || [];
                    this.state.profileStats = summary.stats || null;
                    if (summary.user) {
                        this.state.user = this.normalizeApiUser(summary.user);
                    }
                    if (window.SecondMarketAuthAPI.listBuyerOrders) {
                        try {
                            const fullOrders = await window.SecondMarketAuthAPI.listBuyerOrders();
                            this.state.profileOrders = fullOrders.length ? fullOrders : (summary.recent_orders || []);
                        } catch (err) {
                            this.state.profileOrders = summary.recent_orders || [];
                        }
                    } else {
                        this.state.profileOrders = summary.recent_orders || [];
                    }
                    if (this.state.user) {
                        this.state.user.addresses = this.state.profileAddresses;
                        this.state.user.orders = this.state.profileOrders;
                    }
                    this.updateAuthHeader();
                    if (this.state.currentView === 'account') {
                        this.render();
                    }
                } catch (error) {
                    // Fail gracefully if summary endpoint is temporarily unreachable
                }
            }

            setProfileTab(tabName) {
                this.state.profileTab = tabName || 'overview';
                this.state.profileFeedback = null;
                this.render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            setProfileOrderFilter(filterName) {
                this.state.profileOrderFilter = filterName || 'all';
                this.render();
            }

            markProfileFormDirty() {
                if (!this.state.profileFormDirty) {
                    this.state.profileFormDirty = true;
                }
            }

            clearProfileFeedback() {
                this.state.profileFeedback = null;
                this.render();
            }

            resetPersonalInfoForm() {
                this.state.profileFormDirty = false;
                this.state.profileFeedback = null;
                this.render();
            }

            async handleSavePersonalInfo(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI?.updateProfile) return;

                const form = new FormData(event.currentTarget);
                const firstName = (form.get('first_name') || '').toString().trim();
                const lastName = (form.get('last_name') || '').toString().trim();
                const email = (form.get('email') || '').toString().trim().toLowerCase();
                const phone = (form.get('phone') || '').toString().trim();

                if (!firstName || !lastName) {
                    this.state.profileFeedback = { type: 'error', message: 'First name and last name are required.' };
                    this.render();
                    return;
                }

                if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    this.state.profileFeedback = { type: 'error', message: 'Please enter a valid email address.' };
                    this.render();
                    return;
                }

                if (phone) {
                    const digits = phone.replace(/\D/g, '');
                    if (!/^[0-9+\-\s()]{7,25}$/.test(phone) || digits.length < 7 || digits.length > 15) {
                        this.state.profileFeedback = { type: 'error', message: 'Enter a valid mobile or contact number (7 to 15 digits).' };
                        this.render();
                        return;
                    }
                }

                this.state.profileSaving = true;
                this.state.profileFeedback = null;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.updateProfile({
                        first_name: firstName,
                        last_name: lastName,
                        email,
                        phone: phone || null
                    });
                    this.state.user = this.normalizeApiUser(payload.data);
                    this.state.profileFormDirty = false;
                    this.state.profileFeedback = { type: 'success', message: 'Your personal information has been saved.' };
                    this.updateAuthHeader();
                    this.showToast('Personal information updated.');
                } catch (error) {
                    const message = window.SecondMarketAuthAPI.formatError(error);
                    this.state.profileFeedback = { type: 'error', message };
                    this.showToast(message, 'error');
                } finally {
                    this.state.profileSaving = false;
                    this.render();
                }
            }

            handleAvatarFileSelect(event) {
                const file = event.target?.files?.[0];
                if (!file) return;

                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
                const ext = (file.name.split('.').pop() || '').toLowerCase();
                const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

                if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
                    this.showToast('Please select a JPEG, PNG, WebP, or GIF image file.', 'error');
                    event.target.value = '';
                    return;
                }

                const maxSizeBytes = 30 * 1024 * 1024;
                if (file.size > maxSizeBytes) {
                    this.showToast('Profile picture must be 30 MB or smaller.', 'error');
                    event.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                    this.state.avatarPreviewUrl = reader.result;
                    this.state.avatarPreviewFile = file;
                    this.state.avatarPreviewName = file.name;
                    this.state.avatarPreviewSize = `${Math.max(1, Math.round(file.size / 1024))} KB`;
                    this.render();
                };
                reader.readAsDataURL(file);
            }

            cancelAvatarPreview() {
                this.state.avatarPreviewUrl = null;
                this.state.avatarPreviewFile = null;
                this.state.avatarPreviewName = '';
                this.state.avatarPreviewSize = '';
                this.render();
            }

            async saveAvatarUpload() {
                if (!this.state.avatarPreviewFile || !window.SecondMarketAuthAPI?.uploadAvatar) return;

                this.state.avatarUploading = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.uploadAvatar(this.state.avatarPreviewFile);
                    if (payload?.data?.user) {
                        this.state.user = this.normalizeApiUser(payload.data.user);
                    }
                    this.state.avatarPreviewUrl = null;
                    this.state.avatarPreviewFile = null;
                    this.state.avatarPreviewName = '';
                    this.state.avatarPreviewSize = '';
                    this.state.profileFeedback = { type: 'success', message: 'Profile picture uploaded and saved.' };
                    this.updateAuthHeader();
                    this.showToast('Profile picture updated.');
                } catch (error) {
                    const message = window.SecondMarketAuthAPI.formatError(error);
                    this.state.profileFeedback = { type: 'error', message };
                    this.showToast(message, 'error');
                } finally {
                    this.state.avatarUploading = false;
                    this.render();
                }
            }

            async handleRemoveAvatar() {
                if (!window.SecondMarketAuthAPI?.removeAvatar) return;

                this.state.avatarUploading = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.removeAvatar();
                    if (payload?.data?.user) {
                        this.state.user = this.normalizeApiUser(payload.data.user);
                    }
                    this.state.avatarPreviewUrl = null;
                    this.state.avatarPreviewFile = null;
                    this.state.avatarPreviewName = '';
                    this.state.avatarPreviewSize = '';
                    this.state.profileFeedback = { type: 'success', message: 'Profile picture removed and default avatar restored.' };
                    this.updateAuthHeader();
                    this.showToast('Default avatar restored.', 'info');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.avatarUploading = false;
                    this.render();
                }
            }

            openAddressForm(addressId = null) {
                this.state.profileTab = 'addresses';
                this.state.isAddressFormOpen = true;
                if (addressId !== null && addressId !== undefined) {
                    const found = (this.state.profileAddresses || []).find((a) => Number(a.id) === Number(addressId));
                    this.state.editingAddress = found ? { ...found } : null;
                } else {
                    this.state.editingAddress = null;
                }
                this.render();
            }

            closeAddressForm() {
                this.state.isAddressFormOpen = false;
                this.state.editingAddress = null;
                this.render();
            }

            async handleSaveAddress(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI) return;

                const form = new FormData(event.currentTarget);
                const addressId = (form.get('address_id') || '').toString().trim();
                const payload = {
                    label: (form.get('label') || 'Home').toString().trim(),
                    recipient_name: (form.get('recipient_name') || '').toString().trim(),
                    phone: (form.get('phone') || '').toString().trim(),
                    street_line1: (form.get('street_line1') || '').toString().trim(),
                    street_line2: (form.get('street_line2') || '').toString().trim() || null,
                    city: (form.get('city') || '').toString().trim(),
                    state_or_province: (form.get('state_or_province') || '').toString().trim(),
                    postal_code: (form.get('postal_code') || '').toString().trim(),
                    country: 'Philippines',
                    delivery_instructions: (form.get('delivery_instructions') || '').toString().trim() || null,
                    is_default: form.get('is_default') === 'on'
                };

                this.state.addressSaving = true;
                this.render();

                try {
                    if (addressId) {
                        await window.SecondMarketAuthAPI.updateAddress(addressId, payload);
                        this.showToast('Delivery address updated.');
                    } else {
                        await window.SecondMarketAuthAPI.createAddress(payload);
                        this.showToast('New delivery address saved.');
                    }
                    this.state.isAddressFormOpen = false;
                    this.state.editingAddress = null;
                    this.state.profileAddresses = await window.SecondMarketAuthAPI.listAddresses();
                    if (this.state.user) {
                        this.state.user.addresses = this.state.profileAddresses;
                    }
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.addressSaving = false;
                    this.render();
                }
            }

            async handleDeleteAddress(addressId) {
                if (!window.SecondMarketAuthAPI?.deleteAddress) return;

                try {
                    await window.SecondMarketAuthAPI.deleteAddress(addressId);
                    this.state.profileAddresses = await window.SecondMarketAuthAPI.listAddresses();
                    if (this.state.user) {
                        this.state.user.addresses = this.state.profileAddresses;
                    }
                    this.showToast('Delivery address deleted.', 'info');
                    this.render();
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                }
            }

            async handleSetDefaultAddress(addressId) {
                if (!window.SecondMarketAuthAPI?.setDefaultAddress) return;

                try {
                    await window.SecondMarketAuthAPI.setDefaultAddress(addressId);
                    this.state.profileAddresses = await window.SecondMarketAuthAPI.listAddresses();
                    if (this.state.user) {
                        this.state.user.addresses = this.state.profileAddresses;
                    }
                    this.showToast('Default delivery address updated.');
                    this.render();
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                }
            }

            async handleSavePaymentPreferences(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI?.updatePaymentPreferences) return;

                const form = new FormData(event.currentTarget);
                const preferred = (form.get('preferred_payment_method') || 'cash_on_delivery').toString();
                const enabledMethods = [];
                if (form.get('enabled_cash_on_delivery') === 'on') {
                    enabledMethods.push('cash_on_delivery');
                }
                if (form.get('enabled_gcash_pending') === 'on') {
                    enabledMethods.push('gcash_pending');
                }
                if (form.get('enabled_credit_debit_card') === 'on') {
                    enabledMethods.push('credit_debit_card');
                }
                if (!enabledMethods.includes(preferred)) {
                    enabledMethods.push(preferred);
                }

                const gcashMobile = (form.get('gcash_mobile') || '').toString().trim() || null;

                this.state.paymentPrefsSaving = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.updatePaymentPreferences({
                        preferred_payment_method: preferred,
                        enabled_methods: enabledMethods,
                        gcash_mobile: gcashMobile
                    });
                    if (payload?.data?.user) {
                        this.state.user = this.normalizeApiUser(payload.data.user);
                    }
                    this.showToast('Payment preferences saved and synced with checkout.');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.paymentPrefsSaving = false;
                    this.render();
                }
            }

            async handleThemeChange(themePreference) {
                if (window.SecondMarketTheme) {
                    window.SecondMarketTheme.setPreference(themePreference, true);
                }
                if (this.state.user) {
                    this.state.user.themePreference = themePreference;
                    this.state.user.theme_preference = themePreference;
                }
                this.render();

                if (this.state.user && window.SecondMarketAuthAPI?.updateProfile) {
                    try {
                        const payload = await window.SecondMarketAuthAPI.updateProfile({
                            theme_preference: themePreference
                        });
                        this.state.user = this.normalizeApiUser(payload.data);
                        this.showToast(`Appearance set to ${themePreference} mode.`);
                    } catch (error) {
                        this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                    }
                }
            }

            async handleSaveNotificationPreferences(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI?.updateProfile) return;

                const form = new FormData(event.currentTarget);
                const notificationPreferences = {
                    order_updates: form.get('order_updates') === 'on',
                    shipping_alerts: form.get('shipping_alerts') === 'on',
                    promotional_emails: form.get('promotional_emails') === 'on',
                    security_alerts: true
                };

                this.state.preferencesSaving = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.updateProfile({
                        notification_preferences: notificationPreferences
                    });
                    this.state.user = this.normalizeApiUser(payload.data);
                    this.showToast('Notification preferences saved.');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.preferencesSaving = false;
                    this.render();
                }
            }

            async handleChangePassword(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI?.changePassword) return;

                const formEl = event.currentTarget;
                const form = new FormData(formEl);
                const currentPassword = (form.get('current_password') || '').toString();
                const newPassword = (form.get('new_password') || '').toString();
                const confirmPassword = (form.get('confirm_password') || '').toString();

                if (newPassword !== confirmPassword) {
                    this.showToast('New password and confirmation do not match.', 'error');
                    return;
                }

                this.state.passwordSaving = true;
                this.render();

                try {
                    await window.SecondMarketAuthAPI.changePassword({
                        current_password: currentPassword,
                        new_password: newPassword,
                        confirm_password: confirmPassword
                    });
                    this.showToast('Password updated. Other active sessions have been signed out.');
                    await this.loadProfileSummary();
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.passwordSaving = false;
                    this.render();
                }
            }

            async handleRevokeOtherSessions() {
                if (!window.SecondMarketAuthAPI?.revokeOtherSessions) return;

                try {
                    const payload = await window.SecondMarketAuthAPI.revokeOtherSessions();
                    this.state.profileSessions = payload?.data?.sessions || [];
                    this.showToast(payload?.message || 'Other sessions signed out.');
                    this.render();
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                }
            }

            async handleRevokeSession(sessionId) {
                if (!window.SecondMarketAuthAPI?.revokeSession) return;

                try {
                    await window.SecondMarketAuthAPI.revokeSession(sessionId);
                    await this.loadProfileSummary();
                    this.showToast('Session revoked.');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                }
            }

            async handleDeactivateAccount(event) {
                event.preventDefault();
                if (!window.SecondMarketAuthAPI?.deactivateAccount) return;

                const form = new FormData(event.currentTarget);
                const password = (form.get('password') || '').toString();

                this.state.accountDeactivating = true;
                this.render();

                try {
                    await window.SecondMarketAuthAPI.deactivateAccount({ password });
                    this.state.user = null;
                    this.state.wishlist = [];
                    this.state.wishlistProducts = [];
                    this.state.profileAddresses = [];
                    this.state.profileOrders = [];
                    this.state.profileSessions = [];
                    this.updateAuthHeader();
                    this.showToast('Your account has been deactivated.', 'info');
                    this.navigate('home');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                } finally {
                    this.state.accountDeactivating = false;
                    this.render();
                }
            }

            normalizeCartItem(item) {
                return {
                    product: {
                        id: item.product.slug,
                        title: item.product.title,
                        price: item.unit_price.amount,
                        image: item.product.primary_image?.url || '/static/productImages/bags/young-girl-with-gray-student-backpack.jpg',
                        imageAlt: item.product.primary_image?.alt_text || item.product.title,
                        condition: item.product.condition,
                        category: item.product.category?.name || 'Secondhand item',
                    },
                    quantity: item.quantity,
                    maxQuantity: item.max_quantity,
                };
            }

            syncCartFromApi(cart) {
                this.state.cart = (cart?.items || []).map((item) => this.normalizeCartItem(item));
                this.updateCounters();
                if (!document.getElementById('cart-drawer')?.classList.contains('translate-x-full')) {
                    this.renderCartDrawer();
                }
            }

            async loadCart() {
                if (!this.state.user || !window.SecondMarketCheckoutAPI) return;

                try {
                    const cart = await window.SecondMarketCheckoutAPI.getCart();
                    this.syncCartFromApi(cart);
                } catch (error) {
                    this.showToast(window.SecondMarketCheckoutAPI.formatError(error), 'error');
                }
            }

            async loadWishlist() {
                if (!this.state.user || !window.SecondMarketMarketplaceAPI) return;

                this.state.wishlistLoading = true;
                try {
                    const wishlist = await window.SecondMarketMarketplaceAPI.listWishlist();
                    this.state.wishlist = wishlist.slugs;
                    this.state.wishlistProducts = wishlist.products || [];
                    wishlist.products.forEach((product) => {
                        this.state.productDetails[product.id] = product;
                    });
                    this.updateCounters();
                    if (this.state.currentView === 'wishlist') {
                        this.render();
                    }
                } catch (error) {
                    this.showToast(window.SecondMarketMarketplaceAPI.formatError(error), 'error');
                } finally {
                    this.state.wishlistLoading = false;
                }
            }

            formatPrice(priceAmount) {
                const converted = priceAmount * this.state.currency.rate;
                return `${this.state.currency.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            }

            setCurrency(code, rate, symbol) {
                this.state.currency = { code, rate, symbol };
                document.getElementById('current-currency').textContent = `${code} (${symbol})`;
                this.render();
                this.showToast(`Currency changed to ${code}`, 'info');
            }

            updateCounters() {
                const cartCount = this.state.cart.reduce((acc, item) => acc + item.quantity, 0);
                document.getElementById('cart-counter').textContent = cartCount;
                document.getElementById('drawer-cart-count').textContent = `(${cartCount} ${cartCount === 1 ? 'item' : 'items'})`;
                document.getElementById('wishlist-counter').textContent = this.state.wishlist.length;
            }

            showToast(message, type = 'success') {
                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');
                toast.className = `p-4 rounded shadow-lg bg-[#4E4638] text-white text-xs flex items-center justify-between gap-3 fade-in border-l-4 ${type === 'error' ? 'border-red-500' : 'border-[#9A8B74]'} pointer-events-auto`;
                toast.innerHTML = `
                    <span>${message}</span>
                    <button onclick="this.parentElement.remove()" class="text-[#B9A995] hover:text-white">&times;</button>
                `;
                container.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            }

            navigate(viewName, params = {}) {
                this.state.currentView = viewName;
                this.state.viewParams = params;
                if (viewName === 'shop') {
                    this.state.filterState.category = params.category || 'all';
                    this.refreshMarketplaceProducts();
                }
                if (viewName === 'pdp' && params.id) {
                    this.state.pdpImage = null;
                    this.state.pdpColor = null;
                    this.state.pdpSize = null;
                    this.loadProductDetail(params.id);
                }
                if (viewName === 'account') {
                    if (params.tab) {
                        this.state.profileTab = params.tab;
                    }
                    this.loadProfileSummary();
                }
                if (viewName === 'about') {
                    this.loadSystemInfo();
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.render();
            }

            async loadSystemInfo() {
                if (this.state.systemInfoLoaded) return;
                this.state.systemInfoLoaded = true;
                try {
                    const response = await fetch('/api/v1/system/info', { credentials: 'same-origin' });
                    if (!response.ok) return;
                    const payload = await response.json();
                    if (payload && payload.data) {
                        this.state.systemInfo = payload.data;
                        if (this.state.currentView === 'about') {
                            this.render();
                        }
                    }
                } catch (_error) {
                    // Fallback metadata defaults render automatically in About view.
                }
            }

            setAuthMode(mode) {
                this.state.authMode = mode;
                this.render();
            }

            async handleLogin(event) {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                this.state.authLoading = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.login({
                        email: form.get('email'),
                        password: form.get('password')
                    });
                    this.state.user = this.normalizeApiUser(payload.data.user);
                    this.state.authLoading = false;
                    await this.loadWishlist();
                    this.showToast('You are now signed in.');
                    this.navigate('account');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                    this.state.authLoading = false;
                    this.render();
                }
            }

            async handleRegister(event) {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                this.state.authLoading = true;
                this.render();

                try {
                    const payload = await window.SecondMarketAuthAPI.register({
                        email: form.get('email'),
                        password: form.get('password'),
                        first_name: form.get('first_name'),
                        last_name: form.get('last_name'),
                        role: 'buyer',
                        phone: form.get('phone')
                    });
                    this.state.user = this.normalizeApiUser(payload.data.user);
                    this.state.authLoading = false;
                    await this.loadWishlist();
                    this.showToast('Your buyer account is ready.');
                    this.navigate('account');
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                    this.state.authLoading = false;
                    this.render();
                }
            }

            async handleLogout() {
                try {
                    await window.SecondMarketAuthAPI.logout();
                } catch (error) {
                    this.showToast(window.SecondMarketAuthAPI.formatError(error), 'error');
                }

                this.state.user = null;
                this.state.wishlist = [];
                this.updateAuthHeader();
                this.showToast('You have been signed out.', 'info');
                this.navigate('auth');
            }

            setOverlayState(el, isOpen) {
                if (!el) return;
                el.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                if ('inert' in el) {
                    el.inert = !isOpen;
                }
            }

            restoreFocus() {
                if (this._lastFocusedEl && typeof this._lastFocusedEl.focus === 'function' && document.contains(this._lastFocusedEl)) {
                    this._lastFocusedEl.focus();
                }
                this._lastFocusedEl = null;
            }

            async toggleCartDrawer() {
                const drawer = document.getElementById('cart-drawer');
                const backdrop = document.getElementById('cart-drawer-backdrop');
                if (!drawer || !backdrop) return;
                const isOpen = !drawer.classList.contains('translate-x-full');
                
                if (isOpen) {
                    drawer.classList.add('translate-x-full');
                    backdrop.classList.add('hidden');
                    this.setOverlayState(drawer, false);
                    this.restoreFocus();
                } else {
                    this._lastFocusedEl = document.activeElement;
                    await this.loadCart();
                    this.renderCartDrawer();
                    drawer.classList.remove('translate-x-full');
                    backdrop.classList.remove('hidden');
                    this.setOverlayState(drawer, true);
                    const focusTarget = drawer.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
                    if (focusTarget) focusTarget.focus();
                }
            }

            toggleMobileMenu() {
                const menu = document.getElementById('mobile-menu');
                const backdrop = document.getElementById('mobile-menu-backdrop');
                if (!menu || !backdrop) return;
                const isOpen = !menu.classList.contains('-translate-x-full');
                const menuBtn = document.querySelector('[aria-controls="mobile-menu"]');
                
                if (isOpen) {
                    menu.classList.add('-translate-x-full');
                    backdrop.classList.add('hidden');
                    this.setOverlayState(menu, false);
                    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
                    this.restoreFocus();
                } else {
                    this._lastFocusedEl = document.activeElement;
                    menu.classList.remove('-translate-x-full');
                    backdrop.classList.remove('hidden');
                    this.setOverlayState(menu, true);
                    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
                    const focusTarget = menu.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])');
                    if (focusTarget) focusTarget.focus();
                }
            }

            toggleSearchModal() {
                const modal = document.getElementById('search-modal');
                if (!modal) return;
                const isOpening = modal.classList.contains('hidden');
                modal.classList.toggle('hidden');
                this.setOverlayState(modal, isOpening);
                if (isOpening) {
                    this._lastFocusedEl = document.activeElement;
                    const input = document.getElementById('search-input');
                    if (input) input.focus();
                } else {
                    this.restoreFocus();
                }
            }

            async handleSearchInput(query) {
                const container = document.getElementById('search-results');
                if (!query.trim()) {
                    container.innerHTML = '<p class="text-xs text-[#776B56] italic">Start typing to see live inventory results...</p>';
                    return;
                }

                container.innerHTML = '<p class="text-xs text-[#776B56] italic">Searching marketplace inventory...</p>';

                try {
                    const result = await window.SecondMarketMarketplaceAPI.listProducts({ q: query.trim(), sort: 'recent' });
                    this.state.searchResults = result.products;
                } catch (error) {
                    container.innerHTML = `<p class="text-xs text-[#776B56]">${window.SecondMarketMarketplaceAPI.formatError(error)}</p>`;
                    return;
                }

                if (this.state.searchResults.length === 0) {
                    container.innerHTML = '<p class="text-xs text-[#776B56]">No matching products found in marketplace inventory.</p>';
                    return;
                }

                container.innerHTML = this.state.searchResults.map(p => `
                    <button type="button" onclick="app.toggleSearchModal(); app.navigate('pdp', {id: '${p.id}'})" class="w-full text-left flex items-center gap-4 p-2.5 min-h-[44px] hover:bg-[#D7CEC1]/30 rounded cursor-pointer transition">
                        <img src="${p.image}" class="w-12 h-12 object-cover rounded flex-shrink-0" alt="${this.escapeAttribute(p.title)}">
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-[#4E4638] truncate">${this.escapeHtml(p.title)}</p>
                            <p class="text-xs text-[#776B56] truncate">${this.escapeHtml(p.category)} | ${this.formatPrice(p.price)}</p>
                        </div>
                    </button>
                `).join('');
            }

            quickSearch(term) {
                document.getElementById('search-input').value = term;
                this.handleSearchInput(term);
            }

            setupKeyboardListeners() {
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        const searchModal = document.getElementById('search-modal');
                        if (searchModal && !searchModal.classList.contains('hidden')) {
                            this.toggleSearchModal();
                        }
                        const cartDrawer = document.getElementById('cart-drawer');
                        if (cartDrawer && !cartDrawer.classList.contains('translate-x-full')) {
                            this.toggleCartDrawer();
                        }
                        const mobileMenu = document.getElementById('mobile-menu');
                        if (mobileMenu && !mobileMenu.classList.contains('-translate-x-full')) {
                            this.toggleMobileMenu();
                        }
                        const infoModal = document.getElementById('info-modal');
                        if (infoModal && !infoModal.classList.contains('hidden')) {
                            this.closeInfoModal();
                        }
                    }
                });
            }

            async addToCart(productId, selectedColor = null, selectedSize = null, quantity = 1) {
                const product = this.getProductById(productId);
                if (!product || !product.inStock) {
                    this.showToast('Sorry, this product is currently out of stock.', 'error');
                    return;
                }

                if (!this.state.user) {
                    const nextUrl = `${window.location.pathname}${window.location.search}`;
                    this.showToast('Please sign in as a buyer to save items to your cart.', 'info');
                    window.location.href = `/login.html?next=${encodeURIComponent(nextUrl)}`;
                    return;
                }

                if (!window.SecondMarketCheckoutAPI) {
                    this.showToast('Cart service is temporarily unavailable.', 'error');
                    return;
                }

                if (this.state.cartUpdating) return;
                this.state.cartUpdating = true;
                try {
                    const cart = await window.SecondMarketCheckoutAPI.addItem(product.slug || product.id, quantity);
                    this.syncCartFromApi(cart);
                    this.showToast(`Added ${product.title} to your bag.`);
                    this.toggleCartDrawer();
                } catch (error) {
                    this.showToast(window.SecondMarketCheckoutAPI.formatError(error), 'error');
                } finally {
                    this.state.cartUpdating = false;
                }
            }

            async updateCartQuantity(index, newQty) {
                if (this.state.cartUpdating) return;
                const item = this.state.cart[index];
                if (!item || !window.SecondMarketCheckoutAPI) return;
                if (item.maxQuantity && newQty > item.maxQuantity) {
                    this.showToast(`Only ${item.maxQuantity} item(s) available.`, 'error');
                    return;
                }

                this.state.cartUpdating = true;
                try {
                    const cart = newQty <= 0
                        ? await window.SecondMarketCheckoutAPI.removeItem(item.product.id)
                        : await window.SecondMarketCheckoutAPI.updateItem(item.product.id, newQty);
                    this.syncCartFromApi(cart);
                } catch (error) {
                    this.showToast(window.SecondMarketCheckoutAPI.formatError(error), 'error');
                } finally {
                    this.state.cartUpdating = false;
                }
            }

            goToCheckout() {
                if (!this.state.user) {
                    this.showToast('Sign in with your buyer account to proceed to checkout.', 'info');
                    window.location.href = '/login.html?next=%2Fcheckout%3Fview%3Dsummary';
                    return false;
                }
                if (this.state.user.role !== 'buyer') {
                    this.showToast('Admin accounts cannot place buyer checkout orders.', 'error');
                    return false;
                }
                if (!this.state.cart.length) {
                    this.showToast('Your shopping bag is empty.', 'info');
                    return false;
                }
                window.location.href='/checkout';
                return true;
            }

            async toggleWishlist(productId) {
                const idx = this.state.wishlist.indexOf(productId);

                if (this.state.user && window.SecondMarketMarketplaceAPI) {
                    try {
                        if (idx > -1) {
                            await window.SecondMarketMarketplaceAPI.removeWishlistItem(productId);
                            this.state.wishlist.splice(idx, 1);
                            this.state.wishlistProducts = (this.state.wishlistProducts || []).filter((item) => item.id !== productId);
                            this.showToast('Removed item from your wishlist.', 'info');
                        } else {
                            const addedProduct = await window.SecondMarketMarketplaceAPI.addWishlistItem(productId);
                            this.state.wishlist.push(productId);
                            const resolved = addedProduct || this.getProductById(productId);
                            if (resolved && !(this.state.wishlistProducts || []).some((item) => item.id === resolved.id)) {
                                this.state.wishlistProducts = [resolved, ...(this.state.wishlistProducts || [])];
                                this.state.productDetails[resolved.id] = resolved;
                            }
                            this.showToast('Saved item to your wishlist.');
                        }
                    } catch (error) {
                        this.showToast(window.SecondMarketMarketplaceAPI.formatError(error), 'error');
                        return;
                    }
                } else if (idx > -1) {
                    this.state.wishlist.splice(idx, 1);
                    this.showToast('Removed temporary wishlist item.', 'info');
                } else {
                    this.state.wishlist.push(productId);
                    this.showToast('Saved temporarily. Sign in to keep your wishlist.');
                }

                this.updateCounters();
                this.render();
            }

            render() {
                const main = document.getElementById('main-content');
                main.innerHTML = '';

                switch (this.state.currentView) {
                    case 'home':
                        main.innerHTML = this.renderHomeView();
                        this.startHeroBackgroundSlideshow();
                        break;
                    case 'shop':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderShopView();
                        break;
                    case 'pdp':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderPDPView(this.state.viewParams.id || this.state.products[0]?.id);
                        break;
                    case 'cart':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderCartView();
                        break;
                    case 'checkout':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderCheckoutView();
                        break;
                    case 'order-confirmation':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderOrderConfirmationView();
                        break;
                    case 'auth':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderAuthView();
                        break;
                    case 'account':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderAccountView();
                        break;
                    case 'wishlist':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderWishlistView();
                        break;
                    case 'about':
                        this.stopHeroBackgroundSlideshow();
                        main.innerHTML = this.renderAboutView();
                        break;
                    default:
                        main.innerHTML = this.renderHomeView();
                        this.startHeroBackgroundSlideshow();
                }
            }

            syncHeroBackgroundSlides() {
                const media = document.getElementById('home-hero-media');
                if (!media) return [];
                const slides = Array.from(media.querySelectorAll('[data-hero-slide]'));
                if (!slides.length) return [];
                const activeIndex = ((this.state.heroBackgroundIndex || 0) % slides.length + slides.length) % slides.length;
                slides.forEach((slide, idx) => {
                    slide.classList.toggle('is-active', idx === activeIndex);
                });
                return slides;
            }

            advanceHeroBackgroundSlide() {
                if (this.state.currentView !== 'home') {
                    this.stopHeroBackgroundSlideshow();
                    return;
                }
                if (document.hidden) return;
                const media = document.getElementById('home-hero-media');
                if (!media) {
                    this.stopHeroBackgroundSlideshow();
                    return;
                }
                const slides = Array.from(media.querySelectorAll('[data-hero-slide]'));
                if (slides.length < 2) return;
                this.state.heroBackgroundIndex = ((this.state.heroBackgroundIndex || 0) + 1) % slides.length;
                this.syncHeroBackgroundSlides();
            }

            startHeroBackgroundSlideshow() {
                const slides = this.syncHeroBackgroundSlides();
                if (slides.length < 2) {
                    this.stopHeroBackgroundSlideshow();
                    return;
                }
                if (this.heroSlideTimer === null) {
                    this.heroSlideTimer = window.setInterval(
                        () => this.advanceHeroBackgroundSlide(),
                        this.heroSlideIntervalMs || 5000
                    );
                }
            }

            stopHeroBackgroundSlideshow() {
                if (this.heroSlideTimer !== null) {
                    window.clearInterval(this.heroSlideTimer);
                    this.heroSlideTimer = null;
                }
            }

            renderHomeView() {
                return window.SecondMarketMarketplacePages.renderHomeView.call(this);
            }

            renderProductCard(product) {
                return window.SecondMarketMarketplaceComponents.renderProductCard.call(this, product);
            }

            renderShopView() {
                return window.SecondMarketMarketplacePages.renderShopView.call(this);
            }

            renderPDPView(productId) {
                return window.SecondMarketMarketplacePages.renderPDPView.call(this, productId);
            }

            renderCartDrawer() {
                const itemsContainer = document.getElementById('cart-drawer-items');
                const checkoutBtn = document.getElementById('cart-drawer-checkout-btn');
                if (!itemsContainer) return;

                if (checkoutBtn) {
                    checkoutBtn.disabled = this.state.cart.length === 0;
                    checkoutBtn.classList.toggle('opacity-50', this.state.cart.length === 0);
                    checkoutBtn.classList.toggle('cursor-not-allowed', this.state.cart.length === 0);
                }

                if (this.state.cart.length === 0) {
                    itemsContainer.innerHTML = `
                        <div class="text-center py-12 space-y-3">
                            <p class="text-sm text-[#776B56]">Your selection bag is currently empty.</p>
                            <button onclick="app.toggleCartDrawer(); app.navigate('shop');" class="btn-outline text-xs py-2">Explore Studio Catalog</button>
                        </div>
                    `;
                    document.getElementById('cart-drawer-subtotal').textContent = this.formatPrice(0);
                    return;
                }

                let subtotal = 0;
                itemsContainer.innerHTML = this.state.cart.map((item, idx) => {
                    const itemTotal = item.product.price * item.quantity;
                    const atMax = item.maxQuantity && item.quantity >= item.maxQuantity;
                    subtotal += itemTotal;
                    return `
                        <div class="flex gap-4 p-3 bg-white rounded border border-[#D7CEC1]/60">
                            <img src="${item.product.image}" class="w-16 h-16 object-cover rounded flex-shrink-0" alt="${this.escapeAttribute(item.product.title)}">
                            <div class="flex-grow min-w-0 space-y-1">
                                <h3 class="text-xs font-semibold text-[#4E4638] line-clamp-1">${this.escapeHtml(item.product.title)}</h3>
                                <p class="text-[10px] text-[#776B56]">${this.escapeHtml(item.product.category)} | ${this.escapeHtml(item.product.conditionLabel || item.product.condition)}</p>
                                <div class="flex justify-between items-center gap-2 pt-1">
                                    <div class="flex items-center border border-[#D7CEC1] rounded text-xs">
                                        <button type="button" onclick="app.updateCartQuantity(${idx}, ${item.quantity - 1})" class="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center text-[#776B56] hover:bg-[#FAF8F5]" aria-label="Decrease quantity">-</button>
                                        <span class="px-2 font-semibold text-[#4E4638]">${item.quantity}</span>
                                        <button type="button" onclick="app.updateCartQuantity(${idx}, ${item.quantity + 1})" class="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center text-[#776B56] hover:bg-[#FAF8F5] ${atMax ? 'opacity-40 cursor-not-allowed' : ''}" ${atMax ? 'disabled' : ''} aria-label="Increase quantity">+</button>
                                    </div>
                                    <span class="text-xs font-bold text-[#4E4638] whitespace-nowrap">${this.formatPrice(itemTotal)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                document.getElementById('cart-drawer-subtotal').textContent = this.formatPrice(subtotal);
            }

            renderCartView() {
                const subtotal = this.state.cart.reduce((acc, i) => acc + (i.product.price * i.quantity), 0);
                const shipping = subtotal >= 3000 ? 0 : (this.state.cart.length ? 45 : 0);
                const shippingLabel = this.state.cart.length === 0 ? '—' : (shipping === 0 ? 'Complimentary' : this.formatPrice(shipping));

                return `
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                        <h1 class="font-serif text-3xl font-semibold text-[#4E4638] mb-8">Shopping Bag Overview</h1>
                        
                        ${this.state.cart.length === 0 ? `
                            <div class="text-center py-16 bg-white rounded border border-[#D7CEC1]">
                                <p class="text-sm text-[#776B56]">Your bag is empty.</p>
                                <button onclick="app.navigate('shop')" class="btn-primary mt-4 text-xs">Continue Shopping</button>
                            </div>
                        ` : `
                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div class="lg:col-span-2 space-y-4">
                                    ${this.state.cart.map((item, idx) => `
                                        <div class="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border border-[#D7CEC1] rounded gap-4">
                                            <div class="flex items-center gap-4 w-full sm:w-auto">
                                                <img src="${item.product.image}" class="w-20 h-20 object-cover rounded" alt="${item.product.title}">
                                                <div>
                                                    <h3 class="font-serif text-base font-semibold text-[#4E4638]">${item.product.title}</h3>
                                                    <p class="text-xs text-[#776B56]">${item.product.category} | ${item.product.conditionLabel || item.product.condition}</p>
                                                    <span class="text-xs font-bold text-[#4E4638] mt-1 block">${this.formatPrice(item.product.price)}</span>
                                                </div>
                                            </div>

                                            <div class="flex items-center justify-between w-full sm:w-auto gap-4">
                                                <div class="flex items-center border border-[#D7CEC1] rounded bg-white">
                                                    <button type="button" onclick="app.updateCartQuantity(${idx}, ${item.quantity - 1})" class="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-xs text-[#4E4638]" aria-label="Decrease quantity">-</button>
                                                    <span class="px-3 text-xs font-semibold text-[#4E4638]">${item.quantity}</span>
                                                    <button type="button" onclick="app.updateCartQuantity(${idx}, ${item.quantity + 1})" class="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-xs text-[#4E4638]" aria-label="Increase quantity">+</button>
                                                </div>
                                                <button type="button" onclick="app.updateCartQuantity(${idx}, 0)" class="min-h-[44px] sm:min-h-[36px] px-2 text-xs text-[#776B56] hover:text-red-700">Remove</button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- Summary Card -->
                                <div class="p-6 bg-white border border-[#D7CEC1] rounded space-y-4 h-fit">
                                    <h2 class="font-serif text-lg font-semibold text-[#4E4638]">Order Summary</h2>
                                    <div class="space-y-2 text-xs border-b border-[#D7CEC1] pb-4">
                                        <div class="flex justify-between text-[#776B56]">
                                            <span>Subtotal</span>
                                            <span class="font-bold text-[#4E4638]">${this.formatPrice(subtotal)}</span>
                                        </div>
                                        <div class="flex justify-between text-[#776B56]">
                                            <span>Estimated Express Shipping</span>
                                            <span class="font-bold text-[#4E4638]">${shippingLabel}</span>
                                        </div>
                                    </div>
                                    <div class="flex justify-between text-sm font-bold text-[#4E4638]">
                                        <span>Total</span>
                                        <span>${this.formatPrice(subtotal + shipping)}</span>
                                    </div>
                                    <p class="text-[11px] text-[#776B56]">Complimentary express delivery automatically applied to orders ₱3,000 and above.</p>
                                    <button onclick="app.goToCheckout()" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Proceed to Checkout</button>
                                </div>
                            </div>
                        `}
                    </div>
                `;
            }

            renderCheckoutView() {
                setTimeout(() => this.goToCheckout(), 0);
                return `
                    <div class="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
                        <h1 class="font-serif text-2xl font-semibold text-[#4E4638]">Redirecting to Secure Checkout</h1>
                        <p class="text-xs text-[#776B56]">Taking you to the SecondMarket checkout workspace...</p>
                        <a href="/checkout" class="btn-primary inline-block py-2.5 px-6 text-xs uppercase tracking-widest">Continue to Checkout</a>
                    </div>
                `;
            }

            renderOrderConfirmationView() {
                setTimeout(() => { window.location.href = '/orders'; }, 0);
                return `
                    <div class="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
                        <h1 class="font-serif text-2xl font-semibold text-[#4E4638]">Order History</h1>
                        <p class="text-xs text-[#776B56]">Opening your verified customer orders...</p>
                        <a href="/orders" class="btn-primary inline-block py-2.5 px-6 text-xs uppercase tracking-widest">Go To My Orders</a>
                    </div>
                `;
            }

            renderAuthView() {
                return window.SecondMarketAuthViews.renderAuthView(this.state);
                const isRegister = this.state.authMode === 'register';
                const submitText = this.state.authLoading ? 'Please wait...' : (isRegister ? 'Create Buyer Account' : 'Sign In');
// login
                return `
                    <section class="auth-shell" aria-labelledby="auth-title">
                        <div class="auth-panel">
                            <h1 id="auth-title" class="font-serif text-2xl font-semibold text-[#4E4638] text-center mb-2">Customer Portal</h1>
                            <p class="text-xs text-[#776B56] text-center mb-6">Access your buyer account for saved items, checkout, and orders.</p>

                            <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
                                <button type="button" onclick="app.setAuthMode('login')" class="auth-tab ${!isRegister ? 'is-active' : ''}" aria-selected="${!isRegister}">Sign In</button>
                                <button type="button" onclick="app.setAuthMode('register')" class="auth-tab ${isRegister ? 'is-active' : ''}" aria-selected="${isRegister}">Register</button>
                            </div>

                            <form onsubmit="${isRegister ? 'app.handleRegister(event)' : 'app.handleLogin(event)'}" class="auth-grid" novalidate>
                                ${isRegister ? `
                                    <div class="auth-grid two-columns">
                                        <div class="auth-field">
                                            <label for="register-first-name">First Name</label>
                                            <input id="register-first-name" name="first_name" type="text" required autocomplete="given-name" class="form-input">
                                        </div>
                                        <div class="auth-field">
                                            <label for="register-last-name">Last Name</label>
                                            <input id="register-last-name" name="last_name" type="text" required autocomplete="family-name" class="form-input">
                                        </div>
                                    </div>
                                    <div class="auth-field">
                                        <label for="register-phone">Phone</label>
                                        <input id="register-phone" name="phone" type="tel" autocomplete="tel" class="form-input">
                                    </div>
                                ` : ''}
                                <div class="auth-field">
                                    <label for="${isRegister ? 'register-email' : 'login-email'}">Email Address</label>
                                    <input id="${isRegister ? 'register-email' : 'login-email'}" name="email" type="email" required autocomplete="email" class="form-input">
                                </div>
                                <div class="auth-field">
                                    <label for="${isRegister ? 'register-password' : 'login-password'}">Password</label>
                                    <input id="${isRegister ? 'register-password' : 'login-password'}" name="password" type="password" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" class="form-input">
                                </div>
                                <button type="submit" class="btn-primary w-full py-3 text-xs uppercase tracking-widest" ${this.state.authLoading ? 'disabled' : ''}>${submitText}</button>
                            </form>
                        </div>
                    </section>
                `;
                return `
                    <div class="max-w-md mx-auto px-4 py-16">
                        <div class="bg-white p-8 border border-[#D7CEC1] rounded shadow-subtle space-y-6">
                            <h1 class="font-serif text-2xl font-semibold text-[#4E4638] text-center">Customer Portal</h1>
                            <form onsubmit="event.preventDefault(); app.navigate('account');" class="space-y-4">
                                <div>
                                    <label class="block text-xs font-semibold text-[#776B56] mb-1">Email Address</label>
                                    <input type="email" required value="elena.rostova@design.com" class="form-input">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-[#776B56] mb-1">Password</label>
                                    <input type="password" required value="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" class="form-input">
                                </div>
                                <button type="submit" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Sign In</button>
                            </form>
                        </div>
                    </div>
                `;
            }

            renderAccountView() {
                return window.SecondMarketAuthViews.renderAccountView(this.state, this.formatPrice.bind(this));
                if (!this.state.user) {
                    return `
                        <section class="auth-shell" aria-labelledby="account-required-title">
                            <div class="auth-panel text-center space-y-4">
                                <h1 id="account-required-title" class="font-serif text-2xl font-semibold text-[#4E4638]">Sign In Required</h1>
                                <p class="text-sm text-[#776B56]">Please sign in or create a buyer account to view your account details.</p>
                                <button onclick="app.navigate('auth')" class="btn-primary w-full py-3 text-xs uppercase tracking-widest">Go to Customer Portal</button>
                            </div>
                        </section>
                    `;
                }

                return `
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                        <h1 class="font-serif text-3xl font-semibold text-[#4E4638] mb-2">Welcome, ${this.state.user.name}</h1>
                        <p class="text-xs text-[#776B56] mb-4">${this.state.user.email} | ${this.state.user.role} account | ${this.state.user.status}</p>
                        <div class="account-actions">
                            <button onclick="app.handleLogout()" class="btn-outline py-2 text-xs uppercase tracking-widest">Sign Out</button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div class="space-y-4">
                                <div class="bg-white p-6 border border-[#D7CEC1] rounded">
                                    <h3 class="font-serif text-lg font-semibold text-[#4E4638] mb-2">Profile</h3>
                                    <p class="text-xs text-[#776B56] leading-relaxed">
                                        ${this.state.user.name}<br>
                                        ${this.state.user.email}<br>
                                        ${this.state.user.phone}
                                    </p>
                                </div>
                            </div>

                            <div class="md:col-span-2 bg-white p-6 border border-[#D7CEC1] rounded space-y-4">
                                <h3 class="font-serif text-lg font-semibold text-[#4E4638]">Order History</h3>
                                ${this.state.user.orders.length === 0 ? `
                                    <p class="text-sm text-[#776B56]">No orders yet.</p>
                                ` : `<div class="divide-y divide-[#D7CEC1]">
                                    ${this.state.user.orders.map(o => `
                                        <div class="py-3 flex justify-between items-center text-xs">
                                            <div>
                                                <p class="font-bold text-[#4E4638]">${o.id}</p>
                                                <p class="text-[#776B56]">${o.date}</p>
                                            </div>
                                            <div class="text-right">
                                                <span class="badge badge-new">${o.status}</span>
                                                <p class="font-bold text-[#4E4638] mt-1">${this.formatPrice(o.total)}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>`}
                            </div>
                        </div>
                    </div>
                `;
                return `
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                        <h1 class="font-serif text-3xl font-semibold text-[#4E4638] mb-2">Welcome, ${this.state.user.name}</h1>
                        <p class="text-xs text-[#776B56] mb-8">${this.state.user.email} â€¢ Client ID: #CLIENT-90218</p>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div class="space-y-4">
                                <div class="bg-white p-6 border border-[#D7CEC1] rounded">
                                    <h3 class="font-serif text-lg font-semibold text-[#4E4638] mb-2">Default Address</h3>
                                    <p class="text-xs text-[#776B56] leading-relaxed">
                                        ${this.state.user.addresses[0].line1}<br>
                                        ${this.state.user.addresses[0].city}, ${this.state.user.addresses[0].state} ${this.state.user.addresses[0].zip}
                                    </p>
                                </div>
                            </div>

                            <div class="md:col-span-2 bg-white p-6 border border-[#D7CEC1] rounded space-y-4">
                                <h3 class="font-serif text-lg font-semibold text-[#4E4638]">Order History</h3>
                                <div class="divide-y divide-[#D7CEC1]">
                                    ${this.state.user.orders.map(o => `
                                        <div class="py-3 flex justify-between items-center text-xs">
                                            <div>
                                                <p class="font-bold text-[#4E4638]">${o.id}</p>
                                                <p class="text-[#776B56]">${o.date}</p>
                                            </div>
                                            <div class="text-right">
                                                <span class="badge badge-new">${o.status}</span>
                                                <p class="font-bold text-[#4E4638] mt-1">${this.formatPrice(o.total)}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            renderWishlistView() {
                return window.SecondMarketMarketplacePages.renderWishlistView.call(this);
            }

            renderAboutView() {
                return window.SecondMarketMarketplacePages.renderAboutView.call(this);
            }

            openInfoModal(topic) {
                const modal = document.getElementById('info-modal');
                const titleEl = document.getElementById('info-modal-title');
                const contentEl = document.getElementById('info-modal-body') || document.getElementById('info-modal-content');
                if (!modal || !titleEl || !contentEl) return;

                const topics = {
                    shipping: {
                        title: 'Shipping & Delivery Guide',
                        content: `
                            <div class="space-y-3">
                                <p class="font-medium">Every secondhand piece is inspected and securely packaged by the seller or our logistics hub.</p>
                                <div class="bg-[#FAF8F5] p-3 rounded border border-[#D7CEC1] space-y-1 text-xs">
                                    <div class="flex justify-between font-semibold text-[#4E4638]">
                                        <span>Complimentary Shipping</span>
                                        <span>Orders ₱3,000 and above</span>
                                    </div>
                                    <div class="flex justify-between text-[#776B56]">
                                        <span>Standard Express Rate</span>
                                        <span>₱45 flat fee</span>
                                    </div>
                                </div>
                                <h3 class="font-semibold text-xs uppercase tracking-wider text-[#776B56] pt-1">Delivery Windows</h3>
                                <ul class="list-disc pl-5 space-y-1 text-xs text-[#776B56]">
                                    <li><strong>Metro Manila:</strong> 2 to 3 business days</li>
                                    <li><strong>Luzon:</strong> 3 to 5 business days</li>
                                    <li><strong>Visayas & Mindanao:</strong> 5 to 7 business days</li>
                                </ul>
                                <p class="text-xs text-[#776B56]">Real-time tracking numbers are generated as soon as the dispatch label is created.</p>
                            </div>
                        `
                    },
                    returns: {
                        title: 'Returns & Item Condition Standards',
                        content: `
                            <div class="space-y-3">
                                <p class="font-medium">All items on SecondMarket are verified against their reported condition tier prior to release.</p>
                                <div class="space-y-2 text-xs text-[#776B56]">
                                    <div class="p-2.5 rounded bg-[#FAF8F5] border border-[#D7CEC1]">
                                        <strong class="text-[#4E4638]">Brand New / Like New:</strong> Pristine condition with zero visible wear.
                                    </div>
                                    <div class="p-2.5 rounded bg-[#FAF8F5] border border-[#D7CEC1]">
                                        <strong class="text-[#4E4638]">Lightly Used:</strong> Minimal signs of gentle use; fully functional.
                                    </div>
                                    <div class="p-2.5 rounded bg-[#FAF8F5] border border-[#D7CEC1]">
                                        <strong class="text-[#4E4638]">Well Used / Vintage:</strong> Characteristic patina or minor cosmetic imperfections clearly disclosed.
                                    </div>
                                </div>
                                <h3 class="font-semibold text-xs uppercase tracking-wider text-[#776B56] pt-1">Buyer Protection Guarantee</h3>
                                <p class="text-xs text-[#776B56]">If an item arrives damaged or differs substantially from its listing description, report it within <strong>48 hours</strong> of delivery for an immediate investigation and resolution.</p>
                            </div>
                        `
                    },
                    support: {
                        title: 'Buyer Support & Help Center',
                        content: `
                            <div class="space-y-3">
                                <p class="font-medium">Need assistance with an existing order, seller communication, or account inquiry?</p>
                                <div class="bg-[#FAF8F5] p-3 rounded border border-[#D7CEC1] space-y-2 text-xs">
                                    <div class="flex items-center gap-2">
                                        <span class="font-semibold text-[#4E4638]">Client Care Email:</span>
                                        <span class="text-[#776B56]">care@secondmarket.local</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-semibold text-[#4E4638]">Response Window:</span>
                                        <span class="text-[#776B56]">Within 24 business hours (Monday – Saturday)</span>
                                    </div>
                                </div>
                                <p class="text-xs text-[#776B56]">To manage or track active shipments directly, visit the <a href="/orders" class="text-[#4E4638] font-semibold underline">Order Tracking Portal</a>.</p>
                            </div>
                        `
                    }
                };

                const info = topics[topic] || {
                    title: 'Information',
                    content: '<p class="text-xs text-[#776B56]">Information is currently being updated. Please contact support if you have immediate questions.</p>'
                };

                titleEl.textContent = info.title;
                contentEl.innerHTML = info.content;
                this._lastFocusedEl = document.activeElement;
                modal.classList.remove('hidden');
                this.setOverlayState(modal, true);
                const focusTarget = modal.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])');
                if (focusTarget) focusTarget.focus();
            }

            closeInfoModal() {
                const modal = document.getElementById('info-modal');
                if (modal) {
                    modal.classList.add('hidden');
                    this.setOverlayState(modal, false);
                    this.restoreFocus();
                }
            }

            escapeHtml(str) {
                if (str === null || str === undefined) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            escapeAttribute(str) {
                return this.escapeHtml(str);
            }

            togglePasswordVisibility(inputId, btn) {
                const input = document.getElementById(inputId);
                if (!input) return;
                const willShow = input.type === 'password';
                input.type = willShow ? 'text' : 'password';
                if (btn) {
                    btn.textContent = willShow ? 'Hide' : 'Show';
                    btn.setAttribute('aria-pressed', willShow ? 'true' : 'false');
                    btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
                }
            }

            updateAuthHeader() {
                const headerAuth = document.getElementById('buyer-header-auth');
                if (headerAuth) {
                    if (this.state.user) {
                        const displayName = this.state.user.firstName || this.state.user.name || 'Account';
                        const avatarUrl = this.state.user.avatarUrl || '';
                        const avatarIconMarkup = avatarUrl
                            ? `<img src="${this.escapeAttribute(avatarUrl)}" alt="${this.escapeAttribute(displayName)}" class="w-6 h-6 rounded-full object-cover border border-[#B9A995]" onerror="this.style.display='none'">`
                            : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`;
                        headerAuth.innerHTML = `
                            <div class="relative group">
                                <button type="button" onclick="app.navigate('account')" class="p-2 text-[#4E4638] hover:text-[#6E614D] hover:bg-[#D7CEC1]/20 rounded-full transition flex items-center gap-1.5" aria-label="Account Menu" aria-haspopup="menu" title="${this.escapeAttribute(displayName)}">
                                    ${avatarIconMarkup}
                                    <span class="text-xs font-semibold max-w-[110px] truncate hidden md:inline text-[#4E4638]">${this.escapeHtml(displayName)}</span>
                                </button>
                                <div class="absolute right-0 top-full mt-1 w-48 bg-[#FAF8F5] border border-[#D7CEC1] rounded-lg shadow-lg py-2 hidden group-hover:block group-focus-within:block transition z-50">
                                    <div class="px-4 py-2 border-b border-[#D7CEC1]/60">
                                        <p class="text-xs font-semibold text-[#4E4638] truncate">${this.escapeHtml(this.state.user.name || '')}</p>
                                        <p class="text-[10px] text-[#776B56] truncate">${this.escapeHtml(this.state.user.email || '')}</p>
                                    </div>
                                    <a href="#" onclick="app.navigate('account', {tab: 'overview'}); return false;" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">My Profile</a>
                                    <a href="#" onclick="app.navigate('account', {tab: 'addresses'}); return false;" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">Delivery Addresses</a>
                                    <a href="#" onclick="app.navigate('account', {tab: 'payments'}); return false;" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">Payment Preferences</a>
                                    <a href="#" onclick="app.navigate('account', {tab: 'preferences'}); return false;" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">Appearance &amp; Theme</a>
                                    <a href="/orders" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">My Orders</a>
                                    <a href="#" onclick="app.navigate('wishlist'); return false;" class="block px-4 py-2 text-xs text-[#4E4638] hover:bg-[#D7CEC1]/20 hover:text-[#6E614D]">Wishlist</a>
                                    <div class="border-t border-[#D7CEC1]/60 mt-1 pt-1">
                                        <button type="button" onclick="app.handleLogout()" class="w-full text-left px-4 py-2 text-xs text-red-700 hover:bg-red-50">Sign Out</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        headerAuth.innerHTML = `
                            <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#4E4638]">
                                <a href="/login.html" onclick="window.location.href='/login.html'" class="hover:text-[#6E614D] transition py-1.5 px-2 rounded hover:bg-[#D7CEC1]/20 whitespace-nowrap">Log in</a>
                                <span class="text-[#D7CEC1] select-none hidden sm:inline" aria-hidden="true">|</span>
                                <a href="/register.html" class="hover:text-[#6E614D] transition py-1.5 px-2 rounded hover:bg-[#D7CEC1]/20 hidden sm:inline-block whitespace-nowrap">Sign up</a>
                            </div>
                        `;
                    }
                }

                const mobileAuth = document.getElementById('mobile-auth-section');
                if (mobileAuth) {
                    if (this.state.user) {
                        const displayName = this.state.user.firstName || this.state.user.name || 'Account';
                        mobileAuth.innerHTML = `
                            <button type="button" onclick="app.navigate('account'); app.toggleMobileMenu();" class="w-full btn-outline min-h-[44px] text-xs flex items-center justify-center gap-2 py-2.5">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                <span>${this.escapeHtml(displayName)}</span>
                            </button>
                            <a href="/orders" class="w-full block text-center btn-outline min-h-[44px] flex items-center justify-center text-xs uppercase tracking-wider py-2.5">My Orders</a>
                            <button type="button" onclick="app.navigate('wishlist'); app.toggleMobileMenu();" class="w-full btn-secondary min-h-[44px] text-xs py-2.5">Wishlist Items</button>
                            <button type="button" onclick="app.handleLogout(); app.toggleMobileMenu();" class="w-full min-h-[44px] text-center text-xs text-red-700 hover:underline py-2">Sign Out</button>
                        `;
                    } else {
                        mobileAuth.innerHTML = `
                            <div class="grid grid-cols-2 gap-2">
                                <a href="/login.html" onclick="window.location.href='/login.html'" class="w-full min-h-[44px] flex items-center justify-center text-center btn-primary text-xs uppercase tracking-wider py-2.5">Log in</a>
                                <a href="/register.html" class="w-full min-h-[44px] flex items-center justify-center text-center btn-outline text-xs uppercase tracking-wider py-2.5">Sign up</a>
                            </div>
                            <button type="button" onclick="app.navigate('wishlist'); app.toggleMobileMenu();" class="w-full btn-secondary min-h-[44px] text-xs py-2.5">Wishlist Items</button>
                        `;
                    }
                }
            }
        }

        // INITIALIZE APP INSTANCE ON WINDOW LOAD
        let app;
        window.addEventListener('DOMContentLoaded', () => {
            app = new SecondMarketApp();
        });



