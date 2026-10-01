import { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { env } from "../../config/env";
import { resolveStoragePath } from "../../utils/storage";
import * as messagesService from "./messages.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId };
}

// `uploadMessageAttachment` utilise `.fields()` (photo OU document) : les
// fichiers arrivent donc dans `req.files` indexés par nom de champ, et non
// dans `req.file` comme avec `.single()`.
function attachmentOf(req: Request) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const photo = files?.photo?.[0];
  const document = files?.document?.[0];

  if (photo && photo.size > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
    throw ApiError.badRequest(`La photo ne doit pas dépasser ${env.MAX_UPLOAD_SIZE_MB} Mo.`);
  }

  return {
    photo: photo?.buffer,
    document: document ? { buffer: document.buffer, fileName: document.originalname } : undefined,
  };
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

export const getConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await messagesService.getConversation(actorOf(req), req.params.id as string);
  res.status(200).json({ conversation });
});

export const openDirectConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body as { userId: string };
  const conversation = await messagesService.getOrCreateDirectConversation(actorOf(req), userId);
  res.status(200).json({ conversation });
});

export const createGroupHandler = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await messagesService.createGroupConversation(actorOf(req), req.body as never);
  res.status(201).json({ conversation });
});

export const renameConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { title } = req.body as { title: string };
  const conversation = await messagesService.renameConversation(actorOf(req), req.params.id as string, title);
  res.status(200).json({ conversation });
});

export const addParticipantsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userIds } = req.body as { userIds: string[] };
  const conversation = await messagesService.addParticipants(actorOf(req), req.params.id as string, userIds);
  res.status(200).json({ conversation });
});

export const removeParticipantHandler = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await messagesService.removeParticipant(
    actorOf(req),
    req.params.id as string,
    req.params.userId as string
  );
  res.status(200).json({ conversation });
});

export const leaveConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  await messagesService.leaveConversation(actorOf(req), req.params.id as string);
  res.status(204).send();
});

export const getThreadHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await messagesService.getThread(actorOf(req), req.params.id as string, req.query as never);
  res.status(200).json(result);
});

export const sendMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const message = await messagesService.sendMessage(actorOf(req), req.body, attachmentOf(req));
  res.status(201).json({ message });
});

export const getMessagePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const photo = await messagesService.getMessagePhoto(actorOf(req), req.params.id as string);
  const filePath = resolveStoragePath(photo.storageKey);

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound("Photo introuvable.");
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
});

export const getMessageDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const doc = await messagesService.getMessageDocument(actorOf(req), req.params.id as string);
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

export const markThreadReadHandler = asyncHandler(async (req: Request, res: Response) => {
  await messagesService.markThreadRead(actorOf(req), req.params.id as string);
  res.status(204).send();
});
