---
name: Receipt verification is auth-only
description: Receipt QR/verify endpoint must stay behind login, unlike the public certificate verify page.
---

**Rule:** `GET /api/receipts/verify/:receiptNumber` requires an authenticated session, and receipt-PDF QR codes link to the portal's internal `/print-receipts?verify=<num>` page (auto-opens the Verify tab via query param).

**Why:** User explicitly decided (July 2026) that this is an internal organization portal — receipt verification must NOT be publicly accessible unless a deliberate public feature is added later. This deliberately contrasts with the membership certificate `/verify` page, which IS public by design.

**How to apply:** Never "fix" the receipt verify route by removing requireAuth or by pointing receipt QRs at a public page. Callers must send credentials (client fetches use basePath + `credentials: "include"` or customFetch).

Related: receipt PDFs (`print-receipts.tsx` buildReceiptPdf) reserve a top-right ~22mm QR zone; the header title auto-shrinks to avoid overlapping it.
