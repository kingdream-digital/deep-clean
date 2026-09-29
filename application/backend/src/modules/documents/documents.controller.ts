import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as documentsService from "./documents.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const uploadDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('Aucun fichier reçu (champ attendu : "document").');
  }
  const { targetUserId, title } = req.body as { targetUserId: string; title: string };
  const document = await documentsService.uploadDocument(actorOf(req), targetUserId, title, req.file.buffer, req.file.originalname);
  res.status(201).json({ document });
});

export const listMyDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const items = await documentsService.listDocuments(actor, actor.userId);
  res.status(200).json({ items });
});

export const listUserDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await documentsService.listDocuments(actorOf(req), req.params.userId as string);
  res.status(200).json({ items });
});

export const getDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const doc = await documentsService.getDocumentFile(actorOf(req), req.params.id as string);
  const filePath = resolveStoragePath(doc.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Document introuvable.");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
});

export const deleteDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  await documentsService.deleteDocument(actorOf(req), req.params.id as string);
  res.status(204).send();
});
