import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  addSiteMemberSchema,
  createSiteSchema,
  listSitesQuerySchema,
  removeSiteMemberSchema,
  siteIdParamSchema,
  siteProgressQuerySchema,
  updateSiteSchema,
  upsertSiteTargetSchema,
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

// Photo du chantier — portée exacte (qui peut modifier/consulter) appliquée
// dans sites.service.ts (mêmes règles que le reste de la fiche chantier).
sitesRouter.put("/:id/photo", validate(siteIdParamSchema), uploadPhoto, sitesController.setSitePhotoHandler);
sitesRouter.delete("/:id/photo", validate(siteIdParamSchema), sitesController.removeSitePhotoHandler);
sitesRouter.get("/:id/photo/file", validate(siteIdParamSchema), sitesController.getSitePhotoFileHandler);

// Objectifs et suivi mensuel (module commercial, §22-24/§28) — définir un
// objectif reste une décision de gestion (mêmes rôles que la modification de
// la fiche), la consultation du suivi suit les mêmes règles que la fiche
// chantier elle-même (voir sites.service.ts).
sitesRouter.post("/:id/targets", validate(upsertSiteTargetSchema), sitesController.upsertSiteTargetHandler);
sitesRouter.get("/:id/targets", validate(siteIdParamSchema), sitesController.listSiteTargetsHandler);
sitesRouter.get("/:id/progress", validate(siteProgressQuerySchema), sitesController.getSiteProgressHandler);
