---
name: Portal module restructure
description: Nav consolidation decisions — receipts hub, welfare rename, no-ranking committee report, retired standalone pages
---
Decisions from the module cleanup round (July 2026), keep future work consistent:

- **Receipts is one hub page** (`pages/receipts.tsx`, tabs Generate | Payment Receipts | Issued Records | Verify). The generator lives in `pages/receipt-generator.tsx` and renders inside the Generate tab. `?tab=` picks the initial tab (default generate); `?verify=NUM` forces the Verify tab and auto-runs.
- **Legacy routes must keep redirecting**: `/print-receipts` → `/receipts` **preserving the query string** (old printed PDFs carry QR codes pointing at `/print-receipts?verify=NUM`); `/impact` → `/dashboard`; `/recruitment-leaderboard` & `/top-contributors` → `/members?referrals=1`. Handled by `LegacyRedirect` in App.tsx. Never remove these.
- **"Welfare Programs"** is the user-facing name for the former "Community Services"; routes stay `/services` (do not rename routes).
- **Committee page is a neutral Activity Report** — alphabetical, no rank/score columns. **Why:** user chose to remove competitive ranking framing. Don't reintroduce leaderboards there.
- Recruitment leaderboard became `components/ReferralAnalytics.tsx` (collapsible on Members page, auto-expands via `?referrals=1`); Impact page became dashboard widget `impact` (`ImpactSummary.tsx`). Duplicate Detection route kept admin-only but removed from sidebar (inline soft dup-check on Add Member covers it).
