import { z } from "zod";

export const leaveBalanceQuerySchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
};

export const leaveTransactionsQuerySchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
};

export const createLeaveAdjustmentSchema = {
  params: z.object({ userId: z.string().uuid() }),
  body: z.object({
    days: z.coerce.number().refine((v) => v !== 0, "Le nombre de jours ne peut pas être nul."),
    note: z.string().trim().max(500).optional(),
  }),
};
