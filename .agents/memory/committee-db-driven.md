---
name: Committee membership is DB-driven and fully independent
description: Committee membership/badges derive from two independent boolean columns, not a hardcoded roster or a single enum.
---

Committee membership is the DB source of truth, expressed as **two fully independent
boolean columns** on `members`: `isExecutiveCommittee` and `isCoreCommittee`. Plus the
existing `designation` ("Assigned Role"). All three are independent — a member may be on
Executive, Core, both, or neither, and have any role or none. There is NO nesting,
subset, or hidden link between them, and no hardcoded roster constant.

**Why:** the roster used to be a static frontend array, then a single enum
(`committeeLevel`: regular/core/executive) where Executive implied Core. The user
required these to be three independent attributes with no implicit coupling, so
removing one membership must never change the other or the role.

**How to apply:**
- "Who is on Executive?" = `isExecutiveCommittee === true`; "on Core?" = `isCoreCommittee === true`.
  Never treat Executive as a subset of Core. A combined "any committee" view must be an
  explicit OR, used only where intentional.
- Shared helpers live in `artifacts/dkmo-portal/src/lib/committee.ts` (badge classes,
  designation→department map, initials). No normalize/isCommitteeLevel/isExecutiveLevel.
- Badges render independently in order ROLE | EXECUTIVE COMMITTEE (gold) | CORE COMMITTEE (silver).
- Badge dedup rule (MemberBadges): generic designations "Member" and "Executive Member" are
  NEVER shown as a role badge — they merely restate committee membership and produced confusing
  "EXECUTIVE MEMBER" + "EXECUTIVE COMMITTEE" pairs. A single "MEMBER" fallback badge shows only
  when a member has no distinct role AND no committee. Distinct roles (President, Treasurer, etc.)
  still render alongside committee badges.
- Toggling goes through `PATCH /members/:id/committee-status` with a partial body
  ({ isExecutiveCommittee? , isCoreCommittee? }); only provided flags change. Audit action
  `member_committee_status_updated`; UI uses generated `useUpdateMemberCommitteeStatus`.
- Department grouping on /committee is derived from designation→department map, not stored.
- Felicitation section on /committee stays intentionally static (not committee membership).
