import { z } from "zod";
import { InvoiceStatus, QuoteItemUnit, SiteBillingMode } from "@prisma/client";

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive(),
  unit: z.nativeEnum(QuoteItemUnit),
  unitPriceHt: z.number().min(0),
  sourceQuoteItemId: z.string().uuid().optional(),
});

export const createInvoiceSchema = {
  body: z.object({
    clientId: z.string().uuid(),
    quoteId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    billingMode: z.nativeEnum(SiteBillingMode).optional(),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM")
      .optional(),
    dueDate: z.coerce.date().optional(),
    contactName: z.string().trim().max(150).optional(),
    contactEmail: z.string().trim().toLowerCase().email().optional(),
    contactPhone: z.string().trim().max(30).optional(),
    billingAddress: z.string().trim().max(300).optional(),
    siret: z.string().trim().max(20).optional(),
    paymentTerms: z.string().trim().max(1000).optional(),
    internalNotes: z.string().trim().max(4000).optional(),
    vatRate: z.number().min(0).max(100).optional().default(20),
    items: z.array(invoiceItemSchema).min(1, "Ajoutez au moins une ligne."),
  }),
};

export const updateInvoiceSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      dueDate: z.coerce.date().nullable().optional(),
      contactName: z.string().trim().max(150).nullable().optional(),
      contactEmail: z.string().trim().toLowerCase().email().nullable().optional(),
      contactPhone: z.string().trim().max(30).nullable().optional(),
      billingAddress: z.string().trim().max(300).nullable().optional(),
      siret: z.string().trim().max(20).nullable().optional(),
      paymentTerms: z.string().trim().max(1000).nullable().optional(),
      internalNotes: z.string().trim().max(4000).nullable().optional(),
      vatRate: z.number().min(0).max(100).optional(),
      items: z.array(invoiceItemSchema).min(1).optional(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const invoiceIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listInvoicesQuerySchema = {
  query: z.object({
    status: z
      .string()
      .optional()
      .transform((v) => v?.split(",") as InvoiceStatus[] | undefined),
    clientId: z.string().uuid().optional(),
    quoteId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const sendInvoiceSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ message: z.string().trim().max(2000).optional() }),
};

export const cancelInvoiceSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ comment: z.string().trim().max(2000).optional() }),
};
