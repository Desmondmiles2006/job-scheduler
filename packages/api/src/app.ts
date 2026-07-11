import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ name: "api", autoLogging: process.env.NODE_ENV !== "test" }));

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api", routes);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  app.use(errorHandler);

  return app;
}
