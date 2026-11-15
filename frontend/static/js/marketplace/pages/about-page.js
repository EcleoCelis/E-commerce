(function () {
    const SYSTEM_DEFAULTS = {
        app: 'SecondMarket',
        version: '0.1.0',
        environment: 'Storefront Active',
        api_version: 'v1',
    };

    const DEVELOPER_TEAM = [
        {
            name: 'Alexa Alegarbes',
            initials: 'AA',
            role: 'Design & Development',
            focus: 'Seller Catalog & Buyer Storefront',
            contributions: [
                {
                    title: 'Admin Seller Category Management',
                    description: 'Manages secondhand item categories, URL slugs, descriptions, active/inactive states, and sort ordering in the admin seller workspace.'
                },
                {
                    title: 'Admin Seller Product Management',
                    description: 'Oversees product listings, status lifecycle (draft, published, hidden, sold), inventory quantities, item condition ratings, and seller catalog workflows.'
                },
                {
                    title: 'Buyer Marketplace Catalog',
                    description: 'Delivers the buyer-facing storefront landing page and browseable catalog showcasing available secondhand items with category discovery tiles and featured products.'
                }
            ]
        },
        {
            name: 'Richelle Jean Rosagaran',
            initials: 'RR',
            role: 'Design & Development',
            focus: 'Discovery, Product Experience & Cart',
            contributions: [
                {
                    title: 'Marketplace Search and Filtering',
                    description: 'Enables dynamic product discovery with instant keyword search, category filters, condition selectors (like new, good, fair), price sliders, and sorting presets with responsive loading/empty states.'
                },
                {
                    title: 'Product Detail Experience',
                    description: 'Showcases individual product listings with photo galleries, condition details, seller information, quantity selectors, wishlist saving, buyer review summaries, and cart entry buttons.'
                },
                {
                    title: 'Buyer Cart',
                    description: 'Provides persistent shopping cart functionality allowing buyers to inspect selected items, adjust purchase quantities, remove products, view subtotals, and proceed directly to checkout.'
                }
            ]
        },
        {
            name: 'Diondell Apariccio',
            initials: 'DA',
            role: 'Design & Development',
            focus: 'Checkout, Orders & Fulfillment',
            contributions: [
                {
                    title: 'Checkout and Order Confirmation',
                    description: 'Guides buyers through finalizing purchases by capturing delivery shipping addresses, selecting payment methods, verifying inventory availability, and reviewing calculated order totals.'
                },
                {
                    title: 'Order Creation API',
                    description: 'Backend order placement engine that creates order, order item, payment, and shipping records from validated checkout data while automatically adjusting stock levels.'
                },
                {
                    title: 'Admin Order Management',
                    description: 'Enables store administrators to inspect all buyer orders, view customer info and item snapshots, monitor payment status, and update fulfillment and shipping tracking.'
                },
                {
                    title: 'Buyer Order History and Tracking',
                    description: 'Allows buyers to review their past orders, inspect fulfillment timelines with tracking numbers, access item snapshots, and request cancellations for pending shipments.'
                }
            ]
        },
        {
            name: 'Jomarie Celis',
            initials: 'JC',
            role: 'Design & Development',
            focus: 'Auth, Inventory, Payments & Analytics',
            contributions: [
                {
                    title: 'Authentication',
                    description: 'Provides secure buyer/admin sign-in, buyer registration, session cookie handling, dynamic header auth state switching, role-aware redirects, and protected routes.'
                },
                {
                    title: 'Inventory Management',
                    description: 'Handles inventory tracking, stock deduction upon order confirmation, stock restoration on cancellation, low-stock warnings, and admin inventory visibility.'
                },
                {
                    title: 'Payment and Checkout Method Handling',
                    description: 'Manages checkout payment channels (Cash on Delivery, GCash/E-Wallet), creates verified payment records, and exposes payment status throughout order workflows.'
                },
                {
                    title: 'Admin Dashboard and Reports',
                    description: 'Executive analytics dashboard delivering key performance indicators (sales, revenue, orders, inventory valuation, top products) and on-demand CSV report exports.'
                }
            ]
        }
    ];

    function renderDeveloperCard(appInstance, member) {
        const moduleCount = member.contributions.length;
        const contributionsHtml = member.contributions.map((item, idx) => `
            <li class="about-contrib-item">
                <div class="about-contrib-head">
                    <span class="about-contrib-index" aria-hidden="true">${String(idx + 1).padStart(2, '0')}</span>
                    <h4 class="about-contrib-title">${appInstance.escapeHtml(item.title)}</h4>
                </div>
                <p class="about-contrib-desc">${appInstance.escapeHtml(item.description)}</p>
            </li>
        `).join('');

        return `
            <article class="about-dev-card">
                <header class="about-dev-header">
                    <div class="about-dev-identity">
                        <span class="about-dev-avatar" aria-hidden="true">${appInstance.escapeHtml(member.initials)}</span>
                        <div class="about-dev-meta">
                            <h3 class="about-dev-name font-serif">${appInstance.escapeHtml(member.name)}</h3>
                            <p class="about-dev-role">${appInstance.escapeHtml(member.role)} &bull; ${appInstance.escapeHtml(member.focus)}</p>
                        </div>
                    </div>
                    <span class="about-module-badge">${moduleCount} Modules</span>
                </header>
                <ul class="about-contrib-list" aria-label="${appInstance.escapeAttribute(member.name)} contributions">
                    ${contributionsHtml}
                </ul>
            </article>
        `;
    }

    function renderAboutView() {
        const sys = this.state.systemInfo || SYSTEM_DEFAULTS;
        const appName = sys.app || SYSTEM_DEFAULTS.app;
        const version = String(sys.version || SYSTEM_DEFAULTS.version).replace(/^v/i, '');
        const apiVersion = String(sys.api_version || SYSTEM_DEFAULTS.api_version).toUpperCase();
        const environmentRaw = String(sys.environment || SYSTEM_DEFAULTS.environment);
        const environmentLabel = environmentRaw.charAt(0).toUpperCase() + environmentRaw.slice(1);

        const productCount = Array.isArray(this.state.products) ? this.state.products.length : 0;
        const categoryCount = Array.isArray(this.state.categories) ? this.state.categories.length : 0;
        const liveListingLabel = productCount > 0 ? `${productCount} Items` : 'Live Catalog';
        const categoryCountLabel = categoryCount > 0 ? `Across ${categoryCount} active categories` : 'Multi-category curation';

        const developerCards = DEVELOPER_TEAM.map((member) => renderDeveloperCard(this, member)).join('');

        return this.renderPageTemplate('about', {
            appName: this.escapeHtml(appName),
            appVersionLabel: this.escapeHtml(`v${version}`),
            apiVersionLabel: this.escapeHtml(`REST API ${apiVersion}`),
            environmentLabel: this.escapeHtml(environmentLabel),
            liveListingLabel: this.escapeHtml(liveListingLabel),
            categoryCountLabel: this.escapeHtml(categoryCountLabel),
            developerCards,
        });
    }

    window.SecondMarketMarketplacePages = window.SecondMarketMarketplacePages || {};
    window.SecondMarketMarketplacePages.renderAboutView = renderAboutView;
})();
