---
name: Official membership certificate approval gate
description: How the admin-gated official DKMO membership certificate PDF and its public verification work.
---

# Official membership certificate gate

The official membership certificate PDF (stamp + watermark + QR) must be unreachable
before an admin approves the application.

**Rule:** the security boundary is the **server**, not the UI. Certificate data is served
only by an approval-gated public endpoint; the client (track page) just calls it and renders
the PDF.

- `GET /api/dkmo/memberships/certificate?dkmoNumber=|mobile=` — public, mounted BEFORE
  `requireAuth` and before `/:id` (else `/:id` shadows it → 401). Exact-match identity proof
  (same rules as `/track`: exact dkmoNumber, or full 10+ digit mobile). Returns **403** unless
  status is `approved|completed`; only then returns the richer cert DTO (incl. photoUrl, mobile).
- `GET /api/dkmo/memberships/verify?dkmoNumber=` — public QR target; minimal non-PII DTO
  `{found, fullName, membershipNumber, status:"active", approvedAt}`; `found:false` unless approved.

**Why:** keeping the gate on the server means the certificate (and the PII it carries) cannot be
obtained pre-approval even if the UI is bypassed. The richer cert endpoint intentionally exposes
more than `/track` (which stays minimal per public-track-endpoint-dto), but only post-approval and
behind exact-identifier proof.

**How to apply:** any new "official document" surface for memberships must fetch the gated
`/certificate` endpoint, never reconstruct from `/track` data. PDF is generated client-side
(jspdf): watermark via `GState({opacity:0.1})`, circular stamp drawn on a canvas (arc text) then
`addImage`, QR via `qrcode` → `/dkmo-verify?n=<dkmoNumber>`. Track page shows Download/Print/Verify
only for `approved|completed`.
