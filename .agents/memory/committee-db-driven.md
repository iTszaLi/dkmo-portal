---
name: Committee roster is DB-driven
description: Committee membership and badges derive from members.committeeLevel, not a hardcoded roster constant.
---

Committee membership is a single DB source of truth: `members.committeeLevel` is an
independent enum column (`regular` | `core` | `executive`). Executive is the senior
tier and also counts as committee. There is no hardcoded roster export anymore
(the old `COMMITTEE_2026_27` constant was removed).

**Why:** previously the committee roster was a static frontend array, so /committee,
/meetings, and /committee-performance could drift from each other and from the members
table. The user required one source of truth and promote/demote actions.

**How to apply:**
- Any view that needs "who is on the committee" reads `committeeLevel` via the members
  list, never a constant. Shared helpers live in `artifacts/dkmo-portal/src/lib/committee.ts`
  (normalize/isCommitteeLevel/isExecutiveLevel, badge classes, designation→department map).
- Promote/demote goes through `PATCH /members/:id/committee-level` (audit log action
  `member_committee_level_updated`); the UI uses the generated `useUpdateMemberCommitteeLevel` hook.
- Department grouping on /committee is derived from a designation→department map, not stored.
- Badges: Executive = gold, Core = silver; designation badge is one consistent color per role.
- Felicitation section on /committee stays intentionally static (not committee membership).
