import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { createRetryPolicySchema } from "../validation/retryPolicy.schemas";
import { projectIdParamsSchema } from "../validation/project.schemas";
import * as retryPolicyService from "../services/retryPolicyService";

const router = Router({ mergeParams: true });

router.post(
  "/",
  validate(projectIdParamsSchema, "params"),
  validate(createRetryPolicySchema),
  asyncHandler(async (req, res) => {
    const policy = await retryPolicyService.createRetryPolicy(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      ...req.body,
    });
    res.status(201).json(policy);
  })
);

router.get(
  "/",
  validate(projectIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const policies = await retryPolicyService.listRetryPolicies(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
    });
    res.status(200).json({ items: policies });
  })
);

export default router;
