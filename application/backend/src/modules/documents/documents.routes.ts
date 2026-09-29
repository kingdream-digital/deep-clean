import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadDocument } from "../../middleware/upload.middleware";
import { documentIdParamSchema, uploadDocumentSchema, userIdParamSchema } from "./documents.validation";
import * as documentsController from "./documents.controller";

export const documentsRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (qui
// peut déposer, qui peut consulter quoi) est entièrement vérifiée dans
// documents.service.ts — même convention que timesheets.routes.ts.
documentsRouter.use(authenticate());

// `uploadDocument` (multer) avant `validate` : multer doit d'abord parser le
// multipart pour peupler req.body (champs texte) — même ordre que
// timesheets.routes.ts::clock-in.
documentsRouter.post("/", uploadDocument, validate(uploadDocumentSchema), documentsController.uploadDocumentHandler);
documentsRouter.get("/me", documentsController.listMyDocumentsHandler);
documentsRouter.get("/user/:userId", validate(userIdParamSchema), documentsController.listUserDocumentsHandler);
documentsRouter.get("/:id/file", validate(documentIdParamSchema), documentsController.getDocumentFileHandler);
documentsRouter.delete("/:id", validate(documentIdParamSchema), documentsController.deleteDocumentHandler);
