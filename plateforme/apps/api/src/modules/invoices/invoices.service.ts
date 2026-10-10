import {
  addDays,
  createInvoiceSchema,
  INVOICE_OPEN_STATUSES,
  recordPaymentSchema,
  sendDocumentSchema,
  updateInvoiceSchema,
  type CreateInvoiceInput,
  type InvoiceDto,
  type InvoiceKind,
  type InvoiceStatus,
  type InvoiceSummaryDto,
  type Page,
  type RecordPaymentInput,
  type SendDocumentInput,
  type UpdateInvoiceInput,
  type VatBreakdownEntry,
} from "@aussitot/shared";
import { decimalToNumber, fromDbDate, iso, seq, toDbDate, withTenant, type Db } from "../../lib/db.ts";
import { withTenantEffects, type AfterCommit } from "../../lib/afterCommit.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import { nextNumber } from "../../lib/numbering.ts";
import { todayIn } from "../../lib/time.ts";
import { prepareLines, toLineDto, type ParsedLine } from "../sales/lines.ts";
import { clientSnapshot, missingInvoiceMentions, sellerSnapshot } from "../sales/snapshots.ts";
import { lastEmailFor, queueEmail } from "../email/email.service.ts";
import { invoiceEmail, reminderEmail } from "../email/templates.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const invoiceInclude = {
  client: { select: { name: true, email: true } },
  site: { select: { name: true } },
  quote: { select: { number: true } },
  creditedInvoice: { select: { number: true } },
  lines: { orderBy: { position: "asc" } },
  payments: { orderBy: { paidOn: "asc" } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function isOverdue(invoice: { status: InvoiceStatus; dueDate: Date | null; kind: InvoiceKind }, today: string): boolean {
  return (
    invoice.kind === "INVOICE" &&
    INVOICE_OPEN_STATUSES.includes(invoice.status) &&
    Boolean(invoice.dueDate) &&
    fromDbDate(invoice.dueDate)! < today
  );
}

export function toInvoiceSummary(
  invoice: {
    id: string;
    kind: InvoiceKind;
    number: string | null;
    status: InvoiceStatus;
    title: string | null;
    clientId: string;
    issueDate: Date | null;
    dueDate: Date | null;
    totalCents: number;
    amountPaidCents: number;
    client: { name: string };
  },
  today: string,
): InvoiceSummaryDto {
  return {
    id: invoice.id,
    kind: invoice.kind,
    number: invoice.number,
    status: invoice.status,
    title: invoice.title,
    clientId: invoice.clientId,
    clientName: invoice.client.name,
    issueDate: fromDbDate(invoice.issueDate),
    dueDate: fromDbDate(invoice.dueDate),
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    isOverdue: isOverdue(invoice, today),
  };
}

async function toInvoiceDto(tx: Db, invoice: InvoiceWithRelations, today: string): Promise<InvoiceDto> {
  return {
    ...toInvoiceSummary(invoice, today),
    quoteId: invoice.quoteId,
    quoteNumber: invoice.quote?.number ?? null,
    siteId: invoice.siteId,
    siteName: invoice.site?.name ?? null,
    creditedInvoiceId: invoice.creditedInvoiceId,
    creditedInvoiceNumber: invoice.creditedInvoice?.number ?? null,
    servicePeriod: invoice.servicePeriod,
    notes: invoice.notes,
    internalNotes: invoice.internalNotes,
    subtotalCents: invoice.subtotalCents,
    vatCents: invoice.vatCents,
    vatBreakdown: invoice.vatBreakdown as unknown as VatBreakdownEntry[],
    vatExempt: invoice.vatExempt,
    lines: invoice.lines.map(toLineDto),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      paidOn: fromDbDate(p.paidOn),
      method: p.method,
      reference: p.reference,
      createdAt: p.createdAt.toISOString(),
    })),
    clientEmail: invoice.client.email,
    sentAt: iso(invoice.sentAt),
    paidAt: iso(invoice.paidAt),
    lastEmail: await lastEmailFor(tx, "invoice", invoice.id),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

