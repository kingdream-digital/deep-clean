import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  clockPositionSchema,
  exportTimeEntriesQuerySchema,
  listTimeEntriesQuerySchema,
  reconciliationDetailSchema,
  reconciliationQuerySchema,
  rejectTimeEntrySchema,
  retroactiveTimeEntrySchema,
  timeEntryIdParamSchema,
  validateTimeEntrySchema,
  managerTimeEntrySchema,
} from "./timesheets.validation";
import * as timesheetsController from "./timesheets.controller";

export const timesheetsRouter = Router();

// Pas de restriction de rôle au niveau des routes : tout le monde pointe pour
// soi-même, la portée de consultation/validation dépend de l'équipe gérée et
// est entièrement vérifiée dans timesheets.service.ts.
timesheetsRouter.use(authenticate());

// `uploadPhoto` (multer) avant `validate` : multer doit d'abord parser le
// multipart pour peupler req.body (champs texte) et req.file (la photo) —
// validate() lirait un req.body vide s'il passait en premier. Photo et
// position requises pour pointer (justificatif anti-fraude, retour explicite
// du client) : voir timesheets.controller.ts::requirePhoto.
timesheetsRouter.post("/clock-in", uploadPhoto, validate(clockPositionSchema), timesheetsController.clockInHandler);
timesheetsRouter.post("/clock-out", uploadPhoto, validate(clockPositionSchema), timesheetsController.clockOutHandler);
timesheetsRouter.get(
  "/:id/clock-in-photo",
  validate(timeEntryIdParamSchema),
  timesheetsController.getClockInPhotoHandler
);
timesheetsRouter.get(
  "/:id/clock-out-photo",
  validate(timeEntryIdParamSchema),
  timesheetsController.getClockOutPhotoHandler
);
timesheetsRouter.post(
  "/retroactive",
  validate(retroactiveTimeEntrySchema),
  timesheetsController.retroactiveTimeEntryHandler
);
timesheetsRouter.post(
  "/for-user/:userId",
  validate(managerTimeEntrySchema),
  timesheetsController.managerTimeEntryHandler
);
timesheetsRouter.get("/me/status", timesheetsController.myStatusHandler);
timesheetsRouter.get("/", validate(listTimeEntriesQuerySchema), timesheetsController.listTimeEntriesHandler);
// AVANT "/:id" : sinon Express interpréterait "export"/"reconciliation" comme un id de pointage.
timesheetsRouter.get("/export", validate(exportTimeEntriesQuerySchema), timesheetsController.exportTimeEntriesHandler);
timesheetsRouter.get("/export.xlsx", validate(exportTimeEntriesQuerySchema), timesheetsController.exportTimeEntriesExcelHandler);
timesheetsRouter.get("/export.pdf", validate(exportTimeEntriesQuerySchema), timesheetsController.exportTimeEntriesPdfHandler);
timesheetsRouter.get(
  "/reconciliation",
  validate(reconciliationQuerySchema),
  timesheetsController.getReconciliationHandler
);
timesheetsRouter.get(
  "/reconciliation/:userId",
  validate(reconciliationDetailSchema),
  timesheetsController.getReconciliationDetailHandler
);
timesheetsRouter.get("/:id", validate(timeEntryIdParamSchema), timesheetsController.getTimeEntryHandler);
timesheetsRouter.post("/:id/validate", validate(validateTimeEntrySchema), timesheetsController.validateTimeEntryHandler);
timesheetsRouter.post("/:id/reject", validate(rejectTimeEntrySchema), timesheetsController.rejectTimeEntryHandler);
