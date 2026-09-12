---
name: Member search matching
description: Durable rules for member search ranking and referral-result presentation.
---

Direct member fields are the primary search surface. Referral fields may return related members, but those results must rank after direct matches and be labeled as referral-only matches.

**Why:** Searching a referrer’s name previously surfaced referred members as if they were direct name matches, making the result list ambiguous and harder to use.

**How to apply:** Keep direct and referral predicates separate in the API, expose the match type when search results are returned, and preserve the distinction in any future member-search UI or exports.