import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  addSiteMemberSchema,
  createSiteSchema,
  listSitesQuerySchema,
  removeSiteMemberSchema,
  siteIdParamSchema,
  updateSiteSchema,
} from "./sites.validation";
import * as sitesController from "./sites.controller";

export const sitesRouter = Router();

// Le chef d'équipe n'a jamais eu le droit de créer un chantier (RBAC déjà
// strict côté serveur) — la RH et le superviseur en sont les créateurs
// attendus au quotidien ; direction/admin conservent leur accès de supervision.
const CREATE_SITE_ROLES = [Role.SUPERVISOR, Role.HR, Role.DIRECTOR, Role.ADMIN];
// Lecture et mise à jour/membres : ouvertes à tous les rôles authentifiés, la
// portée exacte (quels chantiers, quels champs) est appliquée dans sites.service.ts.

sitesRouter.use(authenticate());

sitesRouter.post("/", requireRole(...CREATE_SITE_ROLES), validate(createSiteSchema), sitesController.createSiteHandler);
sitesRouter.get("/", validate(listSitesQuerySchema), sitesController.listSitesHandler);
sitesRouter.get("/:id", validate(siteIdParamSchema), sitesController.getSiteHandler);
sitesRouter.patch("/:id", validate(updateSiteSchema), sitesController.updateSiteHandler);

sitesRouter.post("/:id/members", validate(addSiteMemberSchema), sitesController.addSiteMemberHandler);
sitesRouter.delete("/:id/members/:userId", validate(removeSiteMemberSchema), sitesController.removeSiteMemberHandler);
