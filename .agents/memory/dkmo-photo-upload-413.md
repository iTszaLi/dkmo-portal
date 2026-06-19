---
name: DKMO photo upload / 413 submission
description: Why membership/application submissions with photos failed and the contract for sending images
---

# DKMO photo upload & oversized-payload handling

Photos are sent **inline as base64 data URLs in the JSON body** (no object storage / multipart for the public apply flow).

**Rules / lessons:**
- The Express body limit must be raised above the 100kb default (`express.json({ limit })`); a base64 photo blows past 100kb and yields HTTP 413. Keep client compression so payloads stay small even with the raised limit.
- Always compress + resize images client-side before submission (canvas → JPEG, cap longest edge, step quality down to a target byte size). Validate source file type + size with friendly messages, not raw `Request failed (413)`.
- **Field-name contract:** the apply form stores the image under `photoDataUrl` but the server schema (`DkmoMembershipInput`) and DB column expect `photoUrl`. The submit payload must map `photoDataUrl → photoUrl`, or the photo is silently dropped (field is optional).
- The API has a terminal JSON error middleware so body-parser errors (`entity.too.large`, `entity.parse.failed`) return JSON, not an HTML page that surfaces as a vite runtime-error overlay in the SPA.

**Why:** a proxy/Express HTML error response in the SPA shows up as `[plugin:runtime-error-plugin] (unknown runtime error)`, which is opaque to users.
