import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as timesheetsService from "./timesheets.service";
import { exportTimeEntriesExcel, exportTimeEntriesPdf } from "./timesheets.export";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const clockInHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.clockIn(actorOf(req));
  res.status(201).json({ entry });
});

export const clockOutHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.clockOut(actorOf(req));
  res.status(200).json({ entry });
});

export const retroactiveTimeEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await timesheetsService.createRetroactiveTimeEntry(actorOf(req), req.body);
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
