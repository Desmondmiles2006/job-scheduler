import { Router } from "express";
import authRoutes from "./auth.routes";
import projectRoutes from "./project.routes";
import workerRoutes from "./worker.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/workers", workerRoutes);

export default router;
