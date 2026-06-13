# Tena Forge

Tena Forge is a Korean academy content operations platform. It supports private document archiving, PDF/problem processing, template-based outputs, subscriptions, and a curated marketplace where only approved creators can sell educational content.

## Architecture

- Frontend: `frontend/` Next.js App Router + TypeScript. This is the active product web surface.
- Backend: `backend/` FastAPI + SQLAlchemy
- Local DB: `backend/tenaforge.db` SQLite for development
- Production target: PostgreSQL/Supabase-compatible schema
- Storage: local private-path metadata today, designed for Supabase Storage/S3 signed URLs
- Payments: mock provider today, with clean extension points for Toss Payments, PortOne, or Stripe

## Important Product Rules

- Normal users can upload/process their own materials and buy marketplace products.
- Normal users cannot sell marketplace products.
- Creator applicants cannot publish products.
- Only admin-approved creators can create product drafts and submit products for review.
- Products must be approved by an admin before creators can publish them.
- Buyers can access downloads only through license checks and signed URL endpoints.
- Purchased content grants a license; ownership is not transferred.

## Local Development

Start backend:

```powershell
$env:DATABASE_URL='sqlite:///./tenaforge.db'
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Start frontend:

```powershell
cd frontend
npm run dev -- -H 0.0.0.0 -p 3001
```

From the repository root, the equivalent command is:

```powershell
npm run dev:web
```

Open:

- App: `http://localhost:3001`
- API docs: `http://localhost:8000/docs`

## Seed Accounts

Local startup seeds core SaaS data:

- Admin: `admin@tenaforge.com` / `AdminTest!2026`
- Creator: `creator@tenaforge.com` / `CreatorTest!2026`
- Normal user created during development: `user@tenaforge.com` / `UserTest!2026`

The admin role is also inferred from `ADMIN_EMAILS`.

## New Backend Domains

### Subscription / Usage

Tables:

- `plans`
- `subscriptions`
- `subscription_events`
- `usage_logs`

Endpoints:

- `GET /api/saas/plans`
- `GET /api/saas/billing/summary`
- `POST /api/saas/billing/checkout`

`POST /api/saas/billing/checkout` uses the mock payment provider in development.

### Processing Jobs

Tables:

- `jobs`
- `job_files`
- `job_outputs`
- `usage_logs`

Endpoints:

- `POST /api/saas/jobs`
- `GET /api/saas/jobs`
- `GET /api/saas/jobs/{job_id}`
- `POST /api/saas/jobs/{job_id}/cancel`
- `POST /api/saas/jobs/{job_id}/download`

The existing PDF extraction batch system remains intact. These tables provide the production SaaS job foundation.

### Creator Approval

Tables:

- `creator_applications`
- `creator_profiles`
- `payout_accounts`
- `user_roles`

Endpoints:

- `GET /api/creators/application`
- `POST /api/creators/application`
- `GET /api/creators/me`
- `GET /api/admin/saas/creator-applications`
- `POST /api/admin/saas/creator-applications/{id}/approve`
- `POST /api/admin/saas/creator-applications/{id}/reject`

Approval creates a verified creator profile, payout account, and grants the `creator` role.

### Curated Marketplace

Tables:

- `products`
- `product_versions`
- `product_assets`
- `product_license_tiers`
- `marketplace_orders`
- `marketplace_order_items`
- `marketplace_payments`
- `marketplace_refunds`
- `licenses`

Creator endpoints:

- `GET /api/creator/products`
- `POST /api/creator/products`
- `PATCH /api/creator/products/{id}`
- `POST /api/creator/products/{id}/versions`
- `POST /api/creator/products/{id}/license-tiers`
- `POST /api/creator/products/{id}/submit`
- `POST /api/creator/products/{id}/publish`

Public/buyer endpoints:

- `GET /api/market/products`
- `GET /api/market/products/{slug}`
- `POST /api/market/products/{id}/purchase`
- `GET /api/market/library`
- `POST /api/market/licenses/{id}/download`

Admin review endpoints:

- `GET /api/admin/saas/product-review-queue`
- `POST /api/admin/saas/products/{id}/approve`
- `POST /api/admin/saas/products/{id}/reject`
- `POST /api/admin/saas/products/{id}/takedown`

Only `published` products appear in `/api/market/products`.

### Payouts / Commission

Tables:

- `creator_balance_ledger`
- `payouts`
- `payout_items`
- `platform_settings`

