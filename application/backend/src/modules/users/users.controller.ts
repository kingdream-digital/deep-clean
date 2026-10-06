import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as usersService from "./users.service";
import { exportEmployeeDossierPdf } from "./users.export";

export const createUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.createUser(req.auth!.userId, req.auth!.role, req.body);
  res.status(201).json(result);
});

export const listUsersHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.listUsers(req.auth!.role, req.query as never, req.auth!.userId);
  res.status(200).json(result);
});

export const getUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUserForViewer(req.auth!.role, req.params.id as string);
  res.status(200).json({ user });
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.updateUser(req.auth!.userId, req.auth!.role, req.params.id as string, req.body);
  res.status(200).json({ user });
});

export const activateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setUserActive(req.auth!.userId, req.auth!.role, req.params.id as string, true);
  res.status(200).json({ user });
});

export const deactivateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setUserActive(req.auth!.userId, req.auth!.role, req.params.id as string, false);
  res.status(200).json({ user });
});

export const resetUserAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.resetUserAccess(req.auth!.userId, req.auth!.role, req.params.id as string);
  res.status(200).json(result);
});

export const getEmployeeDossierHandler = asyncHandler(async (req: Request, res: Response) => {
  const dossier = await usersService.getEmployeeDossier(req.auth!.role, req.params.id as string);
  res.status(200).json(dossier);
});

export const setAvatarHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('Aucune photo reçue (champ attendu : "photo").');
  }
  const user = await usersService.setAvatar(req.auth!.userId, req.file.buffer);
  res.status(200).json({ user });
});

export const removeAvatarHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.removeAvatar(req.auth!.userId);
  res.status(200).json({ user });
});

export const getAvatarFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const avatar = await usersService.getAvatarFile(req.params.id as string);
  const filePath = resolveStoragePath(avatar.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo de profil introuvable.");
  }

  res.setHeader("Content-Type", avatar.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
});

export const exportEmployeeDossierPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const buffer = await exportEmployeeDossierPdf(
    { userId: req.auth!.userId, role: req.auth!.role },
    req.params.id as string,
    req.query as never
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="dossier-employe.pdf"');
  res.status(200).send(buffer);
});
