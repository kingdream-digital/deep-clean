import { z } from "zod";
import { TimeEntryStatus } from "@prisma/client";

// Même pattern que missions.validation.ts : une seule source de vérité pour
// le format de date, réutilisée par tous les schémas ci-dessous (auparavant
// répétée en dur 6 fois dans ce fichier).
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ).");

export const listTimeEntriesQuerySchema = {
  query: z.object({
    userId: z.string().uuid().optional(),
    status: z.nativeEnum(TimeEntryStatus).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};

export const exportTimeEntriesQuerySchema = {
  query: z.object({
    userId: z.string().uuid().optional(),
    status: z.nativeEnum(TimeEntryStatus).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
  }),
};

export const timeEntryIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const validateTimeEntrySchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    comment: z.string().trim().max(2000).optional(),
  }),
};

export const rejectTimeEntrySchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    comment: z.string().trim().min(1, "Merci d'indiquer le motif du refus.").max(2000),
  }),
};

export const reconciliationQuerySchema = {
  query: z.object({
    from: dateString,
    to: dateString,
  }),
};

export const reconciliationDetailSchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    from: dateString,
    to: dateString,
  }),
};

export const retroactiveTimeEntrySchema = {
  body: z.object({
    clockIn: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)),
    clockOut: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)),
    comment: z.string().trim().max(2000).optional(),
  }),
};
