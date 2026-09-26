import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  addCommentSchema,
  createProblemSchema,
  listProblemsQuerySchema,
  photoParamSchema,
  problemIdParamSchema,
  setProblemStatusSchema,
} from "./problems.validation";
import * as problemsController from "./problems.controller";

export const problemsRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (qui peut
// signaler, consulter, faire avancer le statut) dépend de l'affectation à la
// mission et de la propriété du chantier — entièrement vérifiée dans problems.service.ts.
problemsRouter.use(authenticate());

problemsRouter.post("/", validate(createProblemSchema), problemsController.createProblemHandler);
problemsRouter.get("/", validate(listProblemsQuerySchema), problemsController.listProblemsHandler);
problemsRouter.get("/:id", validate(problemIdParamSchema), problemsController.getProblemHandler);
problemsRouter.post("/:id/status", validate(setProblemStatusSchema), problemsController.setProblemStatusHandler);
problemsRouter.post("/:id/comments", validate(addCommentSchema), problemsController.addCommentHandler);

problemsRouter.post(
  "/:id/photos",
  validate(problemIdParamSchema),
  uploadPhoto,
  problemsController.addPhotoHandler
);
problemsRouter.get(
  "/:id/photos/:photoId/file",
  validate(photoParamSchema),
  problemsController.getPhotoFileHandler
);
problemsRouter.delete(
  "/:id/photos/:photoId",
  validate(photoParamSchema),
  problemsController.deletePhotoHandler
);
