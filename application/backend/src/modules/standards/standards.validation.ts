import { z } from "zod";

export const listStandardsQuerySchema = {
  // BUG CORRIGE (audit standards) : cette route n'avait aucune pagination,
  // contrairement à tous les autres listings du projet (sites, users,
  // missions, problems, messages, absences, timesheets, notifications) qui
  // exposent tous page/pageSize — confirmé en conditions réelles : un
  // chantier avec 32 standards se voyait renvoyer les 32 d'un coup, sans
  // aucune limite (fuite de perf potentielle si un chantier en accumule
  // des centaines). Même bornes que sites.validation.ts (page ≥ 1,
  // pageSize ≤ 100, défaut 20).
  query: z.object({
    siteId: z.string().uuid(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const standardIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const createStandardSchema = {
  body: z.object({
    siteId: z.string().uuid(),
    name: z.string().trim().min(1).max(150),
    tasks: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
    equipment: z.array(z.string().trim().min(1).max(150)).max(50).default([]),
    safetyInstructions: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
};

export const updateStandardSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().trim().min(1).max(150).optional(),
      tasks: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
      equipment: z.array(z.string().trim().min(1).max(150)).max(50).optional(),
      safetyInstructions: z.string().trim().max(2000).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};
