import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.");

export const listActivityLogsQuerySchema = {
  query: z.object({
    userId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(100).optional(),
    entityId: z.string().uuid().optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};
