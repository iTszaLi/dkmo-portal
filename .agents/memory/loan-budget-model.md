---
name: Loan budget model
description: Loan allocation is an admin-controlled cap with usage derived from disbursed principals and committee assignment metadata.
---

The loan budget is a singleton admin-controlled allocation. Total disbursed is always
derived from the sum of recorded loan principals; repayments do not replenish the allocation.
Creates and principal increases must lock the budget row and reject amounts above the
remaining allocation. Existing loans establish the initial baseline so migration never
creates a negative remainder.

**Why:** a separately stored remaining balance can drift under concurrent approvals,
repayments are not new funding, and historical loans must not become invalid when the cap
is introduced.

**How to apply:** budget changes require the Admin role and append immutable old/new/actor
history. Responsible loan staff must reference an active assignment in the active committee
term; do not store only a free-text name for new assignments.