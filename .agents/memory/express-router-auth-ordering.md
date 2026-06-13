---
name: Express router auth ordering
description: Why public API routes must be mounted before any router with catch-all requireAuth
---

## Rule
Mount routers with **public** routes BEFORE any router that uses `router.use(requireAuth)` without a path prefix.

**Why:** In Express, `router.use(someOtherRouter)` with no path passes ALL requests through `someOtherRouter`. If `someOtherRouter` has `router.use(requireAuth)` at the top (catch-all), it will block every unauthenticated request — including public routes defined in a different router mounted later.

## How to apply
In `artifacts/api-server/src/routes/index.ts`, the mount order must be:
1. `healthRouter` — no auth
2. `authRouter` — no auth
3. `meRouter` — route-level auth only (safe)
4. **Any router with public routes** (e.g. `frfMembershipRouter`) — must come here
5. Catch-all auth routers: `membersRouter`, `paymentsRouter`, `dashboardRouter` (all use `router.use(requireAuth)`)

Routers with mixed public/protected routes should declare their public routes BEFORE `router.use(requireAuth)` inside the file, AND be mounted early in the chain.

## The `next_frf_number()` SQL function
This function must exist in the DB. It was not created by Drizzle schema push — created manually via psql:
```sql
CREATE OR REPLACE FUNCTION next_frf_number() RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(frf_number FROM 5) AS INTEGER)), 0) + 1
    INTO next_val FROM frf_memberships
    WHERE frf_number ~ '^FRF-[0-9]+$';
  RETURN 'FRF-' || LPAD(next_val::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
```
