import { z } from "zod";

export const createSiteSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(150),
    address: z.string().trim().min(1).max(300),
    description: z.string().trim().max(2000).optional(),
    managerId: z.string().uuid().optional(),
    // Position GPS du chantier, capturée depuis le téléphone sur place (voir
    // mobile/utils/geolocation.ts) — jamais issue d'un service de géocodage,
    // toujours la position réelle de l'appareil au moment de la saisie.
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  }),
};

export const updateSiteSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().trim().min(1).max(150).optional(),
      address: z.string().trim().min(1).max(300).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      managerId: z.string().uuid().nullable().optional(),
      isActive: z.boolean().optional(),
      latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
      longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const siteIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listSitesQuerySchema = {
  query: z.object({
    isActive: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const addSiteMemberSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ userId: z.string().uuid() }),
};

export const removeSiteMemberSchema = {
  params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
};
