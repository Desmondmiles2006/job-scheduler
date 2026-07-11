import { Router } from "express";
import { getPool } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { registerSchema, loginSchema, refreshSchema } from "../validation/auth.schemas";
import * as authService from "../services/authService";

const router = Router();

router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(getPool(), req.body);
    res.status(201).json(result);
  })
);

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(getPool(), req.body);
    res.status(200).json(result);
  })
);

router.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(getPool(), req.body.refreshToken);
    res.status(200).json(result);
  })
);

router.post(
  "/logout",
  authenticate,
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(getPool(), req.body.refreshToken);
    res.status(204).send();
  })
);

export default router;
