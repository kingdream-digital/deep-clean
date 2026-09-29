import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { COMMERCIAL_ROLES } from "./prospects.service";
import {
  convertProspectSchema,
  createProspectSchema,
  listProspectsQuerySchema,
  prospectIdParamSchema,
  updateProspectSchema,
} from "./prospects.validation";
import * as prospectsController from "./prospects.controller";

export const prospectsRouter = Router();

// Module commercial réservé à Superviseur/RH/Direction/Admin — l'employé et
// le chef d'équipe n'y ont aucun accès (cahier des charges module commercial,
// §1-3). La portée exacte (tous les prospects vs seulement les siens pour un
// Superviseur) est appliquée dans prospects.service.ts.
prospectsRouter.use(authenticate(), requireRole(...COMMERCIAL_ROLES));

prospectsRouter.post("/", validate(createProspectSchema), prospectsController.createProspectHandler);
prospectsRouter.get("/", validate(listProspectsQuerySchema), prospectsController.listProspectsHandler);
prospectsRouter.get("/:id", validate(prospectIdParamSchema), prospectsController.getProspectHandler);
prospectsRouter.patch("/:id", validate(updateProspectSchema), prospectsController.updateProspectHandler);
prospectsRouter.post("/:id/convert", validate(convertProspectSchema), prospectsController.convertProspectHandler);
