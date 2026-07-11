import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createJobSchema,
  batchCreateJobsSchema,
  listJobsQuerySchema,
  jobIdParamsSchema,
  executionLogsParamsSchema,
  queueScopedParamsSchema,
} from "../validation/job.schemas";
import * as jobService from "../services/jobService";

const router = Router({ mergeParams: true });

router.post(
  "/",
  validate(queueScopedParamsSchema, "params"),
  validate(createJobSchema),
  asyncHandler(async (req, res) => {
    const job = await jobService.createJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      input: req.body,
    });
    res.status(201).json(job);
  })
);

router.post(
  "/batch",
  validate(queueScopedParamsSchema, "params"),
  validate(batchCreateJobsSchema),
  asyncHandler(async (req, res) => {
    const jobs = await jobService.createJobsBatch(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      jobs: req.body.jobs,
    });
    res.status(201).json({ items: jobs });
  })
);

router.get(
  "/",
  validate(queueScopedParamsSchema, "params"),
  validate(listJobsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      cursor?: string;
      limit?: number;
      status?: string;
      type?: string;
    };
    const page = await jobService.listJobs(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      status: query.status,
      type: query.type,
    });
    res.status(200).json(page);
  })
);

router.get(
  "/:jobId",
  validate(jobIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const job = await jobService.getJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      jobId: req.params.jobId,
    });
    res.status(200).json(job);
  })
);

router.get(
  "/:jobId/executions",
  validate(jobIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const executions = await jobService.listExecutions(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      jobId: req.params.jobId,
    });
    res.status(200).json({ items: executions });
  })
);

router.get(
  "/:jobId/executions/:executionId/logs",
  validate(executionLogsParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const logs = await jobService.listExecutionLogs(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      jobId: req.params.jobId,
      executionId: req.params.executionId,
    });
    res.status(200).json({ items: logs });
  })
);

router.post(
  "/:jobId/cancel",
  validate(jobIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const job = await jobService.cancelJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      jobId: req.params.jobId,
    });
    res.status(200).json(job);
  })
);

export default router;
