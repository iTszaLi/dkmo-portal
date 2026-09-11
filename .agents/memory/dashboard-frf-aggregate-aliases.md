---
name: Dashboard FRF aggregate aliases
description: SQL qualification rule for dashboard contribution totals
---

**Rule:** In dashboard FRF aggregate queries, qualify contribution fields such as amount, amount_paid, status, and member_id with the contribution-table alias after joining claims and members.

**Why:** Those tables share column names; unqualified fields can make the entire authenticated dashboard summary fail at runtime with an ambiguous-column database error.

**How to apply:** Review every future raw SQL change in the dashboard summary and keep aggregate/filter expressions explicitly tied to their source table.