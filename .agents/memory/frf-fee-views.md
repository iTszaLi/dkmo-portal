---
name: FRF fee views pattern
description: How FRF (SAR 50/case) fee UIs are structured vs membership fee (SAR 100 one-time) across Payments and Reports (Pending module merged into Payments July 2026).
---

- Membership fee (SAR 100 one-time, on members.fee_status) and FRF fees (SAR 50 per member per FRF case, in frf_contributions ledger) must never be mixed in one table or total.
- **Why:** user explicitly requires the two systems separate; FRF is per-case, membership is one-time.
- **How to apply:** Payments page uses segmented toggles (Membership/FRF + status views All/Paid/Pending/Unpaid/Overdue; standalone Pending page removed, /pending redirects to /payments) (plain buttons with aria-pressed, NOT role=tablist — reviewer flagged incomplete tab semantics). FRF views read titled frf_claims as "cases": per-case data via GET /frf/claims/:id/collection; cross-case pending via GET /frf/pending-fees (derives pending/overdue/partial). Reports: /reports/frf-fees per-case, /reports/loan-recovery aggregates loans by convenorName client-side.
- Export rule (review-enforced): PDF/Excel meta + totals must be computed from the exported (filtered) rows and labeled "Filtered view" when filters active.
- Bulk WhatsApp dialog: lock title/targets at open time; clear row selection on tab switch.

- **FRF pending parity (user rule, July 2026):** Every surface that lists pending FRF fees (Payments FRF tab Pending view, FRF Reminders page, any future UI) MUST derive from GET /frf/pending-fees so lists/names/totals are identical. Never derive pending FRF lists from member.frfOutstanding or per-case collection filters.

**FRF reminder status:** An explicit later request reintroduced the FRF WhatsApp reminder action on Payments → FRF Fees. Keep it limited to the approved active case, membership-fee-paid contributors, unpaid statuses, and valid mobile numbers; the former standalone FRF Reminders page/widget remains removed.

**Why:** The explicit request changed the earlier product decision, but the same active-case and eligibility rules still protect against reminding members about historical, closed, or ineligible FRF obligations.

**How to apply:** Reuse the membership reminder's number normalization and `wa.me` link behavior. Do not add a separate tracking system unless the membership reminder system gains one.

**Bilingual reminder flow:** FRF reminders require an English/Kannada choice and a preview of the exact dynamic message before WhatsApp opens. Keep names, case titles, IDs, and SAR values unchanged in Kannada.

**Why:** Committee members need to send a natural local-language reminder while verifying the real recipient and active-case details before sending.

**How to apply:** Use simple conversational Kannada, keep the confirmation as a user gesture, and never mutate payment or contribution status from the reminder flow.

**One-active-case rule (Jul 2026, user decision):** Only ONE FRF collection case (claim status 'approved') may be active at a time. Enforced by DB partial unique index `frf_claims_single_active` (mapped to HTTP 409) + read-check in POST/PUT /frf/claims. Contributions are generated on APPROVAL, not creation. /frf/pending-fees returns only the active (approved) case. 'disbursed' = completed/closed history. Seed has exactly 7 FRF claims (3 disbursed, 1 approved active, 1 under_review, 1 pending, 1 rejected).

## Row actions & auto receipts (Jul 2026)
- FRF Fees table has a "Responsible / Referred By" column (members.refMemberName = the referrer responsible for collecting from that member); pending-fees API now returns refMemberName too. Column is in PDF/Excel exports (10 cols).
- Per-row Actions menu: Mark Paid posts a real payment (paymentType frf_contribution + frfClaimId) with an auto-generated receipt number `DKMO-FRF-YYYYMM-<6 digits>`; server transactionally syncs the ledger so Paid On/Receipt No. populate automatically. Exempt hidden for partial rows (server 409s when amountPaid>0).
- **POST/DELETE /payments are role-gated admin+finance** (was auth-only; closed after review flagged the Mark Paid path).
