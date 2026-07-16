---
name: DKMO payments & recruitment model
description: How the DKMO contribution ledger and recruitment leaderboard are modeled — no monthly dues, FRF contributions are payments rows, referral keys on member UUID.
---

# DKMO payments & recruitment model

There are NO monthly dues anywhere in DKMO. Two money concepts only:
- One-time membership fee: SAR 100 (mirrored on `members.feeStatus`, also a `payments` row with `paymentType="membership_fee"`).
- FRF contribution: per approved FRF claim (default SAR 50, per-claim configurable via `frf_claims.contribution_amount`), charged to every *active* member (feeStatus=paid AND frfStatus=active) at approval time. Since the July 2026 redesign there IS a `frf_contributions` ledger table (one row per claim×member, unique index) that is the source of truth for who owes what; `payments` rows with `paymentType="frf_contribution"` + `frfClaimId` record actual money and sync the ledger atomically (mark paid on create, revert to pending on delete). "Overdue" is derived (pending + claim approved >30 days), never stored.

`payments` has no `month` column. Status is `paid|pending|overdue`; fields `amountDue`, `dueDate`, `paymentType`, `frfClaimId`.

**Why:** the overhaul collapsed dues into a single contributions ledger so FRF claims and membership fees share one table and one route/UI.

**Recruitment leaderboard keys on `members.id` (UUID), NOT `membershipId`.**
- `members.refMemberId` must store the recruiter's UUID.
- In `scripts/src/seed.ts` this requires a two-pass insert: insert all members first (refMemberId blank), then UPDATE refMemberId to the actual inserted recruiter UUIDs. Setting membershipId there silently produces an empty leaderboard.

**How to apply:** when seeding or adding referral/contribution features, never reintroduce monthly dues, keep payments + frf_contributions ledger in sync inside one DB transaction, and resolve referral links to UUIDs after members exist.
