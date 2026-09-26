import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import * as statsController from "./stats.controller";

export const statsRouter = Router();

// Statistiques réservées à la direction (cahier des charges, section 13) et à
// l'admin technique — vue globale, jamais accessible à la RH ni aux chefs d'équipe.
statsRouter.use(authenticate());
statsRouter.get("/overview", requireRole(Role.DIRECTOR, Role.ADMIN), statsController.getOverviewHandler);
statsRouter.get("/trends", requireRole(Role.DIRECTOR, Role.ADMIN), statsController.getTrendsHandler);
