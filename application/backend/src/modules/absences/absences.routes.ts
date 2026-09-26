import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  absenceIdParamSchema,
  createAbsenceSchema,
  decideAbsenceSchema,
  listAbsencesQuerySchema,
} from "./absences.validation";
import * as absencesController from "./absences.controller";

export const absencesRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (pour
// soi-même, pour son équipe, ou globale RH) est entièrement vérifiée dans
// absences.service.ts, même pattern que missions/problems/timesheets.
absencesRouter.use(authenticate());

absencesRouter.post("/", validate(createAbsenceSchema), absencesController.createAbsenceHandler);
absencesRouter.get("/", validate(listAbsencesQuerySchema), absencesController.listAbsencesHandler);
absencesRouter.get("/:id", validate(absenceIdParamSchema), absencesController.getAbsenceHandler);
absencesRouter.post("/:id/decide", validate(decideAbsenceSchema), absencesController.decideAbsenceHandler);
