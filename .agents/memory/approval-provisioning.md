---
name: Membership approval auto-provisioning
description: What happens atomically when a DKMO membership application is approved
---
Approving an application runs ONE transaction (row lock `FOR UPDATE` on the application) that: creates or idempotently links the member (by membershipId), sets fee SAR 100 unpaid, links application↔member, inserts pending frf_contributions for ALL approved (active) FRF claims, and writes a `membership_approved` audit log with the generated IDs. On any failure the whole thing (status change included) rolls back and the API returns 500.

**Why:** user spec demanded single-click approval with no duplicates and no partial records; architect review found the previous two-phase version could revert a finished approval under a double click.

**How to apply:** never add post-approval side effects outside this transaction; keep member insert conflict-tolerant (onConflictDoNothing on membershipId + re-select). FRF policy (user decision): newly approved members are registered as *pending* in active cases even though their membership fee is unpaid — unlike bulk claim generation which includes only fee-paid members. PATCH/DELETE on applications are admin-only.
