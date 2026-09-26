import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as announcementsService from "./announcements.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementsService.createAnnouncement(actorOf(req), req.body);
  res.status(201).json({ announcement });
});

export const listAnnouncementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const result = await announcementsService.listAnnouncements(page, pageSize);
  res.status(200).json(result);
});

export const getAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementsService.getAnnouncementById(req.params.id as string);
  res.status(200).json({ announcement });
});
