import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as announcementsService from "./announcements.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementsService.createAnnouncement(actorOf(req), req.body, req.file?.buffer);
  res.status(201).json({ announcement });
});

export const getAnnouncementCoverPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await announcementsService.getAnnouncementCoverPhoto(req.params.id as string);
  const filePath = resolveStoragePath(photo.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo introuvable.");
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
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
