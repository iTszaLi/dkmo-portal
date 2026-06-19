---
name: DKMO duplicate prevention
description: How membership-application duplicates (mobile/email) are prevented vs. how members-table duplicates are handled differently.
---

# DKMO duplicate prevention

Two DIFFERENT duplicate policies coexist — do not unify them.

## Membership applications (`dkmo_memberships`) = STRICT
- DB partial unique indexes on `mobile_saudi` and `lower(email)`, both `WHERE status <> 'rejected' AND value <> ''`. Rejected applications can re-apply.
- Backend pre-checks (`findMembershipDuplicates`, digit-normalized mobile + lowercased email, skips rejected + excludeId) on every write path: public `/apply`, admin POST, and PATCH.
- PATCH must also block **rejected→active reactivation** collisions (status-only change moves the row from excluded to indexed), not just contact edits. Pre-check fetches the current row to compute effective mobile/email/status.
- Inserts and the PATCH update are wrapped to map PG 23505 → friendly 409 as a race backstop.

**Why:** users tried submitting the same person twice; rejected ones legitimately need to re-apply.

## Members table (`members`) = SOFT (client-only)
- NO server-side hard 409 block. Members can legitimately share a mobile (family). Removing the server block was required so the admin "Save anyway" confirm actually works.
- Duplicate handling is a client-side confirm dialog in `members.tsx` only.

**Why:** an admin "exception" path must be able to override; a server hard-block defeats the confirm UI.

## Public check endpoint
- `GET /dkmo/memberships/check-duplicate?mobile=&email=` is PUBLIC → must mount before `router.use(requireAuth)`.
- Anti-enumeration: returns booleans only (`{mobileExists,emailExists}`), requires mobile ≥10 digits / email containing `@`, never returns PII.

## Duplicate dashboard is admin-only
- Data endpoint `GET /dkmo/memberships/duplicates` is gated with `requireRole("admin")`; frontend `/duplicates` route uses `roles={["admin"]}`. Sidebar hiding alone is not access control.
