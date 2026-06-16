---
name: Applying DB schema changes
description: Why `db push` can hang and the safe additive-migration path in this repo
---

# Applying DB schema changes

`pnpm --filter @workspace/db run push` (drizzle-kit push) can hang indefinitely
on an interactive prompt — e.g. when drizzle thinks a column/table was *renamed*
and waits for a y/n on stdin that never arrives in the agent shell.

**Safe path for additive changes:** add `CREATE TABLE IF NOT EXISTS …` (and
`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`) DDL to `scripts/src/migrate.ts` and
run `pnpm --filter @workspace/scripts run migrate`. It is idempotent and never
prompts.

**Why:** push's auto-rename detection is heuristic and blocks on ambiguity;
migrate.ts is explicit, non-interactive, and re-runnable.

**How to apply:** for new tables/columns prefer migrate.ts. Reserve `db push`
for local interactive sessions where you can answer prompts. Verify with a
direct query that the table/columns exist after running migrate.
