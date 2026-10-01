import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as notificationsService from "./notifications.service";

export const listNotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, excludeMessages } = req.query as unknown as {
    page: number;
    pageSize: number;
    excludeMessages?: boolean;
  };
  const result = await notificationsService.listNotifications(req.auth!.userId, page, pageSize, { excludeMessages });
  res.status(200).json(result);
});

export const markAsReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markAsRead(req.auth!.userId, req.params.id as string);
  res.status(200).json({ notification });
});

export const deleteNotificationHandler = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.deleteNotification(req.auth!.userId, req.params.id as string);
  res.status(204).send();
});

export const markAllAsReadHandler = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.markAllAsRead(req.auth!.userId);
  res.status(204).send();
});

export const registerPushTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.registerPushToken(req.auth!.userId, req.body.token, req.body.platform);
  res.status(204).send();
});

export const unregisterPushTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.unregisterPushToken(req.auth!.userId, req.body.token);
  res.status(204).send();
});