async function loadInvoice(tx: Db, id: string): Promise<InvoiceWithRelations> {
  return assertFound(await tx.invoice.findUnique({ where: { id }, include: invoiceInclude }), "Facture introuvable.");
}

async function assertRefs(tx: Db, refs: { clientId?: string; siteId?: string | null; quoteId?: string | null }): Promise<void> {
  if (refs.clientId) {
    const client = await tx.client.findUnique({ where: { id: refs.clientId }, select: { archivedAt: true } });
    if (!client || client.archivedAt) throw AppError.validation({ clientId: ["Client introuvable."] });
  }
  if (refs.siteId && !(await tx.site.findUnique({ where: { id: refs.siteId }, select: { id: true } }))) {
    throw AppError.validation({ siteId: ["Lieu d'intervention introuvable."] });
  }
  if (refs.quoteId && !(await tx.quote.findUnique({ where: { id: refs.quoteId }, select: { id: true } }))) {
    throw AppError.validation({ quoteId: ["Devis introuvable."] });
  }
}

export async function listInvoices(
  ctx: Ctx,
  query: {
    status?: InvoiceStatus;
    overdue?: boolean;
    unpaid?: boolean;
    kind?: InvoiceKind;
    clientId?: string;
    q?: string;
    cursor?: string;
    limit: number;
  },
): Promise<Page<InvoiceSummaryDto>> {
  requirePermission(ctx, "invoices.read");
  const today = todayIn(ctx.timezone);
  return withTenant(ctx.orgId, async (tx) => {
    const where: Prisma.InvoiceWhereInput = { clientId: query.clientId, kind: query.kind, status: query.status };
    if (query.unpaid || query.overdue) where.status = { in: [...INVOICE_OPEN_STATUSES] };
    if (query.overdue) Object.assign(where, { kind: "INVOICE", dueDate: { lt: toDbDate(today) } });
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const invoices = await tx.invoice.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = invoices.length > query.limit;
    const items = invoices.slice(0, query.limit);
    return { items: items.map((i) => toInvoiceSummary(i, today)), nextCursor: hasMore ? items.at(-1)!.id : null };
  });
}

export async function getInvoice(ctx: Ctx, id: string): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.read");
  return withTenant(ctx.orgId, async (tx) => toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone)));
}

async function createDraft(
  tx: Db,
  ctx: Ctx,
  input: {
    clientId: string;
    quoteId?: string | null;
    siteId?: string | null;
    title?: string | null;
    dueDate?: string;
    servicePeriod?: string | null;
    notes?: string | null;
    internalNotes?: string | null;
    lines: ParsedLine[];
  },
) {
  await assertRefs(tx, input);
  const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const vatExempt = org.vatRegime === "FRANCHISE";
  const { lines, totals } = await prepareLines(tx, input.lines, { vatExempt });
  const invoice = await tx.invoice.create({
    data: {
      kind: "INVOICE",
      clientId: input.clientId,
      quoteId: input.quoteId ?? null,
      siteId: input.siteId ?? null,
      title: input.title ?? null,
      dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
      servicePeriod: input.servicePeriod ?? null,
      notes: input.notes ?? null,
      internalNotes: input.internalNotes ?? null,
      vatExempt,
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
      vatBreakdown: totals.vatBreakdown as unknown as Prisma.InputJsonValue,
      createdById: ctx.userId,
      lines: { create: lines },
    },
  });
  await logActivity(
    tx,
    ctx,
    "INVOICE_CREATED",
    { type: "invoice", id: invoice.id },
    { totalCents: totals.totalCents, fromQuote: input.quoteId ?? null },
  );
  return invoice;
}

/** Brouillon de facture : aucun numéro tant qu'elle n'est pas émise. */
export async function createInvoice(ctx: Ctx, raw: CreateInvoiceInput): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.write");
  const input = parse(createInvoiceSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const invoice = await createDraft(tx, ctx, input);
    return toInvoiceDto(tx, await loadInvoice(tx, invoice.id), todayIn(ctx.timezone));
  });
}

