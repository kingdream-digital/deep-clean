import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as einvoicingService from "./einvoicing.service";
import type { EinvoiceView } from "./einvoicing.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const getOverviewHandler = asyncHandler(async (_req: Request, res: Response) => {
  const overview = await einvoicingService.getEinvoicingOverview();
  res.status(200).json({ overview });
});

export const listEinvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { view, page, pageSize } = req.query as unknown as {
    view: EinvoiceView;
    page: number;
    pageSize: number;
  };
  res.status(200).json(await einvoicingService.listEinvoices(view, page, pageSize));
});

export const syncHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await einvoicingService.syncEinvoiceStatuses(actorOf(req));
  res.status(200).json({ result });
});

export const testConnectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await einvoicingService.testEinvoicingConnection(actorOf(req));
  res.status(200).json({ result });
});
