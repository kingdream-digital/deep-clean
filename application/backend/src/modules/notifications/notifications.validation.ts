import { z } from "zod";

export const listNotificationsSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
    // Écarte les notifications « nouveau message ». Le tableau de bord s'en
    // sert pour son bloc « activité récente » : les messages y noyaient toute
    // l'activité métier (missions, pointages, signalements, validations)
    // alors qu'ils ont déjà leur onglet dédié, avec son propre compteur.
    excludeMessages: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
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
