---
name: Dashboard widget personalization
description: How the DKMO dashboard widget reorder + glassmorphism + celebration features are wired and the constraints to keep them accessible.
---

Dashboard widgets are reorderable via framer-motion `Reorder.Group`, persisted to `localStorage` key `dkmo.dashboard.widgetOrder`. The order array is sanitized on load against the known widget keys and missing defaults are re-appended, so adding/removing a widget key never wipes a saved layout.

**Why:** drag-only reorder is pointer-only and fails keyboard/AT users — always pair `Reorder` with explicit Move up/down buttons (aria-labelled) when used as a real personalization control, not just decoration.

**How to apply:**
- "Member of the Month" / Top Recruiters are computed purely from `members[].refMemberId` (referrer UUID); always guard with `byId.has(refMemberId)` to skip dangling refs and add a deterministic tie-break (name localeCompare) so equal counts don't pick arbitrarily.
- Glassmorphism is intentionally scoped: `.glass` / `.glass-strong` utilities applied only to KPI + hero cards, not every card.
- Confetti (`src/lib/confetti.ts`, canvas-confetti) must respect `prefers-reduced-motion` and fire only on success paths (member create, membership approval) and milestone crossings (recruiter count multiple-of-5, deduped via localStorage).
- Hijri date uses native `Intl` `en-US-u-ca-islamic-umalqura` — no extra dependency.

**Hidden widgets vs reorder:** some widgets are role-gated (e.g. activity feed = admin/finance). Reorder UI renders a filtered `visibleOrder`, so move/drag handlers must map visible indices back to the full persisted order and splice hidden keys back in on drag-reorder — otherwise hidden widgets get swapped wrongly or dropped from localStorage.
