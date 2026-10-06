import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadMessageAttachment } from "../../middleware/upload.middleware";
import {
  addParticipantsSchema,
  contactIdParamSchema,
  conversationIdParamSchema,
  createGroupSchema,
  directConversationSchema,
  messageIdParamSchema,
  participantParamSchema,
  renameConversationSchema,
  sendMessageSchema,
  threadQuerySchema,
} from "./messages.validation";
import * as messagesController from "./messages.controller";

export const messagesRouter = Router();

// Pas de restriction de rôle : tout compte actif peut contacter n'importe
// quel autre compte actif, seul ou en groupe (retour explicite du client —
// messagerie interne ouverte à toute l'entreprise). La portée d'un fil est de
// toute façon verrouillée par construction (messages.service.ts
// `requireParticipant`) : un utilisateur ne voit que les fils dont il est
// membre, et répondre 404 plutôt que 403 ne révèle même pas leur existence.
messagesRouter.use(authenticate());

messagesRouter.get("/contacts", messagesController.listContactsHandler);
messagesRouter.get("/contacts/:id", validate(contactIdParamSchema), messagesController.getContactHandler);

messagesRouter.get("/conversations", messagesController.listConversationsHandler);
messagesRouter.post(
  "/conversations/direct",
  validate(directConversationSchema),
  messagesController.openDirectConversationHandler
);
messagesRouter.post("/conversations/group", validate(createGroupSchema), messagesController.createGroupHandler);
messagesRouter.get(
  "/conversations/:id",
  validate(conversationIdParamSchema),
  messagesController.getConversationHandler
);
messagesRouter.patch(
  "/conversations/:id",
  validate(renameConversationSchema),
  messagesController.renameConversationHandler
);
messagesRouter.get("/conversations/:id/messages", validate(threadQuerySchema), messagesController.getThreadHandler);
messagesRouter.post(
  "/conversations/:id/read",
  validate(conversationIdParamSchema),
  messagesController.markThreadReadHandler
);
messagesRouter.post(
  "/conversations/:id/participants",
  validate(addParticipantsSchema),
  messagesController.addParticipantsHandler
);
messagesRouter.delete(
  "/conversations/:id/participants/:userId",
  validate(participantParamSchema),
  messagesController.removeParticipantHandler
);
messagesRouter.post(
  "/conversations/:id/leave",
  validate(conversationIdParamSchema),
  messagesController.leaveConversationHandler
);

messagesRouter.get("/unread-count", messagesController.unreadCountHandler);

// `uploadMessageAttachment` (multer) avant `validate` : la pièce jointe est
// facultative, mais si elle est présente multer doit parser le multipart pour
// peupler req.body AVANT que validate() ne le lise — même ordre que
// announcements.routes.ts.
messagesRouter.post("/", uploadMessageAttachment, validate(sendMessageSchema), messagesController.sendMessageHandler);
messagesRouter.get("/:id/photo", validate(messageIdParamSchema), messagesController.getMessagePhotoHandler);
messagesRouter.get("/:id/document", validate(messageIdParamSchema), messagesController.getMessageDocumentHandler);
