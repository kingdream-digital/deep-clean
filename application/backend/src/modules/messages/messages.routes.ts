import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  contactIdParamSchema,
  sendMessageSchema,
  threadParamSchema,
  threadQuerySchema,
} from "./messages.validation";
import * as messagesController from "./messages.controller";

export const messagesRouter = Router();

// Pas de restriction de rôle : tout compte actif peut contacter n'importe
// quel autre compte actif (retour explicite du client — messagerie interne
// ouverte à toute l'entreprise). La portée d'un fil est de toute façon
// verrouillée par construction de la requête (messages.service.ts) : un
// utilisateur ne peut voir que les fils dont il fait partie.
messagesRouter.use(authenticate());

messagesRouter.get("/contacts", messagesController.listContactsHandler);
messagesRouter.get("/contacts/:id", validate(contactIdParamSchema), messagesController.getContactHandler);
messagesRouter.get("/conversations", messagesController.listConversationsHandler);
messagesRouter.get("/unread-count", messagesController.unreadCountHandler);
messagesRouter.get("/with/:userId", validate(threadQuerySchema), messagesController.getThreadHandler);
messagesRouter.post("/", validate(sendMessageSchema), messagesController.sendMessageHandler);
messagesRouter.post("/with/:userId/read", validate(threadParamSchema), messagesController.markThreadReadHandler);
