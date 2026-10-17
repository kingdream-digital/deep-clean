import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  announcementIdParamSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
} from "./announcements.validation";
import * as announcementsController from "./announcements.controller";

export const announcementsRouter = Router();

// Pas de restriction de rôle au niveau des routes : la lecture est ouverte à
// tout compte authentifié, la restriction de publication (RH/superviseur/
// direction/admin) est vérifiée dans announcements.service.ts.
announcementsRouter.use(authenticate());

// `uploadPhoto` (multer) avant `validate` : la photo de couverture est
// facultative (`.single()` ne l'exige pas), mais si présente, multer doit
// parser le multipart pour peupler req.body AVANT que validate() ne le lise —
// même ordre que timesheets.routes.ts::clock-in.
announcementsRouter.post(
  "/",
  uploadPhoto,
  validate(createAnnouncementSchema),
  announcementsController.createAnnouncementHandler
);
announcementsRouter.get("/", validate(listAnnouncementsQuerySchema), announcementsController.listAnnouncementsHandler);
announcementsRouter.get("/:id", validate(announcementIdParamSchema), announcementsController.getAnnouncementHandler);
announcementsRouter.get(
  "/:id/cover-photo",
  validate(announcementIdParamSchema),
  announcementsController.getAnnouncementCoverPhotoHandler
);
// Restriction de rôle vérifiée dans announcements.service.ts (ANNOUNCEMENT_DELETE_ROLES),
// même principe que la restriction de publication ci-dessus.
announcementsRouter.delete(
  "/:id",
  validate(announcementIdParamSchema),
  announcementsController.deleteAnnouncementHandler
);
