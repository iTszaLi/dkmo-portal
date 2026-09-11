---
name: Stateful API regression fixtures
description: How shared development database state affects API regression expectations.
---

Stateful API regressions that assert dashboard aggregates must either isolate their ledger rows or derive expected totals from a captured baseline; fixed FRF totals are only valid on a clean database.

**Why:** The development database can retain active FRF cases and contributions from earlier work, so a hard-coded aggregate can fail even when the endpoint behavior under test is correct.

**How to apply:** Keep reminder-specific assertions scoped to uniquely tagged fixtures and run them by test name when an unrelated aggregate regression depends on a clean seed.