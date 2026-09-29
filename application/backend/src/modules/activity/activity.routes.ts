import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { listActivityLogsQuerySchema } from "./activity.validation";
import * as activityController from "./activity.controller";

export const activityRouter = Router();

// Retour explicite du client (validé), revirement par rapport au périmètre
// d'origine (RH/direction/admin) : le journal d'activité expose des détails
// potentiellement sensibles sur le fonctionnement interne de l'application
// (actions précises, métadonnées) — en cas de problème, seul l'admin
// technique doit pouvoir vraiment le consulter. RH et direction en perdent
// l'accès (ils gardent tout le reste : comptes, planning, statistiques...).
const VIEW_ROLES = [Role.ADMIN];

activityRouter.use(authenticate());
activityRouter.get("/", requireRole(...VIEW_ROLES), validate(listActivityLogsQuerySchema), activityController.listActivityLogsHandler);
// AVANT toute route "/:id" éventuelle : évite qu'Express interprète "actions" comme un id.
activityRouter.get("/actions", requireRole(...VIEW_ROLES), activityController.listActionsHandler);
