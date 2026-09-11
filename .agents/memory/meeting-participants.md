---
name: Meeting-specific participants
description: The persistence and eligibility rules for meeting attendance rosters.
---

Meeting attendance rows are the authoritative participant list for each meeting. Legacy meetings seed their original committee roster once, new meetings seed the active committee term, and later reads must not recompute the roster from the current committee.

**Why:** Committee membership changes over time, while meeting registers and attendance history must remain stable. Removing a member from one meeting must not change the member record, committee assignment, or another meeting.

**How to apply:** New participant additions must be limited to the applicable active committee term; existing historical participant rows remain valid. Attendance updates must reject members not currently selected for that meeting, and adding a participant starts them absent.