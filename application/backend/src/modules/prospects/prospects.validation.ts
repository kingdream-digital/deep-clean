import { z } from "zod";
import { ProspectStatus } from "@prisma/client";

const prospectFields = {
  companyName: z.string().trim().min(1).max(150),
  contactFirstName: z.string().trim().max(80).optional(),
  contactLastName: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(12).optional(),
  city: z.string().trim().max(100).optional(),
  siret: z.string().trim().max(20).optional(),
  source: z.string().trim().max(100).optional(),
  need: z.string().trim().max(2000).optional(),
  serviceType: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(4000).optional(),
};

export const createProspectSchema = {
  body: z.object({
    ...prospectFields,
    status: z.nativeEnum(ProspectStatus).optional(),
    nextFollowUpAt: z.coerce.date().optional(),
    // Un superviseur ne peut s'assigner qu'à lui-même — ce champ n'a d'effet
    // que pour RH/Direction/Admin (voir prospects.service.ts).
    assignedUserId: z.string().uuid().nullable().optional(),
  }),
};

export const updateProspectSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      companyName: prospectFields.companyName.optional(),
      contactFirstName: prospectFields.contactFirstName.nullable(),
      contactLastName: prospectFields.contactLastName.nullable(),
      jobTitle: prospectFields.jobTitle.nullable(),
      phone: prospectFields.phone.nullable(),
      email: prospectFields.email.nullable(),
      address: prospectFields.address.nullable(),
      postalCode: prospectFields.postalCode.nullable(),
      city: prospectFields.city.nullable(),
      siret: prospectFields.siret.nullable(),
      source: prospectFields.source.nullable(),
      need: prospectFields.need.nullable(),
      serviceType: prospectFields.serviceType.nullable(),
      notes: prospectFields.notes.nullable(),
      status: z.nativeEnum(ProspectStatus).optional(),
      nextFollowUpAt: z.coerce.date().nullable().optional(),
      assignedUserId: z.string().uuid().nullable().optional(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const prospectIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listProspectsQuerySchema = {
  query: z.object({
    status: z.nativeEnum(ProspectStatus).optional(),
    search: z.string().trim().max(200).optional(),
    assignedUserId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const convertProspectSchema = {
  params: z.object({ id: z.string().uuid() }),
};
