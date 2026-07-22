# DKMO Management Portal

Donation/membership management portal for **DKMO (Dakshina Karnataka Muslim Ookota)** — a community trust collecting monthly contributions from members across multiple cities and countries.

## What it does

Admins sign in to a secure dashboard that tracks members, records monthly payments, surfaces unpaid/partial-paid members, sends WhatsApp reminders, and exports/prints reports & receipts.

## Stack

- Monorepo: pnpm workspace
- Frontend: React + Vite + TypeScript + Tailwind v4 + shadcn/ui + Recharts (artifact: `artifacts/dkmo-portal`)
- Backend: Express + Drizzle ORM (artifact: `artifacts/api-server`)
- Database: Replit Postgres
- Auth: Clerk (whitelabel, custom green DKMO branding)
- Contract: OpenAPI in `lib/api-spec/openapi.yaml` → generated React Query hooks (`@workspace/api-client-react`) and Zod schemas (`@workspace/api-zod`)

## Pages

- `/sign-in`, `/sign-up` — branded Clerk auth (sign-in is the landing page; signed-in users redirect to `/dashboard`)
- `/dashboard` — summary cards, monthly collection chart, payment-method breakdown, recent payments
- `/members` — searchable list with add/edit/delete
- `/members/:id` — member detail with full payment history and totals
- `/payments` — all payments with filters; record new payment
- `/pending` — unpaid/partial members for selected month + WhatsApp reminder action
- `/reports` — export Excel/PDF, print individual receipts with DKMO branding

## Data model (`lib/db/src/schema/`)

- `members` — fullName, mobileNumber, membershipId (unique, server-assigned sequential `DKMO-XXXX` from `dkmo_id_seq` via `next_dkmo_number()`; permanent, never reused, immutable via API), city, country, designation, membershipFee (one-time 100 SAR), feeStatus (paid|pending|unpaid), feePaidAt, feeUpdatedBy, refMemberName, refMemberId
- `payments` — memberId (FK cascade), month (YYYY-MM), amountPaid, paymentMethod, receiptNumber, notes, paidAt

## API surface (all under `/api`)

- CRUD: `/members`, `/members/:id`, `/payments`, `/payments/:id`
- Dashboard: `/dashboard/summary`, `/dashboard/pending`, `/dashboard/recent-payments`, `/dashboard/monthly-collection`, `/dashboard/payment-method-breakdown`
- Auth: `/me` (current Clerk user)

All routes are protected by `requireAuth` middleware that uses Clerk's `getAuth(req)`.

## Workflow notes

- After OpenAPI spec changes: `pnpm --filter @workspace/api-spec run codegen`
- After DB schema changes: `pnpm --filter @workspace/db run push`
- Tailwind v4 with Clerk theme requires `tailwindcss({ optimize: false })` in `vite.config.ts` and `@layer theme, base, clerk, components, utilities;` at the top of `src/index.css`
