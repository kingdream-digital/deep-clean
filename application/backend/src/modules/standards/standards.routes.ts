import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadDocument } from "../../middleware/upload.middleware";
import {
  createStandardSchema,
  listStandardsQuerySchema,
  standardIdParamSchema,
  updateStandardSchema,
} from "./standards.validation";
import * as standardsController from "./standards.controller";

export const standardsRouter = Router();

// Lecture réservée aux utilisateurs ayant un lien avec le chantier concerné
// (gestion du planning, chef d'équipe propriétaire, ou employé membre de
// l'équipe) — un standard peut contenir des informations sensibles propres à
// un client (codes d'accès, consignes de sécurité). Faille corrigée lors de
// cet audit : la lecture était auparavant ouverte à tout authentifié, sans
// aucune vérification de portée par chantier (voir assertCanAccessSite dans
// standards.service.ts). Création/modification/suppression réservées à la
// gestion du planning, vérifié dans standards.service.ts (jamais côté mobile).
standardsRouter.use(authenticate());

standardsRouter.get("/", validate(listStandardsQuerySchema), standardsController.listStandardsHandler);
standardsRouter.get("/:id", validate(standardIdParamSchema), standardsController.getStandardHandler);
standardsRouter.post("/", validate(createStandardSchema), standardsController.createStandardHandler);
standardsRouter.patch("/:id", validate(updateStandardSchema), standardsController.updateStandardHandler);
standardsRouter.delete("/:id", validate(standardIdParamSchema), standardsController.deleteStandardHandler);
standardsRouter.put(
  "/:id/document",
  validate(standardIdParamSchema),
  uploadDocument,
  standardsController.attachStandardDocumentHandler
);
standardsRouter.get(
  "/:id/document/file",
  validate(standardIdParamSchema),
  standardsController.getStandardDocumentFileHandler
);
standardsRouter.delete(
  "/:id/document",
  validate(standardIdParamSchema),
  standardsController.removeStandardDocumentHandler
);
