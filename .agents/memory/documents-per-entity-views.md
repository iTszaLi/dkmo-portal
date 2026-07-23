---
name: Documents per-entity views
description: How to correctly list documents for a single member/entity in the DKMO portal
---

The `/api/documents` list endpoint is paginated (default `pageSize=25`, max 100).

**Rule:** Any per-entity documents view (e.g. a member's Documents tab) must filter
server-side via `linkedEntityType` + `linkedEntityId` query params (now supported by the
route and `useListDocuments` params). Do NOT fetch the unfiltered list and client-filter —
the entity's docs may sit on page 2+ and silently appear missing.

**Why:** Documents use a generic `linkedEntityId`/`linkedEntityType` model (no per-feature
FK column). With hundreds of members, an unfiltered page-1 fetch hides most records.

**How to apply:** `useListDocuments({ linkedEntityType: "member", linkedEntityId: id, pageSize: 100 })`.
Standard member doc checklist labels are stored in the document `title` (Passport, Iqama,
Photo, Membership Form) with `category: "member_docs"`.

**Mutation authz:** document create/update/delete/version routes require admin|finance, and docs with linkedEntityType `frf_claim` are admin-only (canMutateDoc helper) — UI hiding alone was flagged as broken access control in review; keep server-side checks when adding new linked entity types.
