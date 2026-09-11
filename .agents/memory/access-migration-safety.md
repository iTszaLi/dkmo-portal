---
name: Access migration preservation gate
description: Durable rules for reconciling the old Access database with the DKMO portal without silent exclusions or unsafe merges.
---

The old Access database is the authoritative source for historical DKMO data. Every legacy member and every historical relationship must remain in the reconciliation, even when there is no current portal match.

**Why:** A missing or uncertain portal match does not mean the Access history is disposable. Name/mobile-only matches can attach payments, referrals, FRF records, or loans to the wrong person.

The user approved replacing the development Members dataset with all 1,118 Access identities while keeping unresolved candidates as separate Needs Review members. That approval does not authorize attaching uncertain history or changing production.

**Why:** Identity population and historical-record attachment have different risk levels. Members must be visible without letting uncertain matches redirect payments, FRF, loans, or other history.

**How to apply:** Preserve the exact Access legacy ID on every dry-run/import record. Before replacing a member cohort, create a restorable backup of the current members and member-linked rows. For candidate portal matches, allow only explicit decisions: Confirm Same Person, Confirm Different Person, or Needs Review / Skip. Only the first may attach historical relationships to an existing portal member; the other two preserve the legacy history separately or unattached. Populate all legacy identities in development, but keep historical attachment and production mutation separately gated.