Default commission rate is 10%. The commission snapshot is stored on each order.

Admin endpoints:

- `GET /api/admin/saas/payouts`
- `POST /api/admin/saas/payouts/{id}/mark-paid`

Payouts are ledger-based and admin-controlled. No automatic bank transfer is performed.

### Legal / Moderation

Tables:

- `copyright_reports`
- `audit_logs`

Endpoints:

- `POST /api/legal/copyright-reports`
- `GET /api/admin/saas/copyright-reports`
- `GET /api/admin/saas/audit-logs`

Sensitive actions are audited, including creator approval, product review, purchases, signed download generation, and payouts.

## New Frontend Pages

- `/academy` - academy production console
- `/archive/new` - canonical upload and archiving flow
- `/problems/review` - extraction review queue
- `/problems` - private problem archive
- `/problem-sets` - set creation and export
- `/templates/studio` - canonical visual template editor
- `/student-management` - academy student management
- `/student` - student app
- `/billing`, `/terms`, `/privacy`, `/refund-policy`, `/copyright-policy`

## Academy Student Access System

The academy/student foundation adds reusable academy seats, rotatable invite codes, student academy memberships, classes, assignments, timed-test sessions, calendar events, material delivery logs, quota ledgers, watermarked export records, and wrong-answer notebook records.

Core routes:

- `GET /api/academy/plans`
- `GET/PATCH /api/academy/{academy_id}/billing`
- `GET/POST /api/academy/{academy_id}/seats`
- `POST /api/academy/{academy_id}/seats/{seat_id}/rotate-code`
- `POST /api/academy/{academy_id}/seats/{seat_id}/release`
- `POST /api/student/academy-keys/claim`
- `GET /api/student/academies`
- `GET /api/student/quotas`
- `GET/POST /api/academy/{academy_id}/classes`
- `GET/POST /api/academy/{academy_id}/assignments`
- `GET /api/student/assignments`
- `POST /api/student/assignments/{assignment_id}/submit`
- `POST /api/student/tests/{assignment_id}/start`
- `POST /api/student/tests/{session_id}/submit`
- `POST /api/calendar/events`
- `GET /api/student/calendar`
- `POST /api/academy/{academy_id}/materials`
- `GET /api/student/materials`
- `POST /api/student/materials/{material_id}/download`
- `GET/POST /api/student/wrong-answers`
- `POST /api/student/wrong-answers/export`

Local SQLite development creates these tables on backend startup. Migration-based deployments should run Alembic revision `0012_academy_student_access`.

## Manual Test Flow

1. Log in as normal user.
2. Visit `/creator/products`: product creation should be blocked.
3. Visit `/creator/apply` and submit an application.
4. Log in as admin and open `/admin/saas`.
5. Approve the application.
6. Log in as the approved creator and create a product in `/creator/products`.
7. Add license tiers through the API or extend the product editor UI.
8. Submit the product for review.
9. Admin approves it.
10. Creator publishes it.
11. Buyer purchases it through `/api/market/products/{id}/purchase`.
12. Buyer sees the license in `/purchases`.

## Academy / Student Manual Test Flow

1. Log in as an academy account and open `/academy`.
2. Create a seat and copy the one-time invite code.
3. Log in as another account that represents a student.
4. Open `/student` and register the academy key.
5. Confirm the connected academy appears and quota increases.
6. Return to `/academy`, release the seat, and confirm a rotated code is generated.
7. Create a class and assignment from `/academy`.
8. Return to `/student` and submit the assignment.

## Security Notes

- Server-side role checks are implemented in `backend/services/saas_security.py`.
- Frontend route hiding is not trusted for authorization.
- Paid downloads require an active license before signed URL generation.
- Current signed URLs are local-development placeholders. Production should replace `create_signed_url` with Supabase Storage or S3 signed URLs.
- Payment webhooks are scaffolded through subscription events and mock payments. Real Toss/PortOne signatures must be verified before updating subscriptions or orders.

## Future Work

- Replace local signed URL placeholder with Supabase/S3 signed URLs.
- Add file upload endpoints for product assets.
- Add full product editor for versions, files, preview images, and license tiers.
- Add real payment provider implementations.
- Add refund workflow and payout CSV export.
- Add database migrations for PostgreSQL deployment.
- Add automated tests for role checks, product publishing permissions, buyer license access, webhook idempotency, and payout calculation.
