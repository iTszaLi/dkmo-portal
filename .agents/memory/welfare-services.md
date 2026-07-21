---
name: DKMO welfare/community services system
description: How the unified welfare-request system is structured and why request numbers are generated differently from FRF.
---

# DKMO Community Services / welfare

One `welfare_requests` table + one route + one generic React component
(`WelfareModule`) serve all 5 service types (medical_aid, general_relief,
emergency_response, air_ticket, india_rep). Type-specific form fields live in a
UI config (`src/lib/welfare-config.tsx`), stored in the row's `details` jsonb.
Shared workflow: submitted → under_review → approved/rejected → completed, with
per-stage `*At`/`*By` columns.

## Request number generation
Unlike FRF (which uses a manually-created `next_frf_number()` SQL function),
welfare request numbers (prefixes MED/GRF/EMR/AIR/IRS) are generated in
**app code** by scanning the max numeric suffix per serviceType, then inserting
with a **retry-on-unique-violation loop** (PG error code 23505, up to 5 tries).

**Why:** avoids needing another manually-created DB function (the FRF one has to
be created by hand and is easy to forget on a fresh DB). The retry loop covers
the concurrency gap the app-code scan would otherwise leave.
**How to apply:** if adding more service types or a similar per-type numbered
entity, reuse this retry pattern rather than a raw scan-then-insert.

## Linking, not rebuilding
FRF Claims (`/frf`) and Loans (`/loans`) are separate pre-existing systems. The
Community Services hub (`/services`) only links to them — do NOT fold them into
the welfare table/route.
