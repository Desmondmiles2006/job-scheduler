/*
  Warnings:

  - The primary key for the `dead_letter_jobs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `job_executions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `job_logs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `jobs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `organizations` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `projects` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `queues` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `refresh_tokens` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `retry_policies` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `scheduled_jobs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `worker_heartbeats` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `workers` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "dead_letter_jobs" DROP CONSTRAINT "dead_letter_jobs_original_job_id_fkey";

-- DropForeignKey
ALTER TABLE "dead_letter_jobs" DROP CONSTRAINT "dead_letter_jobs_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_id_fkey";

-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_worker_id_fkey";

-- DropForeignKey
ALTER TABLE "job_logs" DROP CONSTRAINT "job_logs_job_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_claimed_by_fkey";

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_retry_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_scheduled_job_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_created_by_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_org_id_fkey";

-- DropForeignKey
ALTER TABLE "queues" DROP CONSTRAINT "queues_default_retry_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "queues" DROP CONSTRAINT "queues_project_id_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "retry_policies" DROP CONSTRAINT "retry_policies_project_id_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_jobs" DROP CONSTRAINT "scheduled_jobs_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_org_id_fkey";

-- DropForeignKey
ALTER TABLE "worker_heartbeats" DROP CONSTRAINT "worker_heartbeats_worker_id_fkey";

-- AlterTable
ALTER TABLE "dead_letter_jobs" DROP CONSTRAINT "dead_letter_jobs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "original_job_id" SET DATA TYPE TEXT,
ALTER COLUMN "queue_id" SET DATA TYPE TEXT,
ALTER COLUMN "moved_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "job_id" SET DATA TYPE TEXT,
ALTER COLUMN "worker_id" SET DATA TYPE TEXT,
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "finished_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "job_logs" DROP CONSTRAINT "job_logs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "job_execution_id" SET DATA TYPE TEXT,
ALTER COLUMN "logged_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "queue_id" SET DATA TYPE TEXT,
ALTER COLUMN "run_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "retry_policy_id" SET DATA TYPE TEXT,
ALTER COLUMN "claimed_by" SET DATA TYPE TEXT,
ALTER COLUMN "claimed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "scheduled_job_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "projects" DROP CONSTRAINT "projects_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "org_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_by" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "queues" DROP CONSTRAINT "queues_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "project_id" SET DATA TYPE TEXT,
ALTER COLUMN "default_retry_policy_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "queues_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revoked_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "retry_policies" DROP CONSTRAINT "retry_policies_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "project_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "retry_policies_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "scheduled_jobs" DROP CONSTRAINT "scheduled_jobs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "queue_id" SET DATA TYPE TEXT,
ALTER COLUMN "next_run_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_run_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "org_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "worker_heartbeats" DROP CONSTRAINT "worker_heartbeats_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "worker_id" SET DATA TYPE TEXT,
ALTER COLUMN "heartbeat_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "current_job_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "workers" DROP CONSTRAINT "workers_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "jobs_claimed_by_locked_until_idx" ON "jobs"("claimed_by", "locked_until");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retry_policies" ADD CONSTRAINT "retry_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_default_retry_policy_id_fkey" FOREIGN KEY ("default_retry_policy_id") REFERENCES "retry_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retry_policy_id_fkey" FOREIGN KEY ("retry_policy_id") REFERENCES "retry_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_scheduled_job_id_fkey" FOREIGN KEY ("scheduled_job_id") REFERENCES "scheduled_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_execution_id_fkey" FOREIGN KEY ("job_execution_id") REFERENCES "job_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_heartbeats" ADD CONSTRAINT "worker_heartbeats_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_original_job_id_fkey" FOREIGN KEY ("original_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_dead_letter_jobs_queue_id" RENAME TO "dead_letter_jobs_queue_id_idx";

-- RenameIndex
ALTER INDEX "idx_job_executions_job_id" RENAME TO "job_executions_job_id_idx";

-- RenameIndex
ALTER INDEX "idx_job_executions_worker_id" RENAME TO "job_executions_worker_id_idx";

-- RenameIndex
ALTER INDEX "idx_job_logs_execution_id_logged_at" RENAME TO "job_logs_job_execution_id_logged_at_idx";

-- RenameIndex
ALTER INDEX "idx_jobs_queue_status_runat" RENAME TO "jobs_queue_id_status_run_at_idx";

-- RenameIndex
ALTER INDEX "idx_projects_org_id" RENAME TO "projects_org_id_idx";

-- RenameIndex
ALTER INDEX "idx_queues_project_id" RENAME TO "queues_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_refresh_tokens_user_id" RENAME TO "refresh_tokens_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_retry_policies_project_id" RENAME TO "retry_policies_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_scheduled_jobs_next_run" RENAME TO "scheduled_jobs_next_run_at_is_enabled_idx";

-- RenameIndex
ALTER INDEX "idx_users_org_id" RENAME TO "users_org_id_idx";

-- RenameIndex
ALTER INDEX "idx_worker_heartbeats_worker_id_at" RENAME TO "worker_heartbeats_worker_id_heartbeat_at_idx";

-- RenameIndex
ALTER INDEX "idx_workers_last_seen_at" RENAME TO "workers_last_seen_at_idx";
