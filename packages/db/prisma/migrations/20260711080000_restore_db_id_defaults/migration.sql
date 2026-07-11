-- The generated Prisma migration (20260711075320_job_sch) ran
-- `ALTER COLUMN "id" DROP DEFAULT` on every table, because Prisma expects the
-- application (Prisma Client's @default(uuid())) to generate primary keys.
--
-- This project's API / worker / scheduler services use raw `pg` on the hot
-- paths (the SKIP LOCKED claim query, the scheduler tick, etc.), so they rely
-- on the database generating ids via gen_random_uuid(). This migration restores
-- those database-level defaults. Prisma Client inserts still work (they supply
-- their own id, overriding the default); raw inserts that omit id work again.
--
-- pgcrypto provides gen_random_uuid(); it was enabled by the init migration but
-- we ensure it here too so this migration is self-contained.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "organizations"     ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "users"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "refresh_tokens"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "projects"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "retry_policies"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "queues"            ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "jobs"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "job_executions"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "job_logs"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "workers"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "worker_heartbeats" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "scheduled_jobs"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "dead_letter_jobs"  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- The generated migration also dropped the DEFAULT now() on these updated_at
-- columns (Prisma manages @updatedAt in the application layer). Restore them so
-- raw inserts that omit updated_at still get a value.
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "jobs"  ALTER COLUMN "updated_at" SET DEFAULT now();
