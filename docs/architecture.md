# Tena Forge Architecture

Tena Forge is structured as a production SaaS monorepo.

- `apps/web`: Next.js App Router UI and lightweight API routes.
- `apps/worker`: Python FastAPI worker for document processing, AI extraction, HTML/PDF generation, and storage uploads.
- `packages/shared`: shared TypeScript types, Zod schemas, plan limits, and built-in templates.
- `packages/database`: Supabase database access helpers.
- `packages/billing`: provider abstraction for mock, Toss, and PortOne billing.
- `supabase/migrations`: Postgres schema with workspace-scoped RLS.

The web app owns user-facing workflows and creates queued jobs. The worker processes jobs asynchronously, stores extracted items, creates output files, and logs usage. Supabase Auth handles identity. Supabase Postgres and Storage hold application data and files.

## Security Model

All workspace-scoped tables have Row Level Security. API routes also verify workspace membership before reads and writes. Admin routes require `users_profile.role = 'admin'`.

Uploads use signed Supabase Storage URLs. Files are validated by MIME type, size, plan limits, and workspace membership before processing.

## Processing Flow

1. User requests signed upload URL.
2. Browser uploads to Supabase Storage.
3. Browser completes file metadata.
4. API creates a queued job after subscription and usage checks.
5. Worker downloads the source file.
6. Worker extracts text/images, calls the AI provider, normalizes items, and writes `extracted_items`.
7. Worker generates preview/output files and writes `outputs`.
8. Usage and audit logs are recorded.

## Future Extensions

- BullMQ-to-Python queue bridge or dedicated worker consumer.
- OCR for image-only documents.
- Billing webhook event persistence.
- Enterprise SSO and advanced audit export.
