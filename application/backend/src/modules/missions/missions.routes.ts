import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadDocument } from "../../middleware/upload.middleware";
import {
  conflictsQuerySchema,
  createMissionSchema,
  listMissionsQuerySchema,
  missionIdParamSchema,
  setStatusSchema,
  updateAssignmentsSchema,
  updateMissionSchema,
  upsertJobSheetSchema,
  validateMissionSchema,
} from "./missions.validation";
import * as missionsController from "./missions.controller";

export const missionsRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (quelles
// missions, quels chantiers, quels champs) dépend de la propriété du chantier
// et est entièrement vérifiée dans missions.service.ts (jamais côté mobile).
missionsRouter.use(authenticate());

missionsRouter.post("/", validate(createMissionSchema), missionsController.createMissionHandler);
missionsRouter.get("/", validate(listMissionsQuerySchema), missionsController.listMissionsHandler);
// AVANT "/:id" : sinon Express interpréterait "conflicts" comme un id de mission.
missionsRouter.get("/conflicts", validate(conflictsQuerySchema), missionsController.getAssignmentConflictsHandler);
missionsRouter.get("/:id", validate(missionIdParamSchema), missionsController.getMissionHandler);
missionsRouter.patch("/:id", validate(updateMissionSchema), missionsController.updateMissionHandler);
missionsRouter.post("/:id/cancel", validate(missionIdParamSchema), missionsController.cancelMissionHandler);
missionsRouter.post("/:id/status", validate(setStatusSchema), missionsController.setStatusHandler);
missionsRouter.put(
  "/:id/assignments",
  validate(updateAssignmentsSchema),
  missionsController.updateAssignmentsHandler
);
missionsRouter.post(
  "/:id/validate",
  validate(validateMissionSchema),
  missionsController.validateMissionHandler
);
missionsRouter.put(
  "/:id/job-sheet",
  validate(upsertJobSheetSchema),
  missionsController.upsertJobSheetHandler
);
missionsRouter.get(
  "/:id/time-entries",
  validate(missionIdParamSchema),
  missionsController.getMissionTimeEntriesHandler
);
missionsRouter.put(
  "/:id/standard-document",
  validate(missionIdParamSchema),
  uploadDocument,
  missionsController.attachStandardDocumentHandler
);
missionsRouter.get(
  "/:id/standard-document/file",
  validate(missionIdParamSchema),
  missionsController.getStandardDocumentFileHandler
);
missionsRouter.delete(
  "/:id/standard-document",
  validate(missionIdParamSchema),
  missionsController.removeStandardDocumentHandler
);
