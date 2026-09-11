#!/usr/bin/env bash
set -euo pipefail

# Post-merge runs with stdin closed. Drizzle's schema push can prompt when it
# detects an ambiguous rename or constraint change, so use the explicit,
# idempotent migration runner instead of the interactive push command.
export CI=true

pnpm install --frozen-lockfile
pnpm --filter @workspace/scripts run migrate
