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

export const paySummaryQuerySchema = {
  query: z.object({
    userId: z.string().uuid().optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide (format AAAA-MM)."),
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

// Multipart (voir middleware/upload.middleware.ts::uploadPhoto) : latitude/
// longitude/accuracy arrivent en tant que champs texte du formulaire, donc en
// chaînes — coercition nécessaire. La photo elle-même (`req.file`) est
// vérifiée séparément dans le contrôleur, comme pour les signalements.
export const clockPositionSchema = {
  body: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    accuracy: z.coerce.number().nonnegative().optional(),
  }),
};

export const retroactiveTimeEntrySchema = {
  body: z.object({
    clockIn: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)),
    clockOut: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)),
    comment: z.string().trim().max(2000).optional(),
  }),
};

// Pointage saisi par un responsable pour un collaborateur, rattaché à une
// mission (oubli de pointer, confirmé par téléphone).
export const managerTimeEntrySchema = {
  params: z.object({ userId: z.string().uuid() }),
  body: z.object({
    missionId: z.string().uuid(),
    clockIn: z.string().datetime({ offset: true }),
    clockOut: z.string().datetime({ offset: true }),
    comment: z.string().trim().min(1, "Indiquez le motif, par exemple « Confirmé par téléphone, oubli de pointer ».").max(2000),
  }),
};
