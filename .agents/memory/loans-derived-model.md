---
name: Loans derived-status model
description: Loans module derives balance/status from payments; rules for math, legacy data, and roles
---
- Loan balances/status are DERIVED, never edited: totalPaid = legacy paidEmis×emiAmount baseline + sum(loan_payments); outstanding ≤ 0 → closed; expected installments (k-th due k FULL months after disbursement — same-day loan owes nothing) > paid → overdue; else active. Stored `loans.status` is synced after payment create/delete AND admin edits so other routes reading raw status stay correct.
- "Due this month" = installment falls due within the current calendar month and paid count doesn't cover it — not merely "active with balance".
- Convenor is enforced server-side: non-admin creates always record the logged-in user's display name; only admins may assign someone else. UI disables the field for non-admins.
- Payment recording rejects overpay and already-closed loans (409). Duration auto = ceil(principal/emi); create is admin+finance, loan edit/delete + payment delete admin-only.
**Why:** user wants a convenor-proof module — no manual status/EMI counters; review round caught same-day-overdue and convenor-spoofing bugs.
**How to apply:** any future loans change must keep status derivation single-sourced in the API route and re-sync stored status after anything affecting schedule or balance.
