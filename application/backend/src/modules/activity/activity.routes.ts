import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { listActivityLogsQuerySchema } from "./activity.validation";
import * as activityController from "./activity.controller";

export const activityRouter = Router();

// Journal d'activité réservé à la RH, la direction et l'admin technique —
// jamais au superviseur ni au chef d'équipe (même périmètre que /stats),
// puisqu'il couvre des actions sensibles sur les comptes, pas seulement le
// terrain.
const VIEW_ROLES = [Role.HR, Role.DIRECTOR, Role.ADMIN];

activityRouter.use(authenticate());
activityRouter.get("/", requireRole(...VIEW_ROLES), validate(listActivityLogsQuerySchema), activityController.listActivityLogsHandler);
// AVANT toute route "/:id" éventuelle : évite qu'Express interprète "actions" comme un id.
activityRouter.get("/actions", requireRole(...VIEW_ROLES), activityController.listActionsHandler);
