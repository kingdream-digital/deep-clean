import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as missionsService from "./missions.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createMissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { recurrenceCount, ...mission } = await missionsService.createMission(actorOf(req), req.body);
  res.status(201).json({ mission, recurrenceCount });
});

export const listMissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await missionsService.listMissions(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getAssignmentConflictsHandler = asyncHandler(async (req: Request, res: Response) => {
  const conflicts = await missionsService.getAssignmentConflicts(actorOf(req), req.query as never);
  res.status(200).json({ conflicts });
});

export const getMissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.getMissionById(actorOf(req), req.params.id as string);
  res.status(200).json({ mission });
});

export const updateMissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.updateMission(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ mission });
});

export const cancelMissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { seriesCancelledCount, ...mission } = await missionsService.cancelMission(
    actorOf(req),
    req.params.id as string,
    req.body.scope
  );
  res.status(200).json({ mission, seriesCancelledCount });
});

export const setStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.setMissionStatus(actorOf(req), req.params.id as string, req.body.status);
  res.status(200).json({ mission });
});

export const updateAssignmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.updateAssignments(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ mission });
});

export const validateMissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.validateMission(actorOf(req), req.params.id as string, req.body.comment);
  res.status(200).json({ mission });
});

export const upsertJobSheetHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.upsertJobSheet(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ mission });
});

export const getMissionTimeEntriesHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await missionsService.getMissionTimeEntries(actorOf(req), req.params.id as string);
  res.status(200).json({ items });
});

export const attachStandardDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest("Aucun fichier reçu (champ attendu : \"document\").");
  }
  const mission = await missionsService.attachStandardDocument(
    actorOf(req),
    req.params.id as string,
    req.file.buffer,
    req.file.originalname
  );
  res.status(200).json({ mission });
});

export const getStandardDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const doc = await missionsService.getStandardDocumentFile(actorOf(req), req.params.id as string);
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
  const mission = await missionsService.removeStandardDocument(actorOf(req), req.params.id as string);
  res.status(200).json({ mission });
});

export const listMissionsToReassignHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await missionsService.listMissionsToReassign(actorOf(req));
  res.status(200).json({ items });
});

export const replaceAssigneeHandler = asyncHandler(async (req: Request, res: Response) => {
  const mission = await missionsService.replaceAssignee(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ mission });
});
