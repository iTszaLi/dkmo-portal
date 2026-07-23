---
name: Read access model
description: DKMO portal read vs write authorization model; informs search/aggregation endpoints.
---
All portal GET/list endpoints (members, payments, frf, loans, documents, welfare, sponsors, events, applications) are `requireAuth` only — every authenticated role (admin/finance/event/viewer) may read every module, and the sidebar shows all pages to all roles. Only mutations (and audit logs + settings + duplicates) are role-gated.
**Why:** deliberate product choice; a code review flagged the global /api/search aggregating these entities as "data exposure", but it merely mirrors existing read access.
**How to apply:** when adding cross-module read/aggregation endpoints (search, dashboards), auth-only gating is consistent; do not invent per-role read filtering unless the user asks. Audit-log-derived features stay admin/finance only.
