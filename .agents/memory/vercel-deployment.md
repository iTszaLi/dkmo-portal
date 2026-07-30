---
name: Vercel deployment setup
description: How the DKMO portal deploys self-contained on Vercel and what must stay intact
---

- The repo is a self-contained Vercel deploy: static Vite build + Express API as a Vercel Serverless Function via a root-level catch-all `api/[...path].ts` that default-exports the Express app. No rewrite for /api — file-system routing preserves the original URL; the SPA fallback rewrite must stay last/only.
- **Why:** a `/api/:path* -> /api/index` rewrite was flagged in review as brittle for Express path matching; the catch-all function is the reliable pattern.
- Object storage is dual-mode: `GCS_CREDENTIALS_JSON` (service-account + native v4 signed URLs) on non-Replit hosts, Replit sidecar fallback otherwise. Dev on Replit needs no config.
- pg pools are serverless-sized when `VERCEL` env is set (db pool max 3, session pool max 1); production should use a pooled (pgBouncer/Neon) DATABASE_URL.
- Replit-only Vite plugins are gated on `REPL_ID`; keep any new Replit dev tooling gated the same way so Vercel builds stay clean.
- Vercel body limit ~4.5MB — inline base64 photo uploads rely on client-side compression; large files must go via signed-URL direct upload.
- User's production domain is www.dkmo.org (canonical/OG tags point there).
- GitHub push still requires the user to connect GitHub in the Git pane (remote: iTszaLi/dkmo-portal).
