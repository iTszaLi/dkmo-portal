---
name: Certificate security (serial, signing, audit)
description: How approved-only membership certificate numbering, PDF signing, and approval audit fit together in the DKMO portal.
---

# Certificate security model

The official membership certificate is gated: serial, stamp, download, and print
are available **only after admin approval** (server enforces 403/404 on the
public `/certificate`, `/certificate/sign`, `/verify` routes until status is
approved).

## Serial allocation must stay atomic + idempotent
`ensureCertificateData()` allocates the `CERT-DKMO-YYYY-NNNNNN` serial lazily on
first fetch. The UPDATE is guarded with `isNull(certificateNumber)` so two
concurrent fetches can never overwrite an already-issued serial; on a no-op
update it re-reads and returns the existing row. A 23505 on the global-unique
serial triggers retry with a recomputed number.
**Why:** without the `IS NULL` predicate, concurrent first-fetches each pick a
different serial and the later write clobbers the earlier — breaking the
permanence of the serial and the approval audit trail.

## Signing is integrity, the verify page is authenticity
PDFs are generated client-side (jsPDF + a canvas-based approval stamp) then sent
to the server which applies a PAdES signature (`node-signpdf`, self-signed DKMO
key in `app_signing_keys`). The signature only proves the file was not modified
after signing — the signing cert is self-signed, so no PDF viewer shows it as a
*trusted* DKMO identity. Authenticity is therefore established by the verify
page (QR → DB lookup), which the product treats as the **primary security
layer**. Because the signing endpoint signs caller-supplied bytes, it is a
signing oracle for anyone holding an approved identifier; this is an accepted
boundary *given* the self-signed key + verify-page-primary design. If that model
ever changes, render the certificate server-side from DB and sign that instead.
**How to apply:** signing is mandatory — never emit an unsigned PDF, since the
document carries a visible "digitally signed by DKMO" note. If signing fails,
throw and let the UI surface an error rather than falling back to unsigned.
