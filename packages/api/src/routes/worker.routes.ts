import { Router } from "express";
import { z } from "zod";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import * as workerService from "../services/workerService";

const workerIdParamsSchema = z.object({ workerId: z.string().uuid() });

const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const workers = await workerService.listWorkers(getPool());
    res.status(200).json({ items: workers });
  })
);

router.get(
  "/:workerId/heartbeats",
  validate(workerIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const heartbeats = await workerService.listWorkerHeartbeats(getPool(), req.params.workerId);
    res.status(200).json({ items: heartbeats });
  })
);

export default router;
