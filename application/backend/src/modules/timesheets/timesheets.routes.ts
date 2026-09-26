import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  exportTimeEntriesQuerySchema,
  listTimeEntriesQuerySchema,
  reconciliationDetailSchema,
  reconciliationQuerySchema,
  rejectTimeEntrySchema,
  retroactiveTimeEntrySchema,
  timeEntryIdParamSchema,
  validateTimeEntrySchema,
} from "./timesheets.validation";
import * as timesheetsController from "./timesheets.controller";

export const timesheetsRouter = Router();

// Pas de restriction de rôle au niveau des routes : tout le monde pointe pour
// soi-même, la portée de consultation/validation dépend de l'équipe gérée et
// est entièrement vérifiée dans timesheets.service.ts.
timesheetsRouter.use(authenticate());

timesheetsRouter.post("/clock-in", timesheetsController.clockInHandler);
timesheetsRouter.post("/clock-out", timesheetsController.clockOutHandler);
timesheetsRouter.post(
  "/retroactive",
  validate(retroactiveTimeEntrySchema),
  timesheetsController.retroactiveTimeEntryHandler
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
