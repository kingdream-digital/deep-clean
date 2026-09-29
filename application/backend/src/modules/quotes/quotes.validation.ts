import { z } from "zod";
import { QuoteFollowUpMethod, QuoteItemFrequency, QuoteItemUnit } from "@prisma/client";

const quoteItemSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    quantity: z.number().positive(),
    unit: z.nativeEnum(QuoteItemUnit),
    unitPriceHt: z.number().min(0),
    discount: z.number().min(0).max(100).optional().default(0),
    frequency: z.nativeEnum(QuoteItemFrequency).optional().default(QuoteItemFrequency.ONE_TIME),
    // Requis pour toute fréquence récurrente (cahier des charges §11 : "6
    // passages par mois") — vérifié ici plutôt qu'au niveau base de données,
    // pour un message d'erreur clair adressé au bon champ.
    occurrencesPerMonth: z.number().positive().optional(),
    estimatedHours: z.number().min(0).optional(),
    estimatedEmployees: z.number().int().positive().optional(),
  })
  .refine((data) => data.frequency === QuoteItemFrequency.ONE_TIME || data.occurrencesPerMonth !== undefined, {
    message: "Indiquez le nombre de passages par mois pour une prestation récurrente.",
    path: ["occurrencesPerMonth"],
  });

const quoteFields = {
  clientId: z.string().uuid(),
  assignedUserId: z.string().uuid().nullable().optional(),
  validUntil: z.coerce.date().optional(),
  subject: z.string().trim().max(200).optional(),
  contactName: z.string().trim().max(150).optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional(),
  contactPhone: z.string().trim().max(30).optional(),
  billingAddress: z.string().trim().max(300).optional(),
  siret: z.string().trim().max(20).optional(),
  siteAddress: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  paymentTerms: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  discount: z.number().min(0).optional().default(0),
  vatRate: z.number().min(0).max(100).optional().default(20),
};

export const createQuoteSchema = {
  body: z.object({
    ...quoteFields,
    items: z.array(quoteItemSchema).min(1, "Ajoutez au moins une prestation."),
  }),
};

export const updateQuoteSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      assignedUserId: quoteFields.assignedUserId,
      validUntil: quoteFields.validUntil,
      subject: quoteFields.subject,
      contactName: quoteFields.contactName,
      contactEmail: quoteFields.contactEmail,
      contactPhone: quoteFields.contactPhone,
      billingAddress: quoteFields.billingAddress,
      siret: quoteFields.siret,
      siteAddress: quoteFields.siteAddress,
      description: quoteFields.description,
      paymentTerms: quoteFields.paymentTerms,
      internalNotes: quoteFields.internalNotes,
      discount: z.number().min(0).optional(),
      vatRate: z.number().min(0).max(100).optional(),
      items: z.array(quoteItemSchema).min(1).optional(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const quoteIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listQuotesQuerySchema = {
  query: z.object({
    status: z
      .string()
      .optional()
      .transform((v) => v?.split(",")),
    clientId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const sendQuoteSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ message: z.string().trim().max(2000).optional() }),
};

export const recordFollowUpSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    method: z.nativeEnum(QuoteFollowUpMethod),
    comment: z.string().trim().max(2000).optional(),
    nextFollowUpAt: z.coerce.date().optional(),
  }),
};

export const acceptQuoteSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    method: z.nativeEnum(QuoteFollowUpMethod),
    comment: z.string().trim().max(2000).optional(),
  }),
};

export const rejectQuoteSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ comment: z.string().trim().max(2000).optional() }),
};
