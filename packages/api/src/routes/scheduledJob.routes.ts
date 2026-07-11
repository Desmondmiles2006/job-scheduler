import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createScheduledJobSchema,
  updateScheduledJobSchema,
  scheduledJobIdParamsSchema,
} from "../validation/scheduledJob.schemas";
import { queueScopedParamsSchema } from "../validation/job.schemas";
import * as scheduledJobService from "../services/scheduledJobService";

const router = Router({ mergeParams: true });

router.post(
  "/",
  validate(queueScopedParamsSchema, "params"),
  validate(createScheduledJobSchema),
  asyncHandler(async (req, res) => {
    const scheduledJob = await scheduledJobService.createScheduledJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      ...req.body,
    });
    res.status(201).json(scheduledJob);
  })
);

router.get(
  "/",
  validate(queueScopedParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const items = await scheduledJobService.listScheduledJobs(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
    });
    res.status(200).json({ items });
  })
);

router.patch(
  "/:scheduledJobId",
  validate(scheduledJobIdParamsSchema, "params"),
  validate(updateScheduledJobSchema),
  asyncHandler(async (req, res) => {
    const scheduledJob = await scheduledJobService.updateScheduledJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      scheduledJobId: req.params.scheduledJobId,
      ...req.body,
    });
    res.status(200).json(scheduledJob);
  })
);

router.delete(
  "/:scheduledJobId",
  validate(scheduledJobIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await scheduledJobService.deleteScheduledJob(getPool(), {
      orgId: req.user!.orgId,
      queueId: req.params.queueId,
      scheduledJobId: req.params.scheduledJobId,
    });
    res.status(204).send();
  })
);

export default router;
