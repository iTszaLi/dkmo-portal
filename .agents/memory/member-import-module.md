---
name: Legacy member import
description: How the Import Members module works (analyze/commit/rollback) and its safety rules
---
- Client parses TXT/CSV/XLSX; server re-cleans/re-validates on both analyze (dry run) and commit — client payload is never trusted. Admin-only.
- Inserts get fresh DKMO IDs from the shared sequence; legacy ID stored in members.legacy_member_id. All inserts/updates in one transaction; members tagged with import_batch_id.
- **Why rollback is guarded:** undo must never cascade-delete financial data. The dependency check (payments/frf paid/loans) and the delete run in ONE transaction with a guarded DELETE + abort if any member survives — a pre-check outside the transaction is a race (reviewer-confirmed).
- Duplicate resolutions are per-row (skip/update/import); "update" only fills blank fields, never overwrites.
- Dev API testing tip: session cookie is Secure — curl needs `-H "X-Forwarded-Proto: https"` against localhost:8080 or login sets no cookie.
