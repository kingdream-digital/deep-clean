import { z } from "zod";

export const listEinvoicesQuerySchema = {
  query: z.object({
    view: z.enum(["toSend", "inProgress", "attention", "done"]).optional().default("toSend"),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};