/** Facture reprenant les lignes d'un devis (accepté de préférence). */
export async function createInvoiceFromQuote(ctx: Ctx, quoteId: string): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.write");
  return withTenant(ctx.orgId, async (tx) => {
    const quote = assertFound(
      await tx.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } } } }),
      "Devis introuvable.",
    );
    if (quote.status === "CANCELLED" || quote.status === "DECLINED")
      throw AppError.conflict("Ce devis a été annulé ou refusé : il ne peut pas être facturé.");
    if (quote.lines.length === 0) throw AppError.validation({ quoteId: ["Ce devis ne contient aucune prestation."] });
    const invoice = await createDraft(tx, ctx, {
      clientId: quote.clientId,
      quoteId: quote.id,
      siteId: quote.siteId,
      title: quote.title,
      notes: null,
      lines: quote.lines.map((l) => ({
        description: l.description,
        quantity: decimalToNumber(l.quantity),
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        vatRateBps: l.vatRateBps,
        discountBps: l.discountBps,
        catalogItemId: l.catalogItemId,
      })),
    });
    return toInvoiceDto(tx, await loadInvoice(tx, invoice.id), todayIn(ctx.timezone));
  });
}

export async function updateInvoice(ctx: Ctx, id: string, raw: UpdateInvoiceInput): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.write");
  const input = parse(updateInvoiceSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.status !== "DRAFT")
      throw AppError.conflict("Une facture émise ne se modifie plus : établissez un avoir.", "INVOICE_LOCKED");
    await assertRefs(tx, { clientId: input.clientId, siteId: input.siteId });
    const data: Prisma.InvoiceUpdateInput = {
      client: input.clientId ? { connect: { id: input.clientId } } : undefined,
      site: input.siteId === null ? { disconnect: true } : input.siteId ? { connect: { id: input.siteId } } : undefined,
      title: input.title,
      dueDate: input.dueDate ? toDbDate(input.dueDate) : undefined,
      servicePeriod: input.servicePeriod,
      notes: input.notes,
      internalNotes: input.internalNotes,
    };
    if (input.lines) {
      const { lines, totals } = await prepareLines(tx, input.lines, { vatExempt: invoice.vatExempt });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({ data: lines.map((l) => ({ ...l, invoiceId: id })) });
      Object.assign(data, {
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        vatBreakdown: totals.vatBreakdown as unknown as Prisma.InputJsonValue,
      });
    }
    await tx.invoice.update({ where: { id }, data });
    await logActivity(tx, ctx, "INVOICE_UPDATED", { type: "invoice", id }, { fields: Object.keys(input) });
    return toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone));
  });
}

export async function deleteInvoice(ctx: Ctx, id: string): Promise<void> {
  requirePermission(ctx, "invoices.write");
  await withTenant(ctx.orgId, async (tx) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.status !== "DRAFT") throw AppError.conflict("Une facture émise ne peut pas être supprimée : établissez un avoir.");
    await tx.invoice.delete({ where: { id } });
    await logActivity(tx, ctx, "INVOICE_DELETED", { type: "invoice", id });
  });
}

/**
 * Émission : attribution du numéro légal (séquence continue), date du jour,
 * échéance, et gel des coordonnées. Refusée si une mention obligatoire manque.
 */
