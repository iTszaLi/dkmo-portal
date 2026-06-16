---
name: Public DKMO track endpoint must return minimal DTO
description: Unauthenticated membership-status lookup must not leak full PII or allow partial enumeration.
---

# Public application-status tracking endpoint

The public, unauthenticated `GET /api/dkmo/memberships/track` (used by the login "Check Status" button → `/dkmo-track` page, and by the post-submit poll in `dkmo-apply`) must return ONLY a minimal status DTO: `dkmoNumber`, `fullName`, `status`, `declineReason`, `membershipDate`, `createdAt`.

**Why:** it originally reused `membershipToApi(...)`, which leaks passport/iqama/address/contact PII to anyone unauthenticated. It also matched mobile with `includes(q)`, enabling record enumeration via partial inputs.

**How to apply:** any new public lookup endpoint gets its own dedicated minimal mapper — never reuse the authenticated full-record mapper. Match identifiers exactly (dkmoNumber exact; mobile compared on digits-only with a full-length requirement), not by substring. If you add fields to the authenticated mapper, do NOT add them to the public track mapper unless they are safe to expose.
