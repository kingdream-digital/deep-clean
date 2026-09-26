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
  body: z.object({
    recipientId: z.string().uuid(),
    body: z.string().trim().min(1, "Le message ne peut pas être vide.").max(4000),
  }),
};

export const contactIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};
