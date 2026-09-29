import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as sitesService from "./sites.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.createSite(req.auth!.userId, req.body);
  res.status(201).json({ site });
});

export const listSitesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await sitesService.listSites(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.getSiteById(actorOf(req), req.params.id as string);
  res.status(200).json({ site });
});

export const updateSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.updateSite(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ site });
});

export const addSiteMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  await sitesService.addSiteMember(actorOf(req), req.params.id as string, req.body.userId);
  res.status(204).send();
});

export const removeSiteMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  await sitesService.removeSiteMember(actorOf(req), req.params.id as string, req.params.userId as string);
  res.status(204).send();
});

export const setSitePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('Aucune photo reçue (champ attendu : "photo").');
  }
  const site = await sitesService.setSitePhoto(actorOf(req), req.params.id as string, req.file.buffer);
  res.status(200).json({ site });
});

export const removeSitePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.removeSitePhoto(actorOf(req), req.params.id as string);
  res.status(200).json({ site });
});

export const getSitePhotoFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await sitesService.getSitePhotoFile(actorOf(req), req.params.id as string);
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
