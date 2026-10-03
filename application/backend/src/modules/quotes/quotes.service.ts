import { Prisma, QuoteEventAction, QuoteFollowUpMethod, QuoteItemFrequency, QuoteItemUnit, QuoteStatus, Role } from "@prisma/client";
import { companyDateLabel } from "../../utils/companyTime";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { escapeLikePattern } from "../../utils/likePattern";
import { sendMail } from "../../utils/mailer";
import { COMMERCIAL_FULL_ROLES, isOwnRecord, resolveAssignedUserId } from "../commercial/roles";
import type { Actor } from "../commercial/roles";
import { buildQuotePdf } from "./quotes.pdf";
import { createNotification, markRelatedNotificationsRead } from "../notifications/notifications.service";

const userSummarySelect = { id: true, firstName: true, lastName: true, email: true, role: true } as const;

const quoteItemSelect = {
  id: true,
  description: true,
  quantity: true,
  unit: true,
  unitPriceHt: true,
  discount: true,
  totalHt: true,
  frequency: true,
  occurrencesPerMonth: true,
  monthlyAmountHt: true,
  estimatedHours: true,
  estimatedEmployees: true,
  sortOrder: true,
} satisfies Prisma.QuoteItemSelect;

const quoteSelect = {
  id: true,
  quoteNumber: true,
  clientId: true,
  client: { select: { id: true, companyName: true, contactFirstName: true, contactLastName: true, email: true, phone: true } },
  assignedUserId: true,
  assignedUser: { select: userSummarySelect },
  createdById: true,
  createdBy: { select: userSummarySelect },
  status: true,
  issueDate: true,
  validUntil: true,
  subject: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  billingAddress: true,
  siret: true,
  siteAddress: true,
  description: true,
  paymentTerms: true,
  internalNotes: true,
  subtotalHt: true,
  discount: true,
  vatRate: true,
  vatAmount: true,
  totalTtc: true,
  monthlyAmountHt: true,
  nextFollowUpAt: true,
  acceptedAt: true,
  acceptedById: true,
  acceptedBy: { select: userSummarySelect },
  acceptedMethod: true,
  acceptedComment: true,
  rejectedAt: true,
  rejectedComment: true,
  previousVersionId: true,
  nextVersion: { select: { id: true, quoteNumber: true } },
  // Chantier déjà créé à partir de ce devis (§19-21), le cas échéant — permet
  // au mobile de proposer soit "Créer un chantier", soit "Voir le chantier".
  site: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  items: { select: quoteItemSelect, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.QuoteSelect;

type QuoteRow = Prisma.QuoteGetPayload<{ select: typeof quoteSelect }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface QuoteItemInput {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  discount?: number;
  frequency?: QuoteItemFrequency;
  occurrencesPerMonth?: number;
  estimatedHours?: number;
  estimatedEmployees?: number;
}

// Calculs recalculés côté serveur à chaque écriture (cahier des charges
// §13 : "Le backend doit toujours recalculer les montants afin d'empêcher
// la manipulation des prix depuis le frontend") — jamais fait confiance à un
// total envoyé par le client.
function computeItemTotals(item: { quantity: number; unitPriceHt: number; discount: number; frequency: QuoteItemFrequency; occurrencesPerMonth?: number | null }) {
  const totalHt = round2(item.quantity * item.unitPriceHt * (1 - item.discount / 100));
  const monthlyAmountHt =
    item.frequency !== QuoteItemFrequency.ONE_TIME && item.occurrencesPerMonth ? round2(totalHt * item.occurrencesPerMonth) : 0;
  return { totalHt, monthlyAmountHt };
}

function computeQuoteTotals(items: { totalHt: number; monthlyAmountHt: number }[], discount: number, vatRate: number) {
  const subtotalHt = round2(items.reduce((sum, i) => sum + i.totalHt, 0));
  const taxableHt = Math.max(0, round2(subtotalHt - discount));
  const vatAmount = round2(taxableHt * (vatRate / 100));
  const totalTtc = round2(taxableHt + vatAmount);
  const monthlyAmountHt = round2(items.reduce((sum, i) => sum + i.monthlyAmountHt, 0));
  return { subtotalHt, vatAmount, totalTtc, monthlyAmountHt };
}

function buildItemsData(items: QuoteItemInput[]) {
  return items.map((item, index) => {
    const discount = item.discount ?? 0;
    const frequency = item.frequency ?? QuoteItemFrequency.ONE_TIME;
    const totals = computeItemTotals({ quantity: item.quantity, unitPriceHt: item.unitPriceHt, discount, frequency, occurrencesPerMonth: item.occurrencesPerMonth });
    return {
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceHt: item.unitPriceHt,
      discount,
      frequency,
      occurrencesPerMonth: item.occurrencesPerMonth,
      estimatedHours: item.estimatedHours,
      estimatedEmployees: item.estimatedEmployees,
      sortOrder: index,
      ...totals,
    };
  });
}

function presentQuote(quote: QuoteRow) {
  return quote;
}

// Notifications du circuit commercial (retour d'audit : la personne qui doit
// valider un devis ne l'apprenait qu'en ouvrant la liste). Destinataires
// selon le lien réel avec le devis, jamais l'auteur de l'action lui-même.
type QuoteNotice = "submitted" | "validated" | "accepted" | "rejected";

async function notifyQuote(actor: Actor, quote: { id: string; quoteNumber: string; assignedUserId: string | null; createdById: string; client: { companyName: string } }, notice: QuoteNotice) {
  const owner = quote.assignedUserId ?? quote.createdById;
  const recipients = new Set<string>();
  if (notice === "validated") {
    recipients.add(owner);
  } else {
    // Devis à valider / issue d'un devis : la direction et la RH (qui
    // valident et facturent), plus le commercial responsable.
    const managers = await prisma.user.findMany({ where: { role: { in: [Role.DIRECTOR, Role.HR] }, isActive: true }, select: { id: true } });
    for (const m of managers) recipients.add(m.id);
    if (notice !== "submitted") recipients.add(owner);
  }
  recipients.delete(actor.userId);
  if (recipients.size === 0) return;

  const label = `${quote.quoteNumber} — ${quote.client.companyName}`;
  const texts: Record<QuoteNotice, { title: string; body: string }> = {
    submitted: { title: "Devis à valider", body: `Le devis ${label} attend votre validation.` },
    validated: { title: "Devis validé", body: `Le devis ${label} a été validé : vous pouvez l'envoyer au client.` },
    accepted: { title: "Devis accepté", body: `Le client a accepté le devis ${label}. Prochaine étape : créer le chantier.` },
    rejected: { title: "Devis refusé", body: `Le client a refusé le devis ${label}.` },
  };
  const { title, body } = texts[notice];
  await Promise.all(
    [...recipients].map((userId) =>
      createNotification({ userId, type: "COMMERCIAL_UPDATE", title, body, relatedEntityType: "Quote", relatedEntityId: quote.id })
    )
  );
}

async function findQuoteOrThrow(id: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) throw ApiError.notFound("Devis introuvable.");
  return quote;
}

function assertCanAccessQuote(actor: Actor, quote: { assignedUserId: string | null; createdById: string }): void {
  if (COMMERCIAL_FULL_ROLES.includes(actor.role) || isOwnRecord(actor, quote)) return;
  throw ApiError.notFound("Devis introuvable.");
}

// Un devis n'est modifiable (champs + lignes) qu'à l'état BROUILLON (cahier
// des charges §14 : "Une fois accepté, le devis doit être verrouillé. Toute
// modification importante doit créer une nouvelle version") — appliqué dès
// le brouillon plutôt qu'à la seule acceptation : un devis déjà validé/envoyé
// a déjà pu être vu par le client, le modifier silencieusement serait
// trompeur. Voir createQuoteVersion() pour la voie de modification après coup.
function assertIsEditable(quote: { status: QuoteStatus }): void {
  if (quote.status !== QuoteStatus.DRAFT) {
    throw ApiError.conflict("Ce devis n'est plus modifiable directement : créez une nouvelle version.");
  }
}

// Typés explicitement en `QuoteStatus[]` (plutôt qu'un tuple littéral inféré)
// pour que `.includes(existing.status)` accepte bien n'importe quelle valeur
// de l'enum en argument.
const VALIDATABLE_STATUSES: QuoteStatus[] = [QuoteStatus.DRAFT, QuoteStatus.TO_VALIDATE];
const AWAITING_RESPONSE_STATUSES: QuoteStatus[] = [QuoteStatus.SENT, QuoteStatus.FOLLOW_UP];

async function generateQuoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DEV-${year}-`;
  const count = await tx.quote.count({ where: { quoteNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

interface CreateQuoteInput {
  clientId: string;
  assignedUserId?: string | null;
  validUntil?: Date;
  subject?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  siret?: string;
  siteAddress?: string;
  description?: string;
  paymentTerms?: string;
  internalNotes?: string;
  discount?: number;
  vatRate?: number;
  items: QuoteItemInput[];
}

export async function createQuote(actor: Actor, input: CreateQuoteInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw ApiError.badRequest("Client introuvable.");

  const assignedUserId = await resolveAssignedUserId(actor, input.assignedUserId);
  const itemsData = buildItemsData(input.items);
  const totals = computeQuoteTotals(itemsData, input.discount ?? 0, input.vatRate ?? 20);

  // Reprend les coordonnées du client par défaut (§32 : "Le système
  // préremplit : client ; coordonnées...") — figées sur le devis, jamais
  // relues depuis la fiche client après coup (voir assertIsEditable).
  const clientContactName = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ") || undefined;
  const contactName = input.contactName ?? clientContactName;
  const contactEmail = input.contactEmail ?? client.email ?? undefined;
  const contactPhone = input.contactPhone ?? client.phone ?? undefined;
  const billingAddress = input.billingAddress ?? client.billingAddress ?? undefined;
  const siret = input.siret ?? client.siret ?? undefined;

  const quote = await prisma.$transaction(async (tx) => {
    const quoteNumber = await generateQuoteNumber(tx);
    const created = await tx.quote.create({
      data: {
        quoteNumber,
        clientId: input.clientId,
        assignedUserId,
        createdById: actor.userId,
        validUntil: input.validUntil,
        subject: input.subject,
        contactName,
        contactEmail,
        contactPhone,
        billingAddress,
        siret,
        siteAddress: input.siteAddress,
        description: input.description,
        paymentTerms: input.paymentTerms,
        internalNotes: input.internalNotes,
        discount: input.discount ?? 0,
        vatRate: input.vatRate ?? 20,
        ...totals,
        items: { create: itemsData },
      },
      select: quoteSelect,
    });
    await tx.quoteEvent.create({ data: { quoteId: created.id, userId: actor.userId, action: QuoteEventAction.CREATED } });
    return created;
  });

  await logActivity({ userId: actor.userId, action: "QUOTE_CREATED", entityType: "Quote", entityId: quote.id });
  return presentQuote(quote);
}

interface ListQuotesFilters {
  status?: QuoteStatus[];
  clientId?: string;
  assignedUserId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listQuotes(actor: Actor, filters: ListQuotesFilters) {
  const scope = COMMERCIAL_FULL_ROLES.includes(actor.role)
    ? {}
    : { OR: [{ assignedUserId: actor.userId }, { createdById: actor.userId }] };

  const where: Prisma.QuoteWhereInput = {
    ...scope,
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
    ...(filters.search
      ? {
          OR: [
            { quoteNumber: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
            { subject: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
            { client: { companyName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.quote.findMany({ where, select: quoteSelect, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.quote.count({ where }),
  ]);

  return { items: items.map(presentQuote), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getQuoteById(actor: Actor, id: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id }, select: quoteSelect });
  return presentQuote(quote);
}

export async function listQuoteEvents(actor: Actor, id: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  return prisma.quoteEvent.findMany({
    where: { quoteId: id },
    include: { user: { select: userSummarySelect } },
    orderBy: { createdAt: "desc" },
  });
}

interface UpdateQuoteInput extends Partial<Omit<CreateQuoteInput, "clientId" | "items">> {
  items?: QuoteItemInput[];
}

export async function updateQuote(actor: Actor, id: string, input: UpdateQuoteInput) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  assertIsEditable(existing);

  // Un superviseur ne peut jamais réassigner un devis à quelqu'un d'autre —
  // seul RH/Direction/Admin en a le droit (même règle que Prospect, voir
  // prospects.service.ts::updateProspect).
  let assignedUserId: string | null | undefined;
  if ("assignedUserId" in input) {
    if (actor.role === Role.SUPERVISOR) {
      assignedUserId = undefined;
    } else if (input.assignedUserId) {
      await resolveAssignedUserId(actor, input.assignedUserId);
      assignedUserId = input.assignedUserId;
    } else {
      assignedUserId = null;
    }
  }

  const itemsData = input.items ? buildItemsData(input.items) : null;
  const items = itemsData ?? (await prisma.quoteItem.findMany({ where: { quoteId: id }, orderBy: { sortOrder: "asc" } }));
  const totals = computeQuoteTotals(items, input.discount ?? existing.discount, input.vatRate ?? existing.vatRate);

  const quote = await prisma.$transaction(async (tx) => {
    if (itemsData) {
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    }
    return tx.quote.update({
      where: { id },
      data: {
        ...(assignedUserId !== undefined ? { assignedUserId } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
        ...(input.siret !== undefined ? { siret: input.siret } : {}),
        ...(input.siteAddress !== undefined ? { siteAddress: input.siteAddress } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(input.discount !== undefined ? { discount: input.discount } : {}),
        ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
        ...totals,
        ...(itemsData ? { items: { create: itemsData } } : {}),
      },
      select: quoteSelect,
    });
  });

  await logActivity({ userId: actor.userId, action: "QUOTE_UPDATED", entityType: "Quote", entityId: id });
  return presentQuote(quote);
}

async function recordEvent(quoteId: string, userId: string, action: QuoteEventAction, extra?: { method?: QuoteFollowUpMethod; comment?: string; metadata?: Record<string, unknown> }) {
  await prisma.quoteEvent.create({ data: { quoteId, userId, action, method: extra?.method, comment: extra?.comment, metadata: extra?.metadata as never } });
}

// À valider (§14) — n'importe quel accesseur du devis peut le soumettre ;
// seule la validation elle-même (ci-dessous) est réservée à RH/Direction/Admin.
export async function submitQuoteForValidation(actor: Actor, id: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (existing.status !== QuoteStatus.DRAFT) {
    throw ApiError.conflict("Seul un devis en brouillon peut être soumis à validation.");
  }
  const quote = await prisma.quote.update({ where: { id }, data: { status: QuoteStatus.TO_VALIDATE }, select: quoteSelect });
  await recordEvent(id, actor.userId, QuoteEventAction.SUBMITTED_FOR_VALIDATION);
  await logActivity({ userId: actor.userId, action: "QUOTE_SUBMITTED_FOR_VALIDATION", entityType: "Quote", entityId: id });
  await notifyQuote(actor, quote, "submitted");
  return presentQuote(quote);
}

// Valider un devis (§1-2 : réservé à Directeur/RH, jamais au Superviseur —
// absent de sa liste de permissions §3).
export async function validateQuote(actor: Actor, id: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (!COMMERCIAL_FULL_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Seuls la RH, la Direction ou l'admin peuvent valider un devis.");
  }
  if (!VALIDATABLE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict("Ce devis n'est plus en attente de validation.");
  }
  const quote = await prisma.quote.update({ where: { id }, data: { status: QuoteStatus.VALIDATED }, select: quoteSelect });
  await recordEvent(id, actor.userId, QuoteEventAction.VALIDATED);
  await logActivity({ userId: actor.userId, action: "QUOTE_VALIDATED", entityType: "Quote", entityId: id });
  // « Devis à valider » n'a plus d'objet pour personne.
  await markRelatedNotificationsRead("Quote", id, "COMMERCIAL_UPDATE");
  await notifyQuote(actor, quote, "validated");
  return presentQuote(quote);
}

// Envoyer le devis par email (§16) — le client ne reçoit qu'un email + le
// PDF joint, jamais un accès à DeepClean. Le message personnalisable est
// ajouté au corps de l'email, jamais dans le PDF lui-même.
export async function sendQuote(actor: Actor, id: string, message?: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (existing.status !== QuoteStatus.VALIDATED) {
    throw ApiError.conflict("Seul un devis validé peut être envoyé.");
  }

  const quote = await prisma.quote.findUniqueOrThrow({ where: { id }, select: quoteSelect });
  const recipient = quote.contactEmail ?? quote.client.email;
  if (!recipient) {
    throw ApiError.badRequest("Aucune adresse email connue pour ce client — renseignez-en une avant l'envoi.");
  }

  const pdf = await buildQuotePdf(quote);
  const greeting = quote.contactName ? `Bonjour ${quote.contactName},` : "Bonjour,";
  const text = [
    greeting,
    "",
    message?.trim() || `Veuillez trouver ci-joint notre devis ${quote.quoteNumber}${quote.subject ? ` concernant "${quote.subject}"` : ""}.`,
    quote.validUntil ? `Ce devis est valable jusqu'au ${companyDateLabel(quote.validUntil)}.` : "",
    "",
    "Cordialement,",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail({
    to: recipient,
    subject: `Devis ${quote.quoteNumber} — ${quote.client.companyName}`,
    text,
    attachments: [{ filename: `${quote.quoteNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
  });

  const updated = await prisma.quote.update({ where: { id }, data: { status: QuoteStatus.SENT }, select: quoteSelect });
  await recordEvent(id, actor.userId, QuoteEventAction.SENT, { comment: message, metadata: { recipient } });
  await logActivity({ userId: actor.userId, action: "QUOTE_SENT", entityType: "Quote", entityId: id, metadata: { recipient } });
  return presentQuote(updated);
}

export async function getQuotePdf(actor: Actor, id: string): Promise<Buffer> {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id }, select: quoteSelect });
  return buildQuotePdf(quote);
}

// Relance (§17) — journalisée dans QuoteEvent, jamais réécrite ; fait passer
// le statut à "Relance en cours" tant que le devis reste sans réponse.
export async function recordQuoteFollowUp(actor: Actor, id: string, input: { method: QuoteFollowUpMethod; comment?: string; nextFollowUpAt?: Date }) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (!AWAITING_RESPONSE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict("La relance n'est possible que pour un devis envoyé, en attente de réponse.");
  }

  const quote = await prisma.quote.update({
    where: { id },
    data: { status: QuoteStatus.FOLLOW_UP, nextFollowUpAt: input.nextFollowUpAt ?? null },
    select: quoteSelect,
  });
  await recordEvent(id, actor.userId, QuoteEventAction.FOLLOW_UP, { method: input.method, comment: input.comment });
  await logActivity({ userId: actor.userId, action: "QUOTE_FOLLOW_UP", entityType: "Quote", entityId: id });
  return presentQuote(quote);
}

// Acceptation manuelle (§18) — jamais déclenchée par le client lui-même,
// toujours par un utilisateur DeepClean qui constate la confirmation reçue
// par un autre moyen (téléphone, email, signature...).
export async function markQuoteAccepted(actor: Actor, id: string, input: { method: QuoteFollowUpMethod; comment?: string }) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (!AWAITING_RESPONSE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict("Seul un devis envoyé peut être marqué comme accepté.");
  }

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status: QuoteStatus.ACCEPTED,
      acceptedAt: new Date(),
      acceptedById: actor.userId,
      acceptedMethod: input.method,
      acceptedComment: input.comment,
    },
    select: quoteSelect,
  });
  await recordEvent(id, actor.userId, QuoteEventAction.ACCEPTED, { method: input.method, comment: input.comment });
  await logActivity({ userId: actor.userId, action: "QUOTE_ACCEPTED", entityType: "Quote", entityId: id });
  await notifyQuote(actor, quote, "accepted");
  // Retour explicite du cahier des charges §19/§25/§40 : l'acceptation NE crée
  // JAMAIS automatiquement de chantier, de mission ni d'événement de planning
  // — volontairement aucun autre effet de bord ici.
  return presentQuote(quote);
}

export async function markQuoteRejected(actor: Actor, id: string, input: { comment?: string }) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (!AWAITING_RESPONSE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict("Seul un devis envoyé peut être marqué comme refusé.");
  }
  const quote = await prisma.quote.update({
    where: { id },
    data: { status: QuoteStatus.REJECTED, rejectedAt: new Date(), rejectedById: actor.userId, rejectedComment: input.comment },
    select: quoteSelect,
  });
  await recordEvent(id, actor.userId, QuoteEventAction.REJECTED, { comment: input.comment });
  await logActivity({ userId: actor.userId, action: "QUOTE_REJECTED", entityType: "Quote", entityId: id });
  await notifyQuote(actor, quote, "rejected");
  return presentQuote(quote);
}

export async function markQuoteExpired(actor: Actor, id: string) {
  const existing = await findQuoteOrThrow(id);
  assertCanAccessQuote(actor, existing);
  if (!AWAITING_RESPONSE_STATUSES.includes(existing.status)) {
    throw ApiError.conflict("Seul un devis envoyé peut être marqué comme expiré.");
  }
  const quote = await prisma.quote.update({ where: { id }, data: { status: QuoteStatus.EXPIRED }, select: quoteSelect });
  await recordEvent(id, actor.userId, QuoteEventAction.EXPIRED);
  await logActivity({ userId: actor.userId, action: "QUOTE_EXPIRED", entityType: "Quote", entityId: id });
  return presentQuote(quote);
}

// Nouvelle version (§14) — un devis non-brouillon est verrouillé ; toute
// modification importante repart d'une copie DRAFT distincte, l'original
// restant tel qu'il a été envoyé/accepté/refusé (traçabilité).
export async function createQuoteVersion(actor: Actor, id: string) {
  const existing = await prisma.quote.findUnique({ where: { id }, select: { ...quoteSelect, items: { select: quoteItemSelect } } });
  if (!existing) throw ApiError.notFound("Devis introuvable.");
  assertCanAccessQuote(actor, existing);
  if (existing.status === QuoteStatus.DRAFT) {
    throw ApiError.conflict("Ce devis est déjà un brouillon modifiable.");
  }

  const itemsData = existing.items.map((item, index) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceHt: item.unitPriceHt,
    discount: item.discount,
    totalHt: item.totalHt,
    frequency: item.frequency,
    occurrencesPerMonth: item.occurrencesPerMonth,
    monthlyAmountHt: item.monthlyAmountHt,
    estimatedHours: item.estimatedHours,
    estimatedEmployees: item.estimatedEmployees,
    sortOrder: index,
  }));

  const newQuote = await prisma.$transaction(async (tx) => {
    const quoteNumber = await generateQuoteNumber(tx);
    const created = await tx.quote.create({
      data: {
        quoteNumber,
        clientId: existing.clientId,
        assignedUserId: existing.assignedUserId,
        createdById: actor.userId,
        previousVersionId: existing.id,
        validUntil: existing.validUntil,
        subject: existing.subject,
        contactName: existing.contactName,
        contactEmail: existing.contactEmail,
        contactPhone: existing.contactPhone,
        billingAddress: existing.billingAddress,
        siret: existing.siret,
        siteAddress: existing.siteAddress,
        description: existing.description,
        paymentTerms: existing.paymentTerms,
        internalNotes: existing.internalNotes,
        subtotalHt: existing.subtotalHt,
        discount: existing.discount,
        vatRate: existing.vatRate,
        vatAmount: existing.vatAmount,
        totalTtc: existing.totalTtc,
        monthlyAmountHt: existing.monthlyAmountHt,
        items: { create: itemsData },
      },
      select: quoteSelect,
    });
    await tx.quoteEvent.create({ data: { quoteId: existing.id, userId: actor.userId, action: QuoteEventAction.NEW_VERSION_CREATED, metadata: { newQuoteId: created.id } } });
    return created;
  });

  await logActivity({ userId: actor.userId, action: "QUOTE_NEW_VERSION", entityType: "Quote", entityId: newQuote.id, metadata: { previousVersionId: existing.id } });
  return presentQuote(newQuote);
}
