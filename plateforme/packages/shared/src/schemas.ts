import { z } from "zod";
import { ROLES } from "./roles";
import { UNITS } from "./catalog";
import { MAX_QUANTITY, MAX_UNIT_PRICE_CENTS, VAT_RATES_BPS } from "./money";
import { CLIENT_KINDS, PAYMENT_METHODS, VAT_REGIMES } from "./statuses";
import { isValidIban, isValidSiren, isValidSiret, normalizeDigits, passwordProblems } from "./validation";
import { isValidTimeZone } from "./format";

/**
 * Schémas de validation des entrées — utilisés tels quels par l'API (seule
 * validation qui fait foi) et par les formulaires de l'app (retour immédiat).
 */

// ---------------------------------------------------------------------------
// Briques communes
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .transform((v) => (v === "" ? null : v))
    .nullish();

const requiredText = (max: number, label = "Ce champ") =>
  z.string().trim().min(1, `${label} est obligatoire.`).max(max, `${max} caractères au maximum.`);

export const idSchema = z.uuid("Identifiant invalide.");
export const dateSchema = z.iso.date("Date invalide (format AAAA-MM-JJ).");
export const timeSchema = z.iso.time({ precision: -1, error: "Heure invalide (format HH:MM)." });
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide (format AAAA-MM).");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .transform((v) => (v === "" ? null : v))
  .nullish()
  .refine((v) => v == null || z.email().safeParse(v).success, "Adresse email invalide.");

const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((v) => (v === "" ? null : v))
  .nullish()
  .refine((v) => v == null || /^[+\d][\d\s.\-()]{5,}$/.test(v), "Numéro de téléphone invalide.");

const sirenSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizeDigits(v)))
  .nullish()
  .refine((v) => v == null || isValidSiren(v), "SIREN invalide (9 chiffres).");

const siretSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizeDigits(v)))
  .nullish()
  .refine((v) => v == null || isValidSiret(v), "SIRET invalide (14 chiffres).");

const vatRateSchema = z
  .number()
  .int()
  .refine((v) => (VAT_RATES_BPS as readonly number[]).includes(v), "Taux de TVA non autorisé.");

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  organization: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Indiquez le code de votre entreprise.")
    .max(64),
  identifier: requiredText(254, "L'identifiant"),
  password: z.string().min(1, "Le mot de passe est obligatoire.").max(256),
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.input<typeof loginSchema>;

export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  for (const problem of passwordProblems(value)) ctx.addIssue({ code: "custom", message: problem });
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Saisissez votre mot de passe actuel.").max(256),
  newPassword: newPasswordSchema,
});

// ---------------------------------------------------------------------------
// Entreprise (réglages du compte client de la plateforme)
// ---------------------------------------------------------------------------

export const organizationSettingsSchema = z.object({
  name: requiredText(120, "Le nom"),
  legalName: optionalText(160),
  legalForm: optionalText(40),
  shareCapital: optionalText(40),
  siren: sirenSchema,
  siret: siretSchema,
  vatNumber: optionalText(20),
  rcs: optionalText(80),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  postalCode: optionalText(12),
  city: optionalText(80),
  country: z.string().trim().length(2).toUpperCase().default("FR"),
  email: emailSchema,
  phone: phoneSchema,
  website: optionalText(200),
  iban: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(/\s/g, "").toUpperCase()))
    .nullish()
    .refine((v) => v == null || isValidIban(v), "IBAN invalide."),
  bic: optionalText(11),
  vatRegime: z.enum(VAT_REGIMES),
  defaultVatRateBps: vatRateSchema,
  paymentTermsDays: z.number().int().min(0).max(60, "60 jours au maximum (Code de commerce)."),
  quoteValidityDays: z.number().int().min(1).max(365),
  latePenaltyText: optionalText(300),
  timezone: z.string().refine(isValidTimeZone, "Fuseau horaire inconnu."),
  quotePrefix: z.string().trim().regex(/^[A-Z0-9-]{1,8}$/, "Lettres majuscules, chiffres et tirets (8 max)."),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9-]{1,8}$/, "Lettres majuscules, chiffres et tirets (8 max)."),
  creditNotePrefix: z.string().trim().regex(/^[A-Z0-9-]{1,8}$/, "Lettres majuscules, chiffres et tirets (8 max)."),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide.")
    .nullish(),
  emailSignature: optionalText(500),
});
export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;

// ---------------------------------------------------------------------------
// Comptes utilisateurs (gérés par la RH / l'administrateur du compte)
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  firstName: requiredText(60, "Le prénom"),
  lastName: requiredText(60, "Le nom"),
  role: z.enum(ROLES),
  email: emailSchema,
  phone: phoneSchema,
  jobTitle: optionalText(80),
  weeklyHours: z.number().min(0).max(60).nullish(),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial();
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const updateOwnProfileSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
});

// ---------------------------------------------------------------------------
// Clients, lieux d'intervention, catalogue
// ---------------------------------------------------------------------------

