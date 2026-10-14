#!/bin/sh
# Everything, in order, stopping at the first failure (TESTING.md §3). Needs Docker Desktop.
set -e

if ! pnpm -s supabase status >/dev/null 2>&1; then
  echo "Local Supabase isn't running. Start Docker Desktop, then run: pnpm supabase start" >&2
  exit 1
fi

pnpm -s supabase db reset          # migrations + seed.sql, once per run
node scripts/env-local.mjs          # .env.local on a fresh clone
pnpm -s typecheck
pnpm -s lint
pnpm -s format:check
pnpm -s test                        # unit, use case, component (+ coverage targets)
pnpm -s test:db                     # contract suites on Postgres/Supabase, RLS and constraints
pnpm -s test:e2e                    # journeys on the iPhone profile
echo "test:all: all green"
