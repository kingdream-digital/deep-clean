import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as quotesService from "./quotes.service";
import { ApiError } from "../../utils/ApiError";
import { getInboxStatus, inboxConfigured, syncQuoteInbox } from "../quoteReplies/quoteInbox";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.createQuote(actorOf(req), req.body);
  res.status(201).json({ quote });
});

export const listQuotesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await quotesService.listQuotes(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.getQuoteById(actorOf(req), req.params.id as string);
  res.status(200).json({ quote });
});

export const listQuoteEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await quotesService.listQuoteEvents(actorOf(req), req.params.id as string);
  res.status(200).json({ items });
});

export const updateQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.updateQuote(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ quote });
});

export const submitQuoteForValidationHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.submitQuoteForValidation(actorOf(req), req.params.id as string);
  res.status(200).json({ quote });
});

export const validateQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.validateQuote(actorOf(req), req.params.id as string);
  res.status(200).json({ quote });
});

export const sendQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.sendQuote(actorOf(req), req.params.id as string, req.body.message);
  res.status(200).json({ quote });
});

export const getQuotePdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const pdf = await quotesService.getQuotePdf(actorOf(req), req.params.id as string);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${req.params.id}.pdf"`);
  res.send(pdf);
});

export const recordQuoteFollowUpHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.recordQuoteFollowUp(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ quote });
});

export const markQuoteAcceptedHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.markQuoteAccepted(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ quote });
});

export const signQuoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await quotesService.signQuote(actorOf(req), req.params.id as string, req.body);
  res.status(200).json(result);
});

export const markQuoteRejectedHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.markQuoteRejected(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ quote });
});

export const markQuoteExpiredHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.markQuoteExpired(actorOf(req), req.params.id as string);
  res.status(200).json({ quote });
});

export const createQuoteVersionHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.createQuoteVersion(actorOf(req), req.params.id as string);
  res.status(201).json({ quote });
});

export const listQuoteRepliesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await quotesService.listQuoteReplies(actorOf(req), req.params.id as string));
});

export const decideQuoteReplyHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.decideQuoteReply(actorOf(req), req.params.replyId as string, req.body.decision);
  res.status(200).json({ quote });
});

export const getFollowUpEmailDraftHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ draft: await quotesService.getFollowUpEmailDraft(actorOf(req), req.params.id as string) });
});

export const sendFollowUpEmailHandler = asyncHandler(async (req: Request, res: Response) => {
  const quote = await quotesService.sendFollowUpEmail(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ quote });
});

export const getInboxStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ inbox: await getInboxStatus() });
});

export const syncInboxHandler = asyncHandler(async (_req: Request, res: Response) => {
  if (!inboxConfigured()) throw ApiError.badRequest("La lecture des réponses n'est pas configurée (boîte mail IMAP non renseignée).");
  try {
    const summary = await syncQuoteInbox();
    res.status(200).json({ summary, inbox: await getInboxStatus() });
  } catch (err) {
    throw ApiError.badRequest((err as Error).message);
  }
});
