-- AlterTable
ALTER TABLE "dead_letter_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job_executions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "queues" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "retry_policies" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scheduled_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "worker_heartbeats" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workers" ALTER COLUMN "id" DROP DEFAULT;
