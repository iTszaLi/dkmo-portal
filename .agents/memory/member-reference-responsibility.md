---
name: Member reference / group FRF responsibility
description: How member referral grouping and FRF responsibility are modeled in the DKMO members table
---

# Member reference grouping

- `members.refMemberId` is a **TEXT** column that stores the **referrer's `members.id` (a UUID)** — not a name, not a FK.
  - `refMemberName` is a denormalized display copy of the referrer's name.
- "Members under reference X" = rows where `refMemberId === X.id`.
- **FRF responsibility** for a referrer = (count of members under their reference) × **SAR 50**.

**Why:** mirrors the legacy MS Access workflow where each member's group carries a per-head FRF obligation. The text-vs-uuid column means raw SQL joins need a cast (`ref_member_id = ref.id::text`); Drizzle handles it because the column is typed text.

**How to apply:** the `/members/:id/referrals` endpoint computes this. When seeding, link `refMemberId` in a second pass after insert (ids only exist post-insert).
