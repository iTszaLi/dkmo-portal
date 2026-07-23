---
name: FRF fee views pattern
description: How FRF (SAR 50/case) fee UIs are structured vs membership fee (SAR 100 one-time) across Payments, Pending, and Reports.
---

- Membership fee (SAR 100 one-time, on members.fee_status) and FRF fees (SAR 50 per member per FRF case, in frf_contributions ledger) must never be mixed in one table or total.
- **Why:** user explicitly requires the two systems separate; FRF is per-case, membership is one-time.
- **How to apply:** Payments and Pending pages use a segmented toggle (plain buttons with aria-pressed, NOT role=tablist — reviewer flagged incomplete tab semantics). FRF views read titled frf_claims as "cases": per-case data via GET /frf/claims/:id/collection; cross-case pending via GET /frf/pending-fees (derives pending/overdue/partial). Reports: /reports/frf-fees per-case, /reports/loan-recovery aggregates loans by convenorName client-side.
- Export rule (review-enforced): PDF/Excel meta + totals must be computed from the exported (filtered) rows and labeled "Filtered view" when filters active.
- Bulk WhatsApp dialog: lock title/targets at open time; clear row selection on tab switch.
