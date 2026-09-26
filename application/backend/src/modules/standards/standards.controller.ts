import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as standardsService from "./standards.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const listStandardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { siteId: string; page: number; pageSize: number };
  const result = await standardsService.listStandards(actorOf(req), query.siteId, {
    page: query.page,
    pageSize: query.pageSize,
  });
  res.status(200).json(result);
});

export const getStandardHandler = asyncHandler(async (req: Request, res: Response) => {
  const standard = await standardsService.getStandardById(actorOf(req), req.params.id as string);
  res.status(200).json({ standard });
});

export const createStandardHandler = asyncHandler(async (req: Request, res: Response) => {
  const standard = await standardsService.createStandard(actorOf(req), req.body);
  res.status(201).json({ standard });
});

export const updateStandardHandler = asyncHandler(async (req: Request, res: Response) => {
  const standard = await standardsService.updateStandard(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ standard });
});

export const deleteStandardHandler = asyncHandler(async (req: Request, res: Response) => {
  await standardsService.deleteStandard(actorOf(req), req.params.id as string);
  res.status(204).send();
});

export const attachStandardDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest("Aucun fichier reçu (champ attendu : \"document\").");
  }
  const standard = await standardsService.attachStandardDocument(
    actorOf(req),
    req.params.id as string,
    req.file.buffer,
    req.file.originalname
  );
  res.status(200).json({ standard });
});

export const getStandardDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const doc = await standardsService.getStandardDocumentFile(actorOf(req), req.params.id as string);
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

export const removeStandardDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const standard = await standardsService.removeStandardDocument(actorOf(req), req.params.id as string);
  res.status(200).json({ standard });
});
