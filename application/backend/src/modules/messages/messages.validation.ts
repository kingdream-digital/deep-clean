import { z } from "zod";

export const threadParamSchema = {
  params: z.object({ userId: z.string().uuid() }),
};

export const threadQuerySchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};

export const sendMessageSchema = {
  // `body` est optionnel ici (retour explicite du client : joindre une photo
  // au message) — le contrôle "au moins l'un des deux (texte/photo)" est fait
  // dans messages.service.ts::sendMessage, seul endroit qui connaît aussi le
  // fichier éventuellement reçu par multer (req.file, hors de ce schéma).
  body: z.object({
    recipientId: z.string().uuid(),
    body: z.string().trim().max(4000).optional(),
  }),
};

export const contactIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const messageIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};
