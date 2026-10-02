import { InvoiceStatus, Prisma, QuoteItemUnit, QuoteStatus, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { escapeLikePattern } from "../../utils/likePattern";
import { sendMail } from "../../utils/mailer";
import { buildInvoicePdf } from "./invoices.pdf";

interface Actor {
  userId: string;
  role: Role;
}

const userSummarySelect = { id: true, firstName: true, lastName: true, email: true, role: true } as const;

const invoiceItemSelect = {
  id: true,
  description: true,
  quantity: true,
  unit: true,
  unitPriceHt: true,
  totalHt: true,
  sourceQuoteItemId: true,
  sortOrder: true,
} satisfies Prisma.InvoiceItemSelect;

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  clientId: true,
  client: { select: { id: true, companyName: true, email: true } },
  quoteId: true,
  quote: { select: { id: true, quoteNumber: true } },
  siteId: true,
  site: { select: { id: true, name: true } },
  createdById: true,
  createdBy: { select: userSummarySelect },
  status: true,
  billingMode: true,
  period: true,
  issueDate: true,
  dueDate: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  billingAddress: true,
  siret: true,
  paymentTerms: true,
  internalNotes: true,
  subtotalHt: true,
  vatRate: true,
  vatAmount: true,
  totalTtc: true,
  sentAt: true,
  paidAt: true,
  cancelledAt: true,
  cancelledComment: true,
  createdAt: true,
  updatedAt: true,
  items: { select: invoiceItemSelect, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  sourceQuoteItemId?: string;
}

function buildItemsData(items: InvoiceItemInput[]) {
  return items.map((item, index) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceHt: item.unitPriceHt,
    sourceQuoteItemId: item.sourceQuoteItemId,
    sortOrder: index,
    totalHt: round2(item.quantity * item.unitPriceHt),
  }));
}

function computeTotals(items: { totalHt: number }[], vatRate: number) {
  const subtotalHt = round2(items.reduce((sum, i) => sum + i.totalHt, 0));
  const vatAmount = round2(subtotalHt * (vatRate / 100));
  const totalTtc = round2(subtotalHt + vatAmount);
  return { subtotalHt, vatAmount, totalTtc };
}

function presentInvoice(invoice: InvoiceRow) {
  return invoice;
}

async function findInvoiceOrThrow(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw ApiError.notFound("Facture introuvable.");
  return invoice;
}

function assertIsEditable(invoice: { status: InvoiceStatus }): void {
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw ApiError.conflict("Cette facture n'est plus modifiable — seule une facture à préparer peut être modifiée.");
  }
}

async function generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  const count = await tx.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

interface CreateInvoiceInput {
  clientId: string;
  quoteId?: string;
  siteId?: string;
  billingMode?: "FLAT_RATE" | "PER_SERVICE";
  period?: string;
  dueDate?: Date;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  siret?: string;
  paymentTerms?: string;
  internalNotes?: string;
  vatRate?: number;
  items: InvoiceItemInput[];
}

// Facturation séparée du planning (§29/§40) : ne lit ni ne modifie jamais une
// mission — `quoteId`/`siteId` ne sont que des références informatives
// (traçabilité), jamais une source de vérité recalculée ici.
export async function createInvoice(actor: Actor, input: CreateInvoiceInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw ApiError.badRequest("Client introuvable.");

  let quote: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; billingAddress: string | null; siret: string | null } | null = null;
  if (input.quoteId) {
    const found = await prisma.quote.findUnique({ where: { id: input.quoteId } });
    if (!found) throw ApiError.badRequest("Devis introuvable.");
    if (found.clientId !== input.clientId) throw ApiError.badRequest("Le devis indiqué ne correspond pas au client.");
    if (found.status !== QuoteStatus.ACCEPTED) throw ApiError.badRequest("Seul un devis accepté peut servir de référence à une facture.");
    quote = found;
  }
  if (input.siteId) {
    const site = await prisma.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw ApiError.badRequest("Chantier introuvable.");
    if (site.clientId && site.clientId !== input.clientId) throw ApiError.badRequest("Le chantier indiqué ne correspond pas au client.");
  }

  const itemsData = buildItemsData(input.items);
  const totals = computeTotals(itemsData, input.vatRate ?? 20);

  const clientContactName = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ") || undefined;
  const contactName = input.contactName ?? quote?.contactName ?? clientContactName;
  const contactEmail = input.contactEmail ?? quote?.contactEmail ?? client.email ?? undefined;
  const contactPhone = input.contactPhone ?? quote?.contactPhone ?? client.phone ?? undefined;
  const billingAddress = input.billingAddress ?? quote?.billingAddress ?? client.billingAddress ?? undefined;
  const siret = input.siret ?? quote?.siret ?? client.siret ?? undefined;

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber(tx);
    return tx.invoice.create({
      data: {
        invoiceNumber,
        clientId: input.clientId,
        quoteId: input.quoteId,
        siteId: input.siteId,
        createdById: actor.userId,
        billingMode: input.billingMode ?? "FLAT_RATE",
        period: input.period,
        dueDate: input.dueDate,
        contactName,
        contactEmail,
        contactPhone,
        billingAddress,
        siret,
        paymentTerms: input.paymentTerms,
        internalNotes: input.internalNotes,
        vatRate: input.vatRate ?? 20,
        ...totals,
        items: { create: itemsData },
      },
      select: invoiceSelect,
    });
  });

  await logActivity({ userId: actor.userId, action: "INVOICE_CREATED", entityType: "Invoice", entityId: invoice.id, metadata: { quoteId: input.quoteId, siteId: input.siteId } });
  return presentInvoice(invoice);
}

