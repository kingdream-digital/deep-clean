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

function sendCoverPhoto(res: Response, storageKey: string, cacheControl: string) {
  const filePath = resolveStoragePath(storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo introuvable.");
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", cacheControl);
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
}

export const getAnnouncementCoverPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await announcementsService.getAnnouncementCoverPhoto(req.params.id as string);
  sendCoverPhoto(res, photo.storageKey, "private, max-age=86400");
});

export const setAnnouncementVisibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementsService.setAnnouncementVisibility(actorOf(req), req.params.id as string, req.body.isPublic);
  res.status(200).json({ announcement });
});

// Accueil public (sans compte) : actualités marquées publiques uniquement.
export const listPublicNewsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  res.status(200).json(await announcementsService.listPublicNews(page, pageSize));
});

export const getPublicNewsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ news: await announcementsService.getPublicNews(req.params.id as string) });
});

export const getPublicNewsCoverPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await announcementsService.getPublicNewsCoverPhoto(req.params.id as string);
  sendCoverPhoto(res, photo.storageKey, "public, max-age=3600");
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

export const deleteAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  await announcementsService.deleteAnnouncement(actorOf(req), req.params.id as string);
  res.status(204).send();
});
