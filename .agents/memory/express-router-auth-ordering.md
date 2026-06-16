---
name: Express router auth ordering
description: Why public API routes must be mounted before any router with catch-all requireAuth
---

## Rule
Mount routers with **public** routes BEFORE any router that uses `router.use(requireAuth)` without a path prefix.

**Why:** In Express, `router.use(someOtherRouter)` with no path passes ALL requests through `someOtherRouter`. If `someOtherRouter` has `router.use(requireAuth)` at the top (catch-all), it will block every unauthenticated request — including public routes defined in a different router mounted later. An unmatched `/api/*` path therefore returns 401 (from the first catch-all auth router), not 404.

## How to apply
In `artifacts/api-server/src/routes/index.ts`, the mount order must be:
1. `healthRouter` — no auth
2. `authRouter` — no auth
3. `meRouter` — route-level auth only (safe)
4. **Any router with public routes** (e.g. `dkmoMembershipRouter`, which serves the public application form) — must come here
5. Catch-all auth routers: `membersRouter`, `paymentsRouter`, `dashboardRouter`, etc. (all use `router.use(requireAuth)`)

Routers with mixed public/protected routes must declare their public routes BEFORE `router.use(requireAuth)` inside the file, AND be mounted early in the chain. This is the only safe location for public routes outside the health/auth/me routers.
