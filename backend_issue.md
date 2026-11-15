# Backend Architecture, Missing Modules & Domain Gaps

**Project:** SecondMarket (Secondhand E-Commerce Platform)  
**Document:** Backend Issues, Unimplemented Modules & Architectural Gaps  
**Date:** November 2026  
**Scope:** REST API, Data Models, Security, Business Logic, and Deployment  

---

## 1. Executive Summary

The backend is built with **Flask 3.0.3**, **SQLAlchemy 3.1.1**, **Flask-Migrate 4.1.0**, and **PostgreSQL (with psycopg 3.3.6)**. The existing core modules (Modules 01 through 08 and Module 10) have solid test coverage with **180/180 passing tests** covering basic catalog management, cart persistence, draft checkout, order state transitions, review moderation, and SQL-derived analytical reports.

However, a comprehensive audit against production e-commerce requirements and the project roadmap in [`backend/docs/modules/modules.md`](file:///c:/ecommerce/backend/docs/modules/modules.md) identifies **three missing or incomplete roadmap modules**, several **critical e-commerce domain omissions**, and **security hardening deficiencies**.

---

## 2. Roadmap Module Implementation Status

| Module # | Module Name | Status in Roadmap | Actual Implementation State |
|:---|:---|:---|:---|
| **01** | System Foundation | Complete | ✅ Implemented & verified |
| **02** | Database & Core Domain Models | Complete | ✅ Implemented & verified |
| **03** | Authentication & Authorization | Complete | ⚠️ Basic auth working; missing self-service flows |
| **04** | Buyer Marketplace | Complete | ✅ Implemented & verified |
| **05** | Admin Seller Management | Complete | ⚠️ Functional; bulk CSV import is a stub |
| **06** | Cart & Checkout | Complete | ⚠️ Functional; mock payment methods only |
| **07** | Order & Fulfillment Management | Complete | ⚠️ Functional; no post-delivery return (RMA) flow |
| **08** | Reviews, Reports & Moderation | Complete | ✅ Implemented & verified |
| **09** | Notifications & Messaging | **Skipped** | ❌ **Completely Missing** |
| **10** | Admin Dashboard & Reports | Complete | ✅ Implemented & verified |
| **11** | Security Hardening & QA | **Planned** | ⚠️ **Incomplete / Unhardened** |
| **12** | Deployment & Monitoring | **Planned** | ❌ **Completely Missing** |

---

## 3. Missing & Incomplete Roadmap Modules

### Module 09: Notifications & Messaging (`SKIPPED`)
* **Planned Purpose:** Account/order event notifications and direct buyer-to-admin support messaging.
* **Current State:**
  * **No Database Models:** No `Notification`, `Message`, or `SupportTicket` tables exist in [`backend/app/models/`](file:///c:/ecommerce/backend/app/models).
  * **No API Endpoints:** No notification or messaging routes exist under `/api/v1/`.
  * **No Real-Time Transport:** No WebSockets, Server-Sent Events (SSE), or notification polling infrastructure.
  * **Frontend Consequences:** The admin notification bell displays a dummy badge (`"4"`) with a static alert, and the storefront footer has a non-functional link (`"Message support will be added in a later module."`).

---

### Module 11: Security Hardening & QA (`PLANNED / INCOMPLETE`)
* **No CSRF Protection on API Endpoints:** State-changing API requests (`POST`, `PUT`, `PATCH`, `DELETE`) rely solely on cookie `SameSite=Lax`. There is no CSRF token check or CSRF header verification middleware.
* **No CORS Policy Configured:** The app does not configure `Flask-CORS` or CORS response headers. Any external client, mobile application, or cross-origin integration will be blocked by browsers.
* **No Rate Limiting:** There is no rate-limiting middleware (`Flask-Limiter`). Sensitive endpoints are vulnerable to automated attacks:
  * `POST /api/v1/auth/login` (brute-force credential stuffing)
  * `POST /api/v1/auth/register` (bot account spam)
  * `POST /api/v1/marketplace/products/<slug>/reports` (report flood)
  * `POST /api/v1/checkout/draft` (inventory reservation denial-of-service)
* **Unhardened File Uploads:**
  * In [`backend/app/api/admin.py` (lines 141–158)](file:///c:/ecommerce/backend/app/api/admin.py#L141-L158), file validation only checks the filename extension string (`ALLOWED_IMAGE_EXTENSIONS`).
  * Missing magic-byte/MIME type inspection.
  * No image re-encoding or EXIF sanitization (Pillow is not installed).
  * No file size limit (`MAX_CONTENT_LENGTH` is missing in [`backend/app/core/config.py`](file:///c:/ecommerce/backend/app/core/config.py)).

---

### Module 12: Deployment & Monitoring (`PLANNED / NOT IMPLEMENTED`)
* **No Production WSGI Server:** The project only has `run.py`, which executes Flask's development server (`app.run()`). No configuration exists for Gunicorn, Waitress, or uWSGI.
* **No Containerization:** There is no `Dockerfile` or `docker-compose.yml` for reproducible local or cloud deployments.
* **No Production Migration Automation:** No automated CI/CD pipeline or migration execution scripts for production database upgrades.
* **No Structured Logging or APM:** Error reporting relies on standard console output. No integration with Sentry, Prometheus, or structured JSON logging.

---

## 4. E-Commerce Core Business Logic Gaps

### 1. Mock Payment Processing (No Real Gateway)
* **File:** [`backend/app/checkout/validation.py` (line 4)](file:///c:/ecommerce/backend/app/checkout/validation.py#L4)
* **Current State:** Only `cash_on_delivery` and `gcash_pending` are accepted.
* **The Gap:** For GCash, the order is created with `PaymentStatus.PENDING`. There is no integration with an actual payment gateway (PayMongo, Stripe, PayPal, or GCash API). There are no webhooks, payment intents, QR generation, or automated transaction verifications. Payments must be manually verified and updated by the admin seller.

---

### 2. Absence of Transactional Email / SMS Service
* **Current State:** No email library (`Flask-Mail`, `sendgrid`, `resend`, `boto3`) is present in [`requirements.txt`](file:///c:/ecommerce/requirements.txt).
* **The Gap:**
  * Buyers receive no order confirmation emails after checkout.
  * No tracking or delivery notifications are sent when shipping status changes.
  * No account welcome or verification emails.

---

### 3. Missing User Account Self-Service
* **File:** [`backend/app/api/auth.py`](file:///c:/ecommerce/backend/app/api/auth.py)
* **The Gap:** The authentication module only implements `register`, `login`, `logout`, and `me`. It lacks critical standard user operations:
  * **Forgot / Reset Password:** No endpoints to request a reset token or set a new password.
  * **Change Password:** No authenticated endpoint to update the current password.
  * **Profile Management:** No endpoint for users to update their personal details (name, phone number, email).
  * **Email Verification:** Accounts are active immediately without email confirmation.

---

### 4. No Saved Address Book Model
* **Current State:** There is no `Address` database model.
* **The Gap:** Shipping addresses are stored only as flat fields directly on `Order` and `ShippingRecord`. Buyers cannot save default addresses or maintain an address book. On every checkout, they must re-enter their full delivery information from scratch.

---

### 5. Admin Bulk CSV Product Import Is a Client Stub
* **File:** [`frontend/static/js/admin/app.js` (line 1086)](file:///c:/ecommerce/frontend/static/js/admin/app.js#L1086)
* **The Gap:** While CSV **export** is implemented in [`backend/app/api/reports.py`](file:///c:/ecommerce/backend/app/api/reports.py), CSV **import** has no backend service or endpoint. Clicking "Import CSV" in the admin panel only triggers a temporary browser toast notification.

---

### 6. Single-Seller Platform Limitation (No Multi-Vendor C2C)
* **Current State:** Products can only be created by users with `Role.ADMIN` ([`backend/app/api/admin.py` line 214](file:///c:/ecommerce/backend/app/api/admin.py#L214)).
* **The Gap:** While marketed as a "secondhand marketplace", regular buyers cannot list items they own for resale. There is no seller registration, vendor onboarding, commission split, or seller payout system.

---

### 7. No Post-Delivery Return / Refund (RMA) Workflow
* **File:** [`backend/app/orders/service.py`](file:///c:/ecommerce/backend/app/orders/service.py#L173-L195)
* **The Gap:** Order cancellation is supported only prior to shipping. Once an order is marked as `DELIVERED`, there is no return request workflow, dispute filing, or partial refund process.

---

### 8. Absence of Discounts, Coupons, or Promotions
* **The Gap:** There are no models, validation rules, or checkout fields for discount codes, vouchers, seasonal promotions, or referral credits.

---

## 5. Architectural & Infrastructure Deficiencies

1. **Local Disk Storage for Media:**
   * Images are saved directly to `frontend/static/uploads/` on the local web server disk. In a cloud or containerized deployment, this storage is ephemeral and will be wiped upon instance restart. Images should be stored in S3, Cloudinary, or GCS.
2. **Missing `MAX_CONTENT_LENGTH` Configuration:**
   * [`backend/app/core/config.py`](file:///c:/ecommerce/backend/app/core/config.py) does not define `MAX_CONTENT_LENGTH`. Flask will accept arbitrarily large payloads, leaving the server vulnerable to memory exhaustion attacks during file uploads.
3. **Hardcoded Database Credentials in Fallback:**
   * [`backend/app/core/config.py` (line 6)](file:///c:/ecommerce/backend/app/core/config.py#L6) hardcodes a local PostgreSQL connection string with password (`postgresql+psycopg://postgres:2005@localhost:5432/secondhand`).

---

## 6. Actionable Backend Remediation Checklist

- [x] **Security Hardening (Module 11):**
  - [x] Add `MAX_CONTENT_LENGTH = 10 * 1024 * 1024` (10MB limit) in `config.py`.
  - [x] Install `Pillow` and validate uploaded image magic bytes, strip EXIF, and re-encode to WebP/JPEG.
  - [x] Implement CSRF token validation on state-modifying requests (`POST`/`PUT`/`PATCH`/`DELETE`).
  - [x] Add sliding window rate limiting to protect `/auth/login`, `/auth/register`, and `/marketplace/products/<slug>/reports`.
  - [x] Add `Flask-CORS` with an environment-driven origin whitelist.
- [x] **User Account Self-Service:**
  - [x] Implement password reset endpoints (`POST /auth/forgot-password`, `POST /auth/reset-password`).
  - [x] Implement change password endpoint (`POST /auth/change-password`).
  - [x] Implement profile update endpoint (`PATCH /auth/profile`).
  - [x] Create an `addresses` table and CRUD endpoints for buyer saved addresses.
- [x] **Notifications & Messaging (Module 09):**
  - [x] Create `Notification` model with `user_id`, `title`, `body`, `type`, `read_at`.
  - [x] Add endpoints: `GET /api/v1/notifications`, `PATCH /api/v1/notifications/<id>/read`, `POST /api/v1/notifications/mark-all-read`.
  - [x] Add buyer-to-admin support messaging (`/api/v1/support/tickets`, `/api/v1/admin/support/tickets`).
  - [x] Integrate transactional email service with console/mock fallback and SMTP transport for order and shipping events.
- [x] **Payments & Fulfillment:**
  - [x] Implement payment service abstraction with Cash on Delivery and GCash/Sandbox gateways, with idempotent webhook processing (`POST /api/v1/payments/webhook`).
  - [x] Implement bulk CSV product import endpoint (`POST /api/v1/admin/products/import-csv`) with formula injection defense (`'=`).
  - [x] Implement post-delivery return & refund (RMA) workflow (`POST /api/v1/orders/<order_number>/returns`, `PATCH /api/v1/admin/returns/<id>/status`).
  - [x] Implement discounts & coupons domain (`POST /api/v1/coupons/validate`, admin CRUD `/api/v1/admin/coupons`).
- [x] **Production Deployment (Module 12):**
  - [x] Create `Dockerfile` and `docker-compose.yml`.
  - [x] Add a production WSGI runner script with Waitress and Gunicorn fallback (`wsgi.py`, `gunicorn.conf.py`).
  - [x] Add health liveness `/health` and readiness `/health/ready` database checks.
  - [x] Implement database backup and restore scripts (`scripts/backup_db.py`, `scripts/restore_db.py`).
  - [x] Add structured JSON logging with request IDs.
