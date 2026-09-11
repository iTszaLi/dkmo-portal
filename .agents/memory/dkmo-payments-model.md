---
name: DKMO payments & recruitment model
description: How the DKMO contribution ledger and recruitment leaderboard are modeled — no monthly dues, FRF contributions are payments rows, referral keys on member UUID.
---

# DKMO payments & recruitment model

There are NO monthly dues anywhere in DKMO. Two money concepts only:
- One-time membership fee. SAR 100 may be used for current portal registration workflows, but it is never a default historical obligation for Access-imported members.
- FRF contribution: fixed SAR 50 per eligible member per approved FRF case; new case creation must enforce 50 while preserving any historical case values. Since the July 2026 redesign there IS a `frf_contributions` ledger table (one row per claim×member, unique index) that is the source of truth for who owes what; `payments` rows with `paymentType="frf_contribution"` + `frfClaimId` record actual money and sync the ledger atomically (mark paid on create, revert to pending on delete). Reconciliation is additive and idempotent: it creates missing pending rows but never overwrites paid, partial, exempt, cancelled, or existing pending rows. "Overdue" is derived (pending + claim approved >30 days), never stored.

**Legacy membership-fee rule:** `01_Main_new` rows classified as life-membership records are the source of truth and link to members only by exact Access member ID. Preserve every original source row, including blank values. An imported member with no matching row is `not_applicable`, never unpaid and never included in balances/reminders. A row with insufficient payment evidence is `review`, not paid or unpaid.

**Why:** the Access reconciliation count “members without a membership ledger record” was previously mislabeled as unpaid, and zero/default amounts were shown as if they were real fee assessments.

**How to apply:** derive imported fee amount, date, status, and history only from preserved Access rows. Do not create active payment records or SAR 100 obligations to fill historical gaps.

`payments` has no `month` column. Status is `paid|pending|overdue`; fields `amountDue`, `dueDate`, `paymentType`, `frfClaimId`.

**Why:** the overhaul collapsed dues into a single contributions ledger so FRF claims and membership fees share one table and one route/UI.

**Recruitment leaderboard keys on `members.id` (UUID), NOT `membershipId`.**
- `members.refMemberId` must store the recruiter's UUID.
- In `scripts/src/seed.ts` this requires a two-pass insert: insert all members first (refMemberId blank), then UPDATE refMemberId to the actual inserted recruiter UUIDs. Setting membershipId there silently produces an empty leaderboard.

**How to apply:** when seeding or adding referral/contribution features, never reintroduce monthly dues, keep payments + frf_contributions ledger in sync inside one DB transaction, and resolve referral links to UUIDs after members exist.

**FRF partial/exempt aggregation rule:** contribution statuses now include `partial` and `exempt`. Every aggregation (claim collection, member summary, dashboard summary, frf-overview) must: use `amountPaid` (capped at `amount`) for collected totals, and exclude both `cancelled` and `exempt` rows from expected/outstanding math. The status PATCH endpoint rejects exempting a row that already has payments (409); reverting exempt→pending recomputes to paid/partial from amountPaid.

**Strict FRF eligibility rule:** membership approval never activates FRF. Only a real, successful portal membership-fee payment makes a non-legacy member FRF-eligible; unpaid, pending, partial, exempt, not-applicable, review, refunded, and cancelled membership states cannot create or collect new FRF dues. Membership payment create/update/delete/reversal must reconcile fee status and FRF rows in one transaction, while paid/partial historical FRF rows remain visible as history.

**Why:** FRF charges were previously provisioned for newly approved or unpaid members, and reversing a membership payment could leave current FRF eligibility active.

**How to apply:** enforce this in server-side eligibility, contribution generation, payment validation, pending/report queries, imports, and UI controls; treat the server rule as authoritative over stored display flags. The canonical cached status is `active` exactly when `feeStatus` is `paid`, otherwise `inactive`; no independent FRF toggle or suspended override is valid.