async function issueInTx(tx: Db, ctx: Ctx, invoice: InvoiceWithRelations): Promise<void> {
  if (invoice.lines.length === 0 || invoice.totalCents === 0) {
    throw AppError.validation({ lines: ["Ajoutez au moins une prestation avant d'émettre la facture."] });
  }
  const [org, client] = await seq(
    () => tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
    () => tx.client.findUniqueOrThrow({ where: { id: invoice.clientId } }),
  );
  const seller = sellerSnapshot(org);
  const buyer = clientSnapshot(client);
  const missing = missingInvoiceMentions(seller, buyer);
  if (missing.length) {
    throw AppError.validation({ mentions: missing }, "Informations obligatoires manquantes pour émettre la facture.");
  }
  const today = todayIn(org.timezone);
  const prefix = invoice.kind === "CREDIT_NOTE" ? org.creditNotePrefix : org.invoicePrefix;
  const number = await nextNumber(tx, invoice.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE", Number(today.slice(0, 4)), prefix);
  const dueDate = invoice.dueDate ? fromDbDate(invoice.dueDate) : addDays(today, org.paymentTermsDays);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      number,
      status: "ISSUED",
      issueDate: toDbDate(today),
      dueDate: invoice.kind === "CREDIT_NOTE" ? null : toDbDate(dueDate < today ? today : dueDate),
      issuedAt: new Date(),
      clientSnapshot: buyer as unknown as Prisma.InputJsonValue,
      sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
    },
  });
  await logActivity(
    tx,
    ctx,
    invoice.kind === "CREDIT_NOTE" ? "CREDIT_NOTE_ISSUED" : "INVOICE_ISSUED",
    { type: "invoice", id: invoice.id },
    { number, totalCents: invoice.totalCents },
  );
}

export async function issueInvoice(ctx: Ctx, id: string): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.issue");
  return withTenant(ctx.orgId, async (tx) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.status !== "DRAFT") throw AppError.conflict("Cette facture est déjà émise.");
    await issueInTx(tx, ctx, invoice);
    return toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone));
  });
}

async function queueInvoiceEmail(
  tx: Db,
  ctx: Ctx,
  after: AfterCommit,
  invoice: InvoiceWithRelations,
  to: string,
  message: string | null,
  reminder: boolean,
): Promise<void> {
  const [org, client, sender] = await seq(
    () => tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
    () => tx.client.findUniqueOrThrow({ where: { id: invoice.clientId } }),
    () => tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
  );
  const common = {
    orgName: org.name,
    senderName: `${sender.firstName} ${sender.lastName}`,
    contactName: [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ") || null,
    signature: org.emailSignature,
    message,
    number: invoice.number!,
    dueDate: fromDbDate(invoice.dueDate),
    iban: org.iban,
  };
  const { subject, text } = reminder
    ? reminderEmail({ ...common, remainingCents: invoice.totalCents - invoice.amountPaidCents })
    : invoiceEmail({ ...common, totalCents: invoice.totalCents, isCreditNote: invoice.kind === "CREDIT_NOTE" });
  await queueEmail(tx, ctx, after, {
    kind: reminder ? "INVOICE_REMINDER" : "INVOICE",
    entityType: "invoice",
    entityId: invoice.id,
    to,
    replyTo: sender.email ?? org.email,
    subject,
    body: text,
  });
}

/** Envoi au client (la facture est émise au passage si c'était un brouillon). */
export async function sendInvoice(ctx: Ctx, id: string, raw: SendDocumentInput = {}): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.issue");
  const input = parse(sendDocumentSchema, raw);
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    let invoice = await loadInvoice(tx, id);
    if (invoice.status === "CANCELLED") throw AppError.conflict("Cette facture est annulée.");
    const to = input.to ?? invoice.client.email;
    if (!to)
      throw AppError.validation({ to: ["Ce client n'a pas d'adresse email : ajoutez-la sur sa fiche ou précisez le destinataire."] });
    if (invoice.status === "DRAFT") {
      await issueInTx(tx, ctx, invoice);
      invoice = await loadInvoice(tx, id);
    }
    if (invoice.status === "ISSUED") await tx.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await queueInvoiceEmail(tx, ctx, after, invoice, to, input.message ?? null, false);
    await logActivity(tx, ctx, "INVOICE_SENT", { type: "invoice", id }, { number: invoice.number, to });
    return toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone));
  });
}

/** Relance d'une facture impayée. */
export async function remindInvoice(ctx: Ctx, id: string, raw: SendDocumentInput = {}): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.issue");
  const input = parse(sendDocumentSchema, raw);
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.kind !== "INVOICE" || !INVOICE_OPEN_STATUSES.includes(invoice.status)) {
      throw AppError.conflict("Seule une facture émise et non soldée peut être relancée.");
    }
    const to = input.to ?? invoice.client.email;
    if (!to) throw AppError.validation({ to: ["Ce client n'a pas d'adresse email."] });
    await queueInvoiceEmail(tx, ctx, after, invoice, to, input.message ?? null, true);
    await logActivity(tx, ctx, "INVOICE_REMINDER_SENT", { type: "invoice", id }, { number: invoice.number, to });
    return toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone));
  });
}

