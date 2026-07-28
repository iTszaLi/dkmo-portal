---
name: DKMO ID sequence
description: How human-readable member IDs (DKMO-XXXX) are allocated and the pitfalls around setval and shared namespaces.
---

- Member IDs (`members.membership_id`) and application numbers (`dkmo_memberships.dkmo_number`) share ONE namespace `DKMO-XXXX`, allocated by `next_dkmo_number()` which reads Postgres sequence `dkmo_id_seq`. Never add a second allocator (old MAX()-based versions collided between the two tables).
- IDs are permanent: POST /members always server-generates (client value ignored), PATCH keeps the existing value, deletes leave gaps that must never be refilled.
- **Why advance-only setval:** migrate.ts re-runs on every deploy; recomputing `setval` from MAX(used) moves the sequence *backwards* after deletions and would reuse deleted IDs. The migration therefore takes GREATEST(max_used, current last_value) and handles the fresh-DB case (`is_called=false`) so the first id is DKMO-0001.
- **How to apply:** any new flow that mints a DKMO number must call `next_dkmo_number()`; any renumbering must propagate to `frf_claims.membership_id`, `welfare_requests.membership_id`, and `dkmo_memberships.dkmo_number`.

**Note:** `next_dkmo_number()` returns the fully formatted `DKMO-XXXX` string, not a bare integer — use its value directly as the membershipId.
