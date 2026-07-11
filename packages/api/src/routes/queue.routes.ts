import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createQueueSchema,
  updateQueueSchema,
  listQueuesQuerySchema,
  queueIdParamsSchema,
} from "../validation/queue.schemas";
import { queueScopedParamsSchema } from "../validation/job.schemas";
import { projectIdParamsSchema } from "../validation/project.schemas";
import * as queueService from "../services/queueService";
import * as statsService from "../services/statsService";
import jobRoutes from "./job.routes";
import scheduledJobRoutes from "./scheduledJob.routes";

const router = Router({ mergeParams: true });

router.post(
  "/",
  validate(projectIdParamsSchema, "params"),
  validate(createQueueSchema),
  asyncHandler(async (req, res) => {
    const queue = await queueService.createQueue(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      ...req.body,
    });
    res.status(201).json(queue);
  })
);

router.get(
  "/",
  validate(projectIdParamsSchema, "params"),
  validate(listQueuesQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { cursor?: string; limit?: number; isPaused?: boolean };
    const page = await queueService.listQueues(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      isPaused: query.isPaused,
    });
    res.status(200).json(page);
  })
);

router.get(
  "/:queueId",
  validate(queueIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const queue = await queueService.getQueue(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
    });
    res.status(200).json(queue);
  })
);

router.patch(
  "/:queueId",
  validate(queueIdParamsSchema, "params"),
  validate(updateQueueSchema),
  asyncHandler(async (req, res) => {
    const queue = await queueService.updateQueue(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      ...req.body,
    });
    res.status(200).json(queue);
  })
);

router.delete(
  "/:queueId",
  validate(queueIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await queueService.deleteQueue(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
    });
    res.status(204).send();
  })
);

router.get(
  "/:queueId/stats",
  validate(queueScopedParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const stats = await statsService.getQueueStats(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
    });
    res.status(200).json(stats);
  })
);

router.use("/:queueId/jobs", jobRoutes);
router.use("/:queueId/scheduled-jobs", scheduledJobRoutes);

export default router;
