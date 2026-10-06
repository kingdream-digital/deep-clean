import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as invoicesService from "./invoices.service";
import * as einvoicingService from "../einvoicing/einvoicing.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.createInvoice(actorOf(req), req.body);
  res.status(201).json({ invoice });
});

export const listInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await invoicesService.listInvoices(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.getInvoiceById(actorOf(req), req.params.id as string);
  res.status(200).json({ invoice });
});

export const updateInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.updateInvoice(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ invoice });
});

export const validateInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.validateInvoice(actorOf(req), req.params.id as string);
  res.status(200).json({ invoice });
});

export const sendInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.sendInvoice(actorOf(req), req.params.id as string, req.body.message);
  res.status(200).json({ invoice });
});

export const getInvoicePdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const pdf = await invoicesService.getInvoicePdf(actorOf(req), req.params.id as string);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${req.params.id}.pdf"`);
  res.send(pdf);
});

export const markInvoicePaidHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.markInvoicePaid(actorOf(req), req.params.id as string);
  res.status(200).json({ invoice });
});

export const cancelInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.cancelInvoice(actorOf(req), req.params.id as string, req.body.comment);
  res.status(200).json({ invoice });
});

// Facture électronique (Super PDP) : état, envoi et mise à jour du statut.
export const getEinvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const readiness = await einvoicingService.getEinvoiceReadiness(req.params.id as string);
  res.status(200).json(readiness);
});

export const sendEinvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  await einvoicingService.sendInvoiceElectronically(actorOf(req), req.params.id as string);
  const invoice = await invoicesService.getInvoiceById(actorOf(req), req.params.id as string);
  res.status(200).json({ invoice });
});

export const refreshEinvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  await einvoicingService.refreshEinvoiceStatus(req.params.id as string);
  const invoice = await invoicesService.getInvoiceById(actorOf(req), req.params.id as string);
  res.status(200).json({ invoice });
});
