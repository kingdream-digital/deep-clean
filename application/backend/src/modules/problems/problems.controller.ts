import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as problemsService from "./problems.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createProblemHandler = asyncHandler(async (req: Request, res: Response) => {
  const problem = await problemsService.createProblem(actorOf(req), req.body);
  res.status(201).json({ problem });
});

export const listProblemsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await problemsService.listProblems(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getProblemHandler = asyncHandler(async (req: Request, res: Response) => {
  const problem = await problemsService.getProblemById(actorOf(req), req.params.id as string);
  res.status(200).json({ problem });
});

export const setProblemStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const problem = await problemsService.setProblemStatus(actorOf(req), req.params.id as string, req.body.status);
  res.status(200).json({ problem });
});

export const addCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  const comment = await problemsService.addComment(actorOf(req), req.params.id as string, req.body.comment);
  res.status(201).json({ comment });
});

export const addPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest("Aucune photo reçue (champ attendu : \"photo\").");
  }
  const photo = await problemsService.addPhoto(actorOf(req), req.params.id as string, req.file.buffer);
  res.status(201).json({ photo });
});

export const getPhotoFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await problemsService.getPhotoFile(actorOf(req), req.params.id as string, req.params.photoId as string);
  const filePath = resolveStoragePath(photo.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo introuvable.");
  }

  res.setHeader("Content-Type", photo.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  // pipe() ne propage pas les erreurs runtime (fichier corrompu, I/O...) au
  // gestionnaire d'erreurs global : on les intercepte explicitement ici.
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
});

export const deletePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  await problemsService.deletePhoto(actorOf(req), req.params.id as string, req.params.photoId as string);
  res.status(204).send();
});
