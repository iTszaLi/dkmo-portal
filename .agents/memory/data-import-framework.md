---
name: Generic data-import framework
description: How Payments/Receipts/FRF/Sponsors/Events legacy imports work vs the Members importer
---

- All non-member imports share one server route file with `/api/import/:entity/{analyze,commit,history,:id/rollback}` and one generic client wizard (`/import-data/:entity` + hub at `/import-data`); the Members importer is separate and intentionally untouched.
- `import_batches.entity` column scopes history per module; created rows are stamped with `import_batch_id` (payments, receipts, frf_contributions, sponsors, events) so rollback is a simple delete-by-batch.
- **Why:** rollback of the members import deletes members guarded by dependents; for other entities delete-by-batch-id is safe and simpler.
- Rules discovered in review: payments must use the canonical `frf_contribution` payment type (not ad-hoc values like `frf_fee`); any `ALTER TABLE import_batches` in migrate.ts must come AFTER its `CREATE TABLE` (script order matters on a fresh DB).
- FRF contribution import requires the claim to already exist (matched by claimant name/title); rows insert contributions directly without a payments-ledger row — acceptable for legacy backfill, but not linked to payment records.
- Member matching for legacy files: legacy ID → DKMO ID → mobile → exact full name.
- Import wizards send client-parsed rows, but the server is authoritative (re-clean/re-validate/re-dup-check on analyze AND commit); the members wizard also saves the column mapping in localStorage keyed by header signature.
