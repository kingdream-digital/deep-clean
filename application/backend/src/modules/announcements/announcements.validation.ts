import { z } from "zod";

export const createAnnouncementSchema = {
  body: z.object({
    title: z.string().trim().min(1, "Merci d'indiquer un titre.").max(160),
    body: z.string().trim().min(1, "Merci de rédiger le message.").max(4000),
  }),
};

export const announcementIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listAnnouncementsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};