interface ListInvoicesFilters {
  status?: InvoiceStatus[];
  clientId?: string;
  quoteId?: string;
  siteId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

// Réservé à RH/Direction/Admin (gate au niveau du routeur) — aucune portée
// supplémentaire à appliquer ici, contrairement aux prospects/devis.
export async function listInvoices(_actor: Actor, filters: ListInvoicesFilters) {
  const where: Prisma.InvoiceWhereInput = {
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.quoteId ? { quoteId: filters.quoteId } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.search
      ? {
          OR: [
            { invoiceNumber: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
            { client: { companyName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, select: invoiceSelect, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.invoice.count({ where }),
  ]);

  return { items: items.map(presentInvoice), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getInvoiceById(_actor: Actor, id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: invoiceSelect });
  if (!invoice) throw ApiError.notFound("Facture introuvable.");
  return presentInvoice(invoice);
}

interface UpdateInvoiceInput extends Partial<Omit<CreateInvoiceInput, "clientId" | "quoteId" | "siteId" | "billingMode" | "period">> {}

export async function updateInvoice(actor: Actor, id: string, input: UpdateInvoiceInput) {
  const existing = await findInvoiceOrThrow(id);
  assertIsEditable(existing);

  const itemsData = input.items ? buildItemsData(input.items) : null;
  const items = itemsData ?? (await prisma.invoiceItem.findMany({ where: { invoiceId: id } }));
  const totals = computeTotals(items, input.vatRate ?? existing.vatRate);

  const invoice = await prisma.$transaction(async (tx) => {
    if (itemsData) await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
        ...(input.siret !== undefined ? { siret: input.siret } : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
        ...totals,
        ...(itemsData ? { items: { create: itemsData } } : {}),
      },
      select: invoiceSelect,
    });
  });

  await logActivity({ userId: actor.userId, action: "INVOICE_UPDATED", entityType: "Invoice", entityId: id });
  return presentInvoice(invoice);
}

export async function validateInvoice(actor: Actor, id: string) {
  const existing = await findInvoiceOrThrow(id);
  if (existing.status !== InvoiceStatus.DRAFT) {
    throw ApiError.conflict("Seule une facture à préparer peut être validée.");
  }
  const invoice = await prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.VALIDATED }, select: invoiceSelect });
  await logActivity({ userId: actor.userId, action: "INVOICE_VALIDATED", entityType: "Invoice", entityId: id });
  return presentInvoice(invoice);
}

export async function sendInvoice(actor: Actor, id: string, message?: string) {
  const existing = await findInvoiceOrThrow(id);
  if (existing.status !== InvoiceStatus.VALIDATED) {
    throw ApiError.conflict("Seule une facture validée peut être envoyée.");
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: invoiceSelect });
  const recipient = invoice.contactEmail ?? invoice.client.email;
  if (!recipient) throw ApiError.badRequest("Aucune adresse email connue pour ce client — renseignez-en une avant l'envoi.");

  const pdf = await buildInvoicePdf(invoice);
  const greeting = invoice.contactName ? `Bonjour ${invoice.contactName},` : "Bonjour,";
  const text = [
    greeting,
    "",
    message?.trim() || `Veuillez trouver ci-joint notre facture ${invoice.invoiceNumber}.`,
    invoice.dueDate ? `Échéance de paiement : ${invoice.dueDate.toLocaleDateString("fr-FR", { timeZone: "UTC" })}.` : "",
    "",
    "Cordialement,",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail({
    to: recipient,
    subject: `Facture ${invoice.invoiceNumber} — ${invoice.client.companyName}`,
    text,
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
  });

  const updated = await prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT, sentAt: new Date() }, select: invoiceSelect });
  await logActivity({ userId: actor.userId, action: "INVOICE_SENT", entityType: "Invoice", entityId: id, metadata: { recipient } });
  return presentInvoice(updated);
}

export async function getInvoicePdf(_actor: Actor, id: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: invoiceSelect });
  if (!invoice) throw ApiError.notFound("Facture introuvable.");
  return buildInvoicePdf(invoice);
}

export async function markInvoicePaid(actor: Actor, id: string) {
  const existing = await findInvoiceOrThrow(id);
  if (existing.status !== InvoiceStatus.SENT) {
    throw ApiError.conflict("Seule une facture envoyée peut être marquée comme payée.");
  }
  const invoice = await prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.PAID, paidAt: new Date() }, select: invoiceSelect });
  await logActivity({ userId: actor.userId, action: "INVOICE_PAID", entityType: "Invoice", entityId: id });
  return presentInvoice(invoice);
}

export async function cancelInvoice(actor: Actor, id: string, comment?: string) {
  const existing = await findInvoiceOrThrow(id);
  if (existing.status === InvoiceStatus.PAID || existing.status === InvoiceStatus.CANCELLED) {
    throw ApiError.conflict("Cette facture ne peut plus être annulée.");
  }
  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelledComment: comment },
    select: invoiceSelect,
  });
  await logActivity({ userId: actor.userId, action: "INVOICE_CANCELLED", entityType: "Invoice", entityId: id, metadata: { comment } });
  return presentInvoice(invoice);
}
