---
name: Documents DMS access model
description: Visibility levels, file-serving security, and public portal for the documents module
---

**Rule:** Document/attachment/version file URLs returned by the API are permission-checked endpoints (`/api/documents/:id/file`, `.../attachments/:attId/file`, `.../versions/:verId/file`, public: `/api/public/documents/:id/file`); raw `/api/storage/...` URLs stay only in the DB and are never sent to clients. Create/update handlers drop echoed-back `/api/documents/...` fileUrl values so edits don't overwrite stored raw URLs.

**Why:** Object storage's `/api/storage/public-objects/*` route is unauthenticated, so exposing raw URLs bypasses the visibility model (found in review).

**How to apply:** Any new file-bearing feature in documents must add a checked streaming endpoint (helper: api-server `lib/documentFiles.ts` `streamStoredFile`) instead of returning stored URLs.

Visibility levels: public | members | committee | admin. Read mapping: admin=all; finance/event=+committee; viewer=public+members. Only admins may set `public` or `admin` visibility. Public portal page: `/dkmo-documents` (no login), API `/api/public/documents` (minimal DTO, active+public only, mounted before requireAuth routers).

Note: TanStack `invalidateQueries({queryKey:["documents"]})` prefix-matches per-document subkeys (versions/attachments/activity) — no extra invalidation needed; a reviewer flagged this incorrectly once.
