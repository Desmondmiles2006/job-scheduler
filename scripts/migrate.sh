#!/usr/bin/env bash
# Applies all Prisma migrations in order directly via psql. Equivalent to
# `npm run migrate --workspace=@job-scheduler/db` (which uses Prisma's own
# migration engine), but works without network access to Prisma's engine CDN.
set -euo pipefail

DB_URL="${1:-postgresql://postgres:postgres@localhost:5432/job_scheduler}"
TEST_DB_URL="${2:-postgresql://postgres:postgres@localhost:5432/job_scheduler_test}"

MIGRATIONS_DIR="packages/db/prisma/migrations"

apply_all() {
  local url="$1"
  echo "Applying migrations to $url"
  for dir in "$MIGRATIONS_DIR"/*/; do
    if [ -f "$dir/migration.sql" ]; then
      echo "  -> $(basename "$dir")"
      psql "$url" -f "$dir/migration.sql"
    fi
  done
}

apply_all "$DB_URL"
apply_all "$TEST_DB_URL"

echo "Done."
