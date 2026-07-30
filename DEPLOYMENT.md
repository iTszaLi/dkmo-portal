# DKMO Portal — Deployment Guide (GitHub → Vercel, fully self-contained)

The whole portal — frontend **and** API — deploys on Vercel alone. No Replit
services are required in production.

| Part | How it runs on Vercel |
|------|----------------------|
| Frontend (React/Vite SPA) | Static build served from Vercel's CDN |
| API (Express + PostgreSQL) | Vercel Serverless Function at `api/index.ts` — every `/api/*` request is routed to the Express app |
| Database | Any PostgreSQL (Vercel Postgres / Neon recommended) via `DATABASE_URL` |
| Sessions | Stored in PostgreSQL (`connect-pg-simple`) — serverless-safe |
| Document/photo files | Google Cloud Storage via `GCS_CREDENTIALS_JSON` (optional — only needed for the Documents upload feature) |

## 1. Deploy

1. Push this repository to GitHub and import it into Vercel.
2. Vercel reads `vercel.json` automatically (pnpm install, Vite build,
   SPA fallback, `/api/*` → serverless function). No settings to change.
3. Add the environment variables below in Vercel → Project → Settings →
   **Environment Variables**, then Deploy.

## 2. Environment variables (set in Vercel)

Required:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string (Neon/Vercel Postgres — use the **pooled** connection string) |
| `SESSION_SECRET` | Long random string for login sessions |
| `EXEC_PASSWORD` | Shared login password (or per-user `EXEC_PASSWORD_ADMIN1`, …) |

Optional:

| Variable | Value |
|----------|-------|
| `GCS_CREDENTIALS_JSON` | Full JSON of a Google Cloud service-account key — enables Documents/photo file uploads |
| `PRIVATE_OBJECT_DIR` | `/your-gcs-bucket/private` (with `GCS_CREDENTIALS_JSON`) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `/your-gcs-bucket/public` (with `GCS_CREDENTIALS_JSON`) |
| `CORS_ORIGINS` | Extra browser origins allowed to call the API (not needed when frontend + API share the Vercel domain) |
| `LOG_LEVEL` | `info` (default) / `debug` / `warn` / `error` |

## 3. One-time database setup

Run the migration once against the production database:

```
DATABASE_URL=<prod connection string> pnpm --filter @workspace/scripts run migrate
```

(or `cd scripts && pnpm run migrate` with `DATABASE_URL` set).

## 4. Custom domain — www.dkmo.org

1. Vercel → Project → Settings → **Domains**: add `www.dkmo.org` (and
   `dkmo.org` redirected to www).
2. At your registrar, add the DNS records Vercel shows (CNAME `www` →
   `cname.vercel-dns.com`, A/ALIAS for the bare domain).

## 5. Platform notes & limits

- **Request size:** Vercel caps request bodies at ~4.5 MB. Member photos are
  compressed client-side before upload, so normal use is unaffected; very
  large document uploads go directly to cloud storage via signed URLs and
  are not affected either.
- **Function limits:** the API function is configured with 1024 MB memory
  and a 30 s timeout in `vercel.json`.
- **Development on Replit** continues to work unchanged: the same Express
  app runs as a normal server, and file storage falls back to Replit App
  Storage automatically when `GCS_CREDENTIALS_JSON` is not set.

## 6. Go-live checklist

- [ ] `DATABASE_URL`, `SESSION_SECRET`, `EXEC_PASSWORD…` set in Vercel
- [ ] Migration run against the production database
- [ ] (Optional) GCS variables set if the Documents upload feature is needed
- [ ] `www.dkmo.org` added under Domains
- [ ] Log in on the deployed site and spot-check Members, Payments, Reports
