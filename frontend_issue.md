# Frontend UI/UX Issues & Design System Audit

**Project:** SecondMarket (Secondhand E-Commerce Platform)  
**Document:** Frontend Issues & Layout Discrepancies  
**Date:** November 2026  
**Scope:** Storefront, Authentication, Checkout, Orders, and Admin Workspace  

---

## 1. Executive Summary

A comprehensive visual and technical audit of the frontend interface across all pages revealed significant design system fragmentation, critical CSS regressions, jarring user journey inconsistencies, and violations of modern UI/UX design standards. 

The application currently behaves like **three separate websites developed independently** rather than a unified digital marketplace:
1. **Marketplace Storefront (`/`):** A warm, earthy, vintage-inspired design using serif headings and pill buttons.
2. **Checkout & Orders (`/checkout`, `/orders`):** A boxy, stark layout with thick card borders and custom BEM classes.
3. **Admin Workspace (`/admin`):** A dark brown navigation shell hosting an inconsistent SaaS template with stark white panels, indigo/purple badges, and a neon lime-green button.

---

## 2. Critical CSS Bugs & Visual Deficiencies

### Issue 2.1: Primary Button Background Commented Out
* **File:** [`frontend/static/css/marketplace/base.css` (lines 668–682)](file:///c:/ecommerce/frontend/static/css/marketplace/base.css#L668-L682)
* **Code:**
  ```css
  .btn-primary {
      /* background-color: var(--color-primary-dark); */
      color: var(--color-white);
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      ...
  }
  ```
* **Visual Impact:** Because the CSS button reset sets `background-color: transparent`, any `.btn-primary` element that does not explicitly include an inline utility background class renders with **white text on a transparent background** (invisible text on light pages) until the cursor hovers over it.

---

### Issue 2.2: Neon Lime Green / Dark Indigo Button in Admin
* **File:** [`frontend/static/css/admin/base.css` (lines 3019–3040)](file:///c:/ecommerce/frontend/static/css/admin/base.css#L3019-L3040)
* **Code:**
  ```css
  .admin-btn-primary-purple {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.6rem 1.15rem;
      background: #2bca2e; /* Garish neon lime green */
      color: #ffffff;
      ...
  }

  .admin-btn-primary-purple:hover {
      background: #4338ca; /* Instantly changes to dark indigo purple */
  }
  ```
* **Visual Impact:** A class named `purple` has a default background of harsh neon green (`#2bca2e`). When hovered, it abruptly flashes to deep purple (`#4338ca`). This clashes severely with both the dark brown admin shell and the vintage aesthetic of SecondMarket.

---

### Issue 2.3: Form Input Padding Commented Out on Authentication Pages
* **File:** [`frontend/static/css/auth.css` (lines 122–131)](file:///c:/ecommerce/frontend/static/css/auth.css#L122-L131)
* **Code:**
  ```css
  .auth-page .form-input {
      background: var(--color-white);
      border: 1px solid var(--color-light-bg);
      border-radius: var(--radius-sm);
      color: var(--color-primary-dark);
      font-size: 0.875rem;
      /* padding: 0.75rem 1rem; */
      width: 100%;
      height: 2.60rem;
  }
  ```
* **Visual Impact:** On [`frontend/login.html`](file:///c:/ecommerce/frontend/login.html) and [`frontend/register.html`](file:///c:/ecommerce/frontend/register.html), typed text has 0px horizontal padding, causing user input to press directly against the left border of the field.

---

### Issue 2.4: Inconsistent Border Radius on the Same Screen
* **File:** [`frontend/static/css/auth.css` (lines 138–170)](file:///c:/ecommerce/frontend/static/css/auth.css#L138-L170)
* **Code:**
  * `.auth-page .btn-primary`: `border-radius: 16px;`
  * `.auth-page .btn-outline`: `border-radius: var(--radius-sm);` (which evaluates to `4px`)
* **Visual Impact:** On the sign-in and registration pages, a pill-shaped primary button is placed directly above sharp, rectangular outline buttons, violating geometric harmony.

---

## 3. Design System Fragmentation (3 Incompatible Interfaces)

The platform lacks a unified design system. The three main workspaces use completely different design languages:

| Attribute | 🛍️ Storefront (`/`) | 💳 Checkout & Orders (`/checkout`, `/orders`) | 🛠️ Admin Workspace (`/admin`) |
|:---|:---|:---|:---|
| **Color Tokens** | Taupe (`#4E4638`), Sand (`#9A8B74`), Cream (`#FAF8F5`) | Scoped variables (`--checkout-bg: #f7f4ef`, `--checkout-ink: #332f27`) | Dark Brown sidebar (`#4E4638`) + SaaS Indigo (`#4F46E5`), Slate (`#cbd5e1`), Neon Green (`#2bca2e`) |
| **Typography** | Georgia serif headers + system sans-serif body | Generic sans-serif with heavy weights (`font-weight: 800`) | Clean SaaS sans-serif (`Inter`-style system stack) |
| **Buttons** | Rounded pill buttons (`border-radius: 50px`) | Rigid rounded rectangles (`border-radius: 6px`) | Mixed 8px rounded corners and square inputs |
| **Cards & Panels** | Subtle warm border (`1px solid #D7CEC1`), soft shadows | Heavy borders (`#ded4c7`), high contrast shadows | White SaaS cards (`#ffffff`) with slate outlines (`#e2e8f0`) |
| **CSS Architecture** | Custom pseudo-Tailwind utility classes | Component-scoped BEM-like CSS | Monolithic 4,229-line stylesheet |

---

## 4. Disconnected User Journey: The Dual Cart Experience

A customer navigating from product discovery to payment encounters two conflicting cart interfaces within seconds:

### Step 1: The Storefront Bag Overview (`/`)
* **Source:** [`frontend/static/js/marketplace/app.js` (lines 863–920)](file:///c:/ecommerce/frontend/static/js/marketplace/app.js#L863-L920)
* **Page Title:** `Shopping Bag Overview`
* **Card Title:** `Order Summary`
* **Shipping Line:** Displays `Estimated Express Shipping: Complimentary`
* **Action Button:** Rounded pill button labeled `PROCEED TO CHECKOUT`

### Step 2: The Checkout Cart View (`/checkout`)
* **Source:** [`frontend/checkout/pages/cart.html` (lines 2–30)](file:///c:/ecommerce/frontend/checkout/pages/cart.html#L2-L30)
* **Page Title:** `Review Saved Items`
* **Card Title:** `Subtotal` (eyebrow text)
* **Shipping Line:** No shipping calculation (indicates shipping is calculated prior to confirmation)
* **Action Button:** Boxy rectangular button labeled `Proceed To Checkout`

**User Impact:** This abrupt shift in terminology, typography, grid structure, and pricing details creates friction and makes the checkout flow feel unverified.

---

## 5. Unprofessional Copy & Leaked Developer Terminology

1. **Leaked Technical Jargon in Catalog:**
   * **File:** [`frontend/marketplace/pages/catalog.html` (line 12)](file:///c:/ecommerce/frontend/marketplace/pages/catalog.html#L12)
   * **Text:** `<p>Showing {{productCount}} API-matched secondhand items</p>`
   * **Issue:** Internal developer language (`API-matched`) is directly visible to shoppers.

2. **Dead Footer Links with Toast Popups:**
   * **File:** [`frontend/index.html` (lines 201–204)](file:///c:/ecommerce/frontend/index.html#L201-L204)
   * **Code:**
     * `Shipping Guide` $\rightarrow$ triggers `app.showToast('Shipping details are confirmed during checkout.', 'info')`
     * `Returns & Item Condition` $\rightarrow$ triggers `app.showToast('Return rules depend on the listed item condition.', 'info')`
     * `Buyer Support` $\rightarrow$ triggers `app.showToast('Message support will be added in a later module.', 'info')`
   * **Issue:** Core consumer information pages are non-functional stubs that display temporary alerts.

3. **Fake Notification Counter in Admin Topbar:**
   * **File:** [`frontend/admin/index.html` (line 112)](file:///c:/ecommerce/frontend/admin/index.html#L112)
   * **Issue:** Displays a static red badge with `"4"`. Clicking the bell executes [`adminApp.showNotificationsToast()`](file:///c:/ecommerce/frontend/static/js/admin/app.js#L1122), showing a generic toast without any drawer or notification list.

4. **Incomplete Tooltip in Admin Products:**
   * **File:** [`frontend/admin/pages/products.html` (line 17)](file:///c:/ecommerce/frontend/admin/pages/products.html#L17)
   * **Text:** `<button ... title="Full product form will be added">`
   * **Issue:** Outdated development placeholder left in user-facing tooltip text.

---

## 6. Violations of Modern Layout & UI/UX Principles

1. **Form Input Height Discrepancies:**
   * Auth inputs: `2.60rem` (`~41.6px`)
   * Catalog search bar: `h-11` (`44px`)
   * Admin drawer controls: `38px`
   * Order filters: unstyled browser default height
2. **Accessibility & Contrast Deficiencies:**
   * In the cart drawer and product metadata rows, captions use `text-[10px]` with color `#776B56` over background `#FAF8F5`, failing WCAG AA contrast ratios for readable text.
3. **Fragile Hand-Coded Utility Classes:**
   * [`frontend/static/css/marketplace/base.css`](file:///c:/ecommerce/frontend/static/css/marketplace/base.css) manually defines custom Tailwind-like utility rules (e.g., `.lg\:border-\[\#D7CEC1\]\/50`). Missing viewport classes result in visual clipping and alignment issues on tablet viewports (768px–1024px).
4. **Empty State Inconsistencies:**
   * Empty states in the marketplace use soft cards with buttons.
   * Empty states in admin categories insert inline-styled dashed borders (`border: 1px dashed #cbd5e1;`).
   * Orders empty state uses custom scoped buttons with non-standard font weights (`font-weight: 800`).

---

## 7. Actionable Frontend Remediation Checklist

- [ ] **Fix CSS Regressions:**
  - [ ] Uncomment `background-color: var(--color-primary-dark);` on `.btn-primary` in `marketplace/base.css`.
  - [ ] Restore `padding: 0.75rem 1rem;` on `.form-input` in `auth.css`.
  - [ ] Replace `#2bca2e` and `#4338ca` in `.admin-btn-primary-purple` with the brand primary color `#4E4638`.
- [ ] **Unify the Design System:**
  - [ ] Standardize a single button border-radius across all apps (`6px` or `8px`).
  - [ ] Apply SecondMarket's warm neutral palette (`#4E4638`, `#9A8B74`, `#FAF8F5`) to the admin workspace, replacing copied SaaS indigo accents.
  - [ ] Standardize form input heights across all forms to `40px` or `42px`.
- [ ] **Synchronize Cart & Checkout:**
  - [ ] Unify terminology: use "Shopping Bag" and "Order Summary" consistently across both views.
  - [ ] Match shipping calculations and layout between storefront cart drawer, cart overview, and `/checkout`.
- [ ] **Copy & Interaction Cleanup:**
  - [ ] Replace `"Showing {{productCount}} API-matched secondhand items"` with `"Showing {{productCount}} items"`.
  - [ ] Replace footer toast stubs with modal dialogs or dedicated informational pages for Shipping, Returns, and Support.
