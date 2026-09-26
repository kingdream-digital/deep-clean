import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as messagesService from "./messages.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId };
}

export const listContactsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await messagesService.listContacts(actorOf(req));
  res.status(200).json({ items });
});

export const getContactHandler = asyncHandler(async (req: Request, res: Response) => {
  const contact = await messagesService.getContactById(req.params.id as string);
  res.status(200).json({ contact });
});

export const listConversationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await messagesService.listConversations(actorOf(req));
  res.status(200).json({ items });
});

export const unreadCountHandler = asyncHandler(async (req: Request, res: Response) => {
  const unreadCount = await messagesService.getUnreadCount(actorOf(req));
  res.status(200).json({ unreadCount });
});

export const getThreadHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await messagesService.getThread(actorOf(req), req.params.userId as string, req.query as never);
  res.status(200).json(result);
});

export const sendMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const message = await messagesService.sendMessage(actorOf(req), req.body);
  res.status(201).json({ message });
});

export const markThreadReadHandler = asyncHandler(async (req: Request, res: Response) => {
  await messagesService.markThreadRead(actorOf(req), req.params.userId as string);
  res.status(204).send();
});
