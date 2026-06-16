---
name: FRF Ambassador Referral System
description: Architecture decisions for the FRF Ambassadors leaderboard and referral tracking feature.
---

# FRF Ambassador Referral System

## Data model
- Referral fields on `frfMembershipsTable`: `referrerMemberName`, `referrerDkmoId`, `referrerFrfNumber`, `referralCode`, `referralDate` — all added to `lib/db/src/schema/frf_memberships.ts`
- `frfAmbassadorHistoryTable` for preserved award history — also in `frf_memberships.ts` (not a separate file)
- Both are auto-exported via `lib/db/src/schema/index.ts`

## API
- `GET /api/frf/ambassadors?period=all-time|yearly|quarterly|monthly` — live rankings from approved memberships, filtered by `approvedAt` for period-scoped queries. Uses in-memory JS filtering (not SQL) to avoid date-casting complexity.
- CRUD at `/api/frf/ambassador-history` — POST, PATCH/:id, DELETE/:id
- Route file: `artifacts/api-server/src/routes/frf-ambassadors.ts`; registered in `index.ts` BEFORE `membersRouter`

## Frontend
- Direct fetch pattern (no generated hook): `const bp = import.meta.env.BASE_URL.replace(/\/$/, ""); fetch(\`${bp}/api/frf/ambassadors?...\`, { credentials: "include" })`
- Period filtering: all-time (default), yearly (year param), quarterly (year+quarter params), monthly (month=YYYY-MM)
- Movement indicators computed by comparing current period rank vs all-time rank

## Why direct fetch instead of generated hooks
Generated React Query hooks come from OpenAPI codegen; ambassador endpoints were added after codegen was last run. Direct fetch + useQuery avoids re-running codegen for this feature.

**How to apply:** Any new API endpoint that isn't in the OpenAPI spec should use the direct fetch pattern in the frontend until codegen is updated.
