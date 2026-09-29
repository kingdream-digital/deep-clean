import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { generalRateLimiter } from "./middleware/rateLimit.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { sitesRouter } from "./modules/sites/sites.routes";
import { missionsRouter } from "./modules/missions/missions.routes";
import { problemsRouter } from "./modules/problems/problems.routes";
import { statsRouter } from "./modules/stats/stats.routes";
import { timesheetsRouter } from "./modules/timesheets/timesheets.routes";
import { standardsRouter } from "./modules/standards/standards.routes";
import { messagesRouter } from "./modules/messages/messages.routes";
import { absencesRouter } from "./modules/absences/absences.routes";
import { activityRouter } from "./modules/activity/activity.routes";
import { announcementsRouter } from "./modules/announcements/announcements.routes";
import { documentsRouter } from "./modules/documents/documents.routes";

export function createApp() {
  const app = express();

  // Fait confiance au premier proxy (nécessaire derrière un load balancer / reverse proxy
  // en production pour obtenir la vraie IP client via X-Forwarded-For, utilisée par le rate limiting).
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  if (!env.isTest) {
    app.use(pinoHttp({ logger }));
  }

  app.use(generalRateLimiter);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/sites", sitesRouter);
  app.use("/api/v1/missions", missionsRouter);
  app.use("/api/v1/problems", problemsRouter);
  app.use("/api/v1/stats", statsRouter);
  app.use("/api/v1/time-entries", timesheetsRouter);
  app.use("/api/v1/cleaning-standards", standardsRouter);
  app.use("/api/v1/messages", messagesRouter);
  app.use("/api/v1/absences", absencesRouter);
  app.use("/api/v1/activity-logs", activityRouter);
  app.use("/api/v1/announcements", announcementsRouter);
  app.use("/api/v1/documents", documentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