export const clientInputSchema = z.object({
  kind: z.enum(CLIENT_KINDS).default("COMPANY"),
  name: requiredText(200, "Le nom du client"),
  contactFirstName: optionalText(60),
  contactLastName: optionalText(60),
  email: emailSchema,
  phone: phoneSchema,
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  postalCode: optionalText(12),
  city: optionalText(80),
  country: z.string().trim().length(2).toUpperCase().default("FR"),
  siren: sirenSchema,
  siret: siretSchema,
  vatNumber: optionalText(20),
  notes: optionalText(2000),
});
export type ClientInput = z.input<typeof clientInputSchema>;
export const clientUpdateSchema = clientInputSchema.partial();

export const siteInputSchema = z.object({
  name: requiredText(120, "Le nom du lieu"),
  clientId: idSchema.nullish(),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  postalCode: optionalText(12),
  city: optionalText(80),
  accessNotes: optionalText(2000),
});
export type SiteInput = z.input<typeof siteInputSchema>;
export const siteUpdateSchema = siteInputSchema.partial();

export const catalogItemInputSchema = z.object({
  name: requiredText(160, "Le nom de la prestation"),
  description: optionalText(1000),
  unit: z.enum(UNITS),
  unitPriceCents: z.number().int().min(0).max(MAX_UNIT_PRICE_CENTS),
  vatRateBps: vatRateSchema,
  isActive: z.boolean().default(true),
});
export type CatalogItemInput = z.input<typeof catalogItemInputSchema>;
export const catalogItemUpdateSchema = catalogItemInputSchema.partial();

// ---------------------------------------------------------------------------
// Devis et factures
// ---------------------------------------------------------------------------

export const documentLineInputSchema = z.object({
  description: requiredText(500, "La désignation"),
  quantity: z.number().positive("La quantité doit être positive.").max(MAX_QUANTITY),
  unit: z.enum(UNITS),
  unitPriceCents: z.number().int().min(0, "Le prix ne peut pas être négatif.").max(MAX_UNIT_PRICE_CENTS),
  vatRateBps: vatRateSchema,
  discountBps: z.number().int().min(0).max(10_000).default(0),
  catalogItemId: idSchema.nullish(),
});
export type DocumentLineInput = z.input<typeof documentLineInputSchema>;

export const createQuoteSchema = z.object({
  clientId: idSchema,
  siteId: idSchema.nullish(),
  title: optionalText(160),
  issueDate: dateSchema.optional(),
  validUntil: dateSchema.optional(),
  notes: optionalText(4000),
  internalNotes: optionalText(4000),
  lines: z.array(documentLineInputSchema).max(200).default([]),
});
export type CreateQuoteInput = z.input<typeof createQuoteSchema>;
export const updateQuoteSchema = createQuoteSchema.partial();
export type UpdateQuoteInput = z.input<typeof updateQuoteSchema>;

export const createInvoiceSchema = z.object({
  clientId: idSchema,
  quoteId: idSchema.nullish(),
  siteId: idSchema.nullish(),
  title: optionalText(160),
  issueDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  servicePeriod: optionalText(80),
  notes: optionalText(4000),
  internalNotes: optionalText(4000),
  lines: z.array(documentLineInputSchema).max(200).default([]),
});
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export const updateInvoiceSchema = createInvoiceSchema.omit({ quoteId: true }).partial();
export type UpdateInvoiceInput = z.input<typeof updateInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive("Le montant doit être positif."),
  paidOn: dateSchema,
  method: z.enum(PAYMENT_METHODS).default("TRANSFER"),
  reference: optionalText(120),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const sendDocumentSchema = z.object({
  to: z.email("Adresse email invalide.").optional(),
  message: optionalText(2000),
});
export type SendDocumentInput = z.input<typeof sendDocumentSchema>;

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

const missionBaseSchema = z.object({
  title: requiredText(160, "Le titre"),
  siteId: idSchema.nullish(),
  clientId: idSchema.nullish(),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  assigneeIds: z.array(idSchema).max(50).default([]),
  teamLeadId: idSchema.nullish(),
  instructions: optionalText(4000),
});

export const createMissionSchema = missionBaseSchema.refine((m) => m.endTime > m.startTime, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
});
export type CreateMissionInput = z.input<typeof createMissionSchema>;

export const updateMissionSchema = missionBaseSchema.partial().refine((m) => !m.startTime || !m.endTime || m.endTime > m.startTime, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
});
export type UpdateMissionInput = z.input<typeof updateMissionSchema>;

export const missionInstructionsSchema = z.object({ instructions: optionalText(4000) });

export const planningQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  userId: idSchema.optional(),
  siteId: idSchema.optional(),
});

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------

export const ASSISTANT_INPUT_MODES = ["text", "voice"] as const;

export const assistantMessageSchema = z.object({
  text: z.string().trim().min(1, "Message vide.").max(4000, "Message trop long (4 000 caractères au maximum)."),
  mode: z.enum(ASSISTANT_INPUT_MODES).default("text"),
  /** Écran affiché dans l'app au moment de la demande (contexte pour l'assistant). */
  screen: z.string().max(120).optional(),
});
export type AssistantMessageInput = z.input<typeof assistantMessageSchema>;
