# DKMO Portal — Deployment Guide (GitHub + Vercel)

The project is a pnpm monorepo with two deployable parts:

| Part | Folder | What it is | Where it can run |
|------|--------|------------|------------------|
| Frontend | `artifacts/dkmo-portal` | React (Vite) single-page app | **Vercel** (this repo is pre-configured) |
| API server | `artifacts/api-server` | Express + PostgreSQL backend | A Node host (Replit publishing, Render, Railway, Fly.io, a VPS…) — **not** Vercel static hosting |

## 1. Deploy the frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Vercel reads `vercel.json` automatically:
   - install: `pnpm install`
   - build: `pnpm --filter @workspace/dkmo-portal run build`
   - output: `artifacts/dkmo-portal/dist/public`
   - SPA fallback: every route rewrites to `index.html` (refresh-safe routing)
3. **Edit `vercel.json`** and replace `YOUR-API-SERVER-DOMAIN` with the real
   domain of your deployed API server. All `/api/...` calls from the app are
   proxied there, so no frontend environment variables are needed.

## 2. Deploy the API server

The backend is a long-running Express server; deploy it on any Node.js host
with a PostgreSQL database. Environment variables (see `.env.example`):

Required:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — long random string for login sessions
- `EXEC_PASSWORD` (and/or `EXEC_PASSWORD_<USERNAME>`) — login passwords

Optional:
- `PORT` (default 8080), `LOG_LEVEL`
- `CORS_ORIGINS` — comma-separated browser origins allowed to call the API
  directly (only needed if you skip the Vercel `/api` proxy)

Run the database migration once against the production database:

```
cd scripts && pnpm run migrate
```

Start command: `pnpm --filter @workspace/api-server run dev` (or build+start
per your host's Node deployment conventions).

## 3. Known Replit-specific feature

Document/photo **file uploads** use Replit App Storage
(`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
`PUBLIC_OBJECT_SEARCH_PATHS`). When the API server is hosted on Replit these
are provisioned automatically. On any other host, the Documents upload feature
needs an alternative storage backend (e.g. S3) before it will work — the rest
of the portal is unaffected.

## 4. Custom domain — www.dkmo.org

1. In Vercel → Project → Settings → **Domains**, add `www.dkmo.org` (and `dkmo.org`, redirected to www).
2. At your domain registrar, add the DNS records Vercel shows you (a CNAME for `www` pointing to `cname.vercel-dns.com`, and an A/ALIAS record for the bare domain).
3. If the API is ever called directly from the browser (without the Vercel `/api` proxy), set `CORS_ORIGINS=https://www.dkmo.org,https://dkmo.org` on the API host.

## 5. Checklist before going live

- [ ] `vercel.json` points to the real API domain
- [ ] `DATABASE_URL`, `SESSION_SECRET`, `EXEC_PASSWORD…` set on the API host
- [ ] Migration ran against the production database
- [ ] Log in and verify members/payments pages load
