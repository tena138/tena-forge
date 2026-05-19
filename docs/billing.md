# Billing

Billing is abstracted in `packages/billing`.

Providers:

- `mock`: local development and tests.
- `toss`: Toss Payments-compatible implementation placeholder.
- `portone`: PortOne-compatible implementation placeholder.

Plans:

- Free: 3 jobs/month, 30 pages/month, 100MB storage, watermark.
- Pro: 100 jobs/month, 1,000 pages/month, 5GB storage, custom templates.
- Team: 500 jobs/month, 10,000 pages/month, 50GB storage, members.
- Enterprise: custom limits and contract.

The web API checks subscription status and usage before creating processing jobs. Completion writes `usage_logs` so monthly limits can be enforced consistently.

Development mode uses `BILLING_PROVIDER=mock`. Real providers should verify webhook signatures and update the `subscriptions` table from provider events.
