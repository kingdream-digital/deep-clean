import { z } from "zod";

export const conversationIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const threadQuerySchema = {
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};

export const directConversationSchema = {
  body: z.object({ userId: z.string().uuid() }),
};

// Un groupe compte au minimum son créateur et deux autres personnes : à deux,
// c'est une conversation directe (voir messages.service.ts::createGroupConversation).
export const createGroupSchema = {
  body: z.object({
    title: z.string().trim().min(1, "Donnez un nom au groupe.").max(80),
    participantIds: z.array(z.string().uuid()).min(2, "Choisissez au moins deux collègues.").max(100),
  }),
};

export const renameConversationSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ title: z.string().trim().min(1, "Donnez un nom au groupe.").max(80) }),
};

export const addParticipantsSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }),
};

export const participantParamSchema = {
  params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
};

export const sendMessageSchema = {
  // `body` est optionnel ici (retour explicite du client : joindre une photo
  // ou un document au message) — le contrôle "au moins l'un des trois" est
  // fait dans messages.service.ts::sendMessage, seul endroit qui connaît
  // aussi le fichier éventuellement reçu par multer (req.file, hors de ce
  // schéma).
  body: z.object({
    conversationId: z.string().uuid(),
    body: z.string().trim().max(4000).optional(),
  }),
};

export const contactIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const messageIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};
