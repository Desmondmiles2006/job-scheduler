import { Router } from "express";
import { z } from "zod";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { projectIdParamsSchema } from "../validation/project.schemas";
import * as deadLetterService from "../services/deadLetterService";

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const dlqIdParamsSchema = z.object({
  projectId: z.string().uuid(),
  dlqId: z.string().uuid(),
});

const router = Router({ mergeParams: true });

router.get(
  "/",
  validate(projectIdParamsSchema, "params"),
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { cursor?: string; limit?: number };
    const page = await deadLetterService.listDeadLetterJobs(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    res.status(200).json(page);
  })
);

router.post(
  "/:dlqId/retry",
  validate(dlqIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const result = await deadLetterService.retryDeadLetterJob(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      dlqId: req.params.dlqId,
    });
    res.status(200).json(result);
  })
);

export default router;
