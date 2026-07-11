import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  projectIdParamsSchema,
} from "../validation/project.schemas";
import * as projectService from "../services/projectService";
import queueRoutes from "./queue.routes";
import retryPolicyRoutes from "./retryPolicy.routes";
import deadLetterRoutes from "./deadLetter.routes";

const router = Router();
router.use(authenticate);

router.post(
  "/",
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await projectService.createProject(getPool(), {
      orgId: req.user!.orgId,
      createdBy: req.user!.id,
      name: req.body.name,
    });
    res.status(201).json(project);
  })
);

router.get(
  "/",
  validate(listProjectsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { cursor?: string; limit?: number; name?: string };
    const page = await projectService.listProjects(getPool(), {
      orgId: req.user!.orgId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      name: query.name,
    });
    res.status(200).json(page);
  })
);

router.get(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const project = await projectService.getProject(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
    });
    res.status(200).json(project);
  })
);

router.patch(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  validate(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await projectService.updateProject(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
      name: req.body.name,
    });
    res.status(200).json(project);
  })
);

router.delete(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await projectService.deleteProject(getPool(), {
      orgId: req.user!.orgId,
      projectId: req.params.projectId,
    });
    res.status(204).send();
  })
);

router.use("/:projectId/queues", queueRoutes);
router.use("/:projectId/retry-policies", retryPolicyRoutes);
router.use("/:projectId/dead-letter-jobs", deadLetterRoutes);

export default router;
