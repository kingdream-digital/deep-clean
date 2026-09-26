import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
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

announcementsRouter.post("/", validate(createAnnouncementSchema), announcementsController.createAnnouncementHandler);
announcementsRouter.get("/", validate(listAnnouncementsQuerySchema), announcementsController.listAnnouncementsHandler);
announcementsRouter.get("/:id", validate(announcementIdParamSchema), announcementsController.getAnnouncementHandler);