export async function recordPayment(ctx: Ctx, id: string, raw: RecordPaymentInput): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.payments");
  const input = parse(recordPaymentSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.kind !== "INVOICE" || !INVOICE_OPEN_STATUSES.includes(invoice.status)) {
      throw AppError.conflict("Un paiement ne peut être enregistré que sur une facture émise et non soldée.");
    }
    const remaining = invoice.totalCents - invoice.amountPaidCents;
    if (input.amountCents > remaining) {
      throw AppError.validation({ amountCents: [`Le montant dépasse le reste à payer.`] });
    }
    await tx.payment.create({
      data: {
        invoiceId: id,
        amountCents: input.amountCents,
        paidOn: toDbDate(input.paidOn),
        method: input.method,
        reference: input.reference ?? null,
        recordedById: ctx.userId,
      },
    });
    const paid = invoice.amountPaidCents + input.amountCents;
    const fully = paid >= invoice.totalCents;
    await tx.invoice.update({
      where: { id },
      data: { amountPaidCents: paid, status: fully ? "PAID" : "PARTIALLY_PAID", paidAt: fully ? new Date() : null },
    });
    await logActivity(
      tx,
      ctx,
      "INVOICE_PAYMENT_RECORDED",
      { type: "invoice", id },
      { amountCents: input.amountCents, method: input.method },
    );
    return toInvoiceDto(tx, await loadInvoice(tx, id), todayIn(ctx.timezone));
  });
}

/**
 * Annulation d'une facture émise : un avoir du même montant est émis (une
 * facture émise ne se supprime jamais). Possible tant qu'aucun paiement n'a
 * été enregistré.
 */
export async function cancelWithCreditNote(ctx: Ctx, id: string, reason?: string | null): Promise<InvoiceDto> {
  requirePermission(ctx, "invoices.issue");
  return withTenant(ctx.orgId, async (tx) => {
    const invoice = await loadInvoice(tx, id);
    if (invoice.kind !== "INVOICE") throw AppError.conflict("Un avoir ne peut pas être annulé.");
    if (invoice.status === "DRAFT") throw AppError.conflict("Un brouillon se supprime simplement, sans avoir.");
    if (invoice.status === "CANCELLED") throw AppError.conflict("Cette facture est déjà annulée.");
    if (invoice.amountPaidCents > 0)
      throw AppError.conflict("Cette facture a déjà reçu un paiement : contactez votre comptable pour un avoir partiel.");

    const { lines, totals } = await prepareLines(
      tx,
      invoice.lines.map((l) => ({
        description: l.description,
        quantity: Math.abs(decimalToNumber(l.quantity)),
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        vatRateBps: l.vatRateBps,
        discountBps: l.discountBps,
        catalogItemId: l.catalogItemId,
      })),
      { vatExempt: invoice.vatExempt, sign: -1 },
    );
    const credit = await tx.invoice.create({
      data: {
        kind: "CREDIT_NOTE",
        clientId: invoice.clientId,
        siteId: invoice.siteId,
        quoteId: invoice.quoteId,
        creditedInvoiceId: invoice.id,
        title: invoice.title ? `Annulation — ${invoice.title}` : "Annulation de facture",
        notes: reason ?? null,
        vatExempt: invoice.vatExempt,
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        vatBreakdown: totals.vatBreakdown as unknown as Prisma.InputJsonValue,
        createdById: ctx.userId,
        lines: { create: lines },
      },
    });
    await issueInTx(tx, ctx, await loadInvoice(tx, credit.id));
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    return toInvoiceDto(tx, await loadInvoice(tx, credit.id), todayIn(ctx.timezone));
  });
}
