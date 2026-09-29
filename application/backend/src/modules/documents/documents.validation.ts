import { z } from "zod";

export const uploadDocumentSchema = {
  body: z.object({
    targetUserId: z.string().uuid(),
    title: z.string().trim().min(1).max(150),
  }),
};

export const documentIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const userIdParamSchema = {
  params: z.object({ userId: z.string().uuid() }),
};
