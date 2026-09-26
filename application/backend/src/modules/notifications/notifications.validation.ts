import { z } from "zod";

export const listNotificationsSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const notificationIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const registerPushTokenSchema = {
  body: z.object({
    token: z.string().min(1),
    platform: z.enum(["ios", "android"]),
  }),
};

export const unregisterPushTokenSchema = {
  body: z.object({
    token: z.string().min(1),
  }),
};
