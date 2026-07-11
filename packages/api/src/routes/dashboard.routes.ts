import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticate } from "../middleware/auth";
import * as dashboardService from "../services/dashboardService";

const router = Router();
router.use(authenticate);

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const summary = await dashboardService.getDashboardSummary(getPool(), { orgId: req.user!.orgId });
    res.status(200).json(summary);
  })
);

export default router;
