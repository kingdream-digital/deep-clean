import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  listNotificationsSchema,
  notificationIdParamSchema,
  registerPushTokenSchema,
  unregisterPushTokenSchema,
} from "./notifications.validation";
import * as notificationsController from "./notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate());

notificationsRouter.get("/", validate(listNotificationsSchema), notificationsController.listNotificationsHandler);
notificationsRouter.post("/read-all", notificationsController.markAllAsReadHandler);
notificationsRouter.post(
  "/:id/read",
  validate(notificationIdParamSchema),
  notificationsController.markAsReadHandler
);
notificationsRouter.delete(
  "/:id",
  validate(notificationIdParamSchema),
  notificationsController.deleteNotificationHandler
);

notificationsRouter.post(
  "/push-tokens",
  validate(registerPushTokenSchema),
  notificationsController.registerPushTokenHandler
);
notificationsRouter.delete(
  "/push-tokens",
  validate(unregisterPushTokenSchema),
  notificationsController.unregisterPushTokenHandler
);
