import { z } from "zod";

const clientFields = {
  companyName: z.string().trim().min(1).max(150),
  contactFirstName: z.string().trim().max(80).optional(),
  contactLastName: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  billingAddress: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(12).optional(),
  city: z.string().trim().max(100).optional(),
  siret: z.string().trim().max(20).optional(),
  // Mention obligatoire de la facture électronique (déduit du SIRET si vide).
  siren: z.string().trim().regex(/^\d{3}\s?\d{3}\s?\d{3}$/, "Le SIREN compte 9 chiffres.").optional(),
  notes: z.string().trim().max(4000).optional(),
};

export const createClientSchema = {
  body: z.object(clientFields),
};

export const updateClientSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      companyName: clientFields.companyName.optional(),
      contactFirstName: clientFields.contactFirstName.nullable(),
      contactLastName: clientFields.contactLastName.nullable(),
      jobTitle: clientFields.jobTitle.nullable(),
      phone: clientFields.phone.nullable(),
      email: clientFields.email.nullable(),
      billingAddress: clientFields.billingAddress.nullable(),
      postalCode: clientFields.postalCode.nullable(),
      city: clientFields.city.nullable(),
      siret: clientFields.siret.nullable(),
      siren: clientFields.siren.nullable(),
      notes: clientFields.notes.nullable(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const clientIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listClientsQuerySchema = {
  query: z.object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};
