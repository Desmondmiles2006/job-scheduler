import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance per process. Each service (api, worker,
// scheduler) imports this rather than instantiating its own client, so
// connection pooling behaves predictably under docker-compose / PM2.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export * from "@prisma/client";
