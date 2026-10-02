import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { resolveStoragePath } from "../../utils/storage";
import * as timesheetsService from "./timesheets.service";
import { exportTimeEntriesExcel, exportTimeEntriesPdf } from "./timesheets.export";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

// Le corps arrive en multipart (voir upload.middleware.ts::uploadPhoto), donc
// déjà coercé en nombres par clockPositionSchema au moment où ce handler
// s'exécute — req.body.accuracy peut cependant être absent (champ optionnel).
function positionOf(req: Request): { latitude: number; longitude: number; accuracy?: number } {
  return { latitude: req.body.latitude, longitude: req.body.longitude, accuracy: req.body.accuracy };
}

function requirePhoto(req: Request): Buffer {
  if (!req.file) {
    throw ApiError.badRequest(
      'Une photo est requise pour pointer (champ attendu : "photo") — c\'est elle qui sert de justificatif.'
    );
  }
  return req.file.buffer;
}

export const clockInHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.clockIn(actorOf(req), positionOf(req), requirePhoto(req));
  res.status(201).json({ entry });
});

export const clockOutHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.clockOut(actorOf(req), positionOf(req), requirePhoto(req));
  res.status(200).json({ entry });
});

async function streamTimeEntryPhoto(req: Request, res: Response, moment: "in" | "out"): Promise<void> {
  const photo = await timesheetsService.getTimeEntryPhoto(actorOf(req), req.params.id as string, moment);
  const filePath = resolveStoragePath(photo.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo introuvable.");
  }

  res.setHeader("Content-Type", photo.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
}

export const getClockInPhotoHandler = asyncHandler((req: Request, res: Response) => streamTimeEntryPhoto(req, res, "in"));
export const getClockOutPhotoHandler = asyncHandler((req: Request, res: Response) => streamTimeEntryPhoto(req, res, "out"));

export const retroactiveTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.createRetroactiveTimeEntry(actorOf(req), req.body);
  res.status(201).json({ entry });
});

export const managerTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.createTimeEntryForUser(actorOf(req), req.params.userId as string, req.body);
  res.status(201).json({ entry });
});

export const myStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await timesheetsService.getMyStatus(actorOf(req));
  res.status(200).json(result);
});

export const listTimeEntriesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await timesheetsService.listTimeEntries(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const exportTimeEntriesHandler = asyncHandler(async (req: Request, res: Response) => {
  const csv = await timesheetsService.exportTimeEntriesCsv(actorOf(req), req.query as never);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="pointages.csv"');
  res.status(200).send(csv);
});

export const exportTimeEntriesExcelHandler = asyncHandler(async (req: Request, res: Response) => {
  const buffer = await exportTimeEntriesExcel(actorOf(req), req.query as never);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="pointages.xlsx"');
  res.status(200).send(buffer);
});

export const exportTimeEntriesPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const buffer = await exportTimeEntriesPdf(actorOf(req), req.query as never);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="pointages.pdf"');
  res.status(200).send(buffer);
});

export const getTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.getTimeEntryById(actorOf(req), req.params.id as string);
  res.status(200).json({ entry });
});

export const validateTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.validateTimeEntry(actorOf(req), req.params.id as string, req.body.comment);
  res.status(200).json({ entry });
});

export const rejectTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.rejectTimeEntry(actorOf(req), req.params.id as string, req.body.comment);
  res.status(200).json({ entry });
});

export const getReconciliationHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await timesheetsService.getReconciliation(actorOf(req), req.query as never);
  res.status(200).json({ items });
});

export const getReconciliationDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const detail = await timesheetsService.getReconciliationDetail(actorOf(req), req.params.userId as string, req.query as never);
  res.status(200).json(detail);
});
