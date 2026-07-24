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

**FRF reminders removed (user decision, Jul 2026):** The FRF Reminders page, its route, the "Send FRF Reminder" button on the FRF page, and the dashboard FRF Reminder widget were all removed — the director decided FRF contributors don't need reminders. Do not re-add FRF reminder surfaces unless explicitly asked. Membership-fee reminders (Payments page) remain.

**One-active-case rule (Jul 2026, user decision):** Only ONE FRF collection case (claim status 'approved') may be active at a time. Enforced by DB partial unique index `frf_claims_single_active` (mapped to HTTP 409) + read-check in POST/PUT /frf/claims. Contributions are generated on APPROVAL, not creation. /frf/pending-fees returns only the active (approved) case. 'disbursed' = completed/closed history. Seed has exactly 7 FRF claims (3 disbursed, 1 approved active, 1 under_review, 1 pending, 1 rejected).
