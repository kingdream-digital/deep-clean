import {
  addDays,
  createQuoteSchema,
  sendDocumentSchema,
  updateQuoteSchema,
  type CreateQuoteInput,
  type Page,
  type QuoteDto,
  type QuoteStatus,
  type QuoteSummaryDto,
  type SendDocumentInput,
  type UpdateQuoteInput,
  type VatBreakdownEntry,
} from "@aussitot/shared";
import { fromDbDate, iso, seq, toDbDate, withTenant, type Db } from "../../lib/db.ts";
import { withTenantEffects } from "../../lib/afterCommit.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import { nextNumber } from "../../lib/numbering.ts";
import { todayIn } from "../../lib/time.ts";
import { prepareLines, toLineDto } from "../sales/lines.ts";
import { clientSnapshot, sellerSnapshot } from "../sales/snapshots.ts";
import { lastEmailFor, queueEmail } from "../email/email.service.ts";
import { quoteEmail } from "../email/templates.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const quoteInclude = {
  client: { select: { name: true, email: true } },
  site: { select: { name: true } },
  lines: { orderBy: { position: "asc" } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  invoices: { select: { id: true } },
} satisfies Prisma.QuoteInclude;

type QuoteWithRelations = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

/** Un devis envoyé dont la date de validité est passée s'affiche « Expiré ». */
export function displayQuoteStatus(status: QuoteStatus, validUntil: Date | null, today: string): QuoteStatus {
  if (status === "SENT" && validUntil && fromDbDate(validUntil) < today) return "EXPIRED";
  return status;
}

export function toQuoteSummary(
  quote: {
    id: string;
    number: string;
    status: QuoteStatus;
    title: string | null;
    clientId: string;
    issueDate: Date;
    validUntil: Date | null;
    subtotalCents: number;
    totalCents: number;
    sentAt: Date | null;
    client: { name: string };
  },
  today: string,
): QuoteSummaryDto {
  return {
    id: quote.id,
    number: quote.number,
    status: displayQuoteStatus(quote.status, quote.validUntil, today),
    title: quote.title,
    clientId: quote.clientId,
    clientName: quote.client.name,
    issueDate: fromDbDate(quote.issueDate),
    validUntil: fromDbDate(quote.validUntil),
    subtotalCents: quote.subtotalCents,
    totalCents: quote.totalCents,
    sentAt: iso(quote.sentAt),
  };
}

async function toQuoteDto(tx: Db, quote: QuoteWithRelations, today: string): Promise<QuoteDto> {
  return {
    ...toQuoteSummary(quote, today),
    siteId: quote.siteId,
    siteName: quote.site?.name ?? null,
    notes: quote.notes,
    internalNotes: quote.internalNotes,
    vatCents: quote.vatCents,
    vatBreakdown: quote.vatBreakdown as unknown as VatBreakdownEntry[],
    vatExempt: quote.vatExempt,
    lines: quote.lines.map(toLineDto),
    clientEmail: quote.client.email,
    acceptedAt: iso(quote.acceptedAt),
    declinedAt: iso(quote.declinedAt),
    lastEmail: await lastEmailFor(tx, "quote", quote.id),
    invoiceIds: quote.invoices.map((i) => i.id),
    createdBy: quote.createdBy ? { id: quote.createdBy.id, name: `${quote.createdBy.firstName} ${quote.createdBy.lastName}` } : null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

async function loadQuote(tx: Db, id: string): Promise<QuoteWithRelations> {
  return assertFound(await tx.quote.findUnique({ where: { id }, include: quoteInclude }), "Devis introuvable.");
}

async function assertClientAndSite(tx: Db, clientId: string | undefined, siteId: string | null | undefined): Promise<void> {
  if (clientId) {
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { archivedAt: true } });
    if (!client || client.archivedAt) throw AppError.validation({ clientId: ["Client introuvable."] });
  }
  if (siteId && !(await tx.site.findUnique({ where: { id: siteId }, select: { id: true } }))) {
    throw AppError.validation({ siteId: ["Lieu d'intervention introuvable."] });
  }
}

export async function listQuotes(
  ctx: Ctx,
  query: { status?: QuoteStatus; clientId?: string; q?: string; cursor?: string; limit: number },
): Promise<Page<QuoteSummaryDto>> {
  requirePermission(ctx, "quotes.read");
  const today = todayIn(ctx.timezone);
  return withTenant(ctx.orgId, async (tx) => {
    const where: Prisma.QuoteWhereInput = { clientId: query.clientId };
    if (query.status === "EXPIRED") Object.assign(where, { status: "SENT", validUntil: { lt: toDbDate(today) } });
    else if (query.status === "SENT")
      Object.assign(where, { status: "SENT", OR: [{ validUntil: null }, { validUntil: { gte: toDbDate(today) } }] });
    else if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.AND = [
        {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
      ];
    }
    const quotes = await tx.quote.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = quotes.length > query.limit;
    const items = quotes.slice(0, query.limit);
    return { items: items.map((q) => toQuoteSummary(q, today)), nextCursor: hasMore ? items.at(-1)!.id : null };
  });
}

export async function getQuote(ctx: Ctx, id: string): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.read");
  return withTenant(ctx.orgId, async (tx) => toQuoteDto(tx, await loadQuote(tx, id), todayIn(ctx.timezone)));
}

export async function createQuote(ctx: Ctx, raw: CreateQuoteInput): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.write");
  const input = parse(createQuoteSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    await assertClientAndSite(tx, input.clientId, input.siteId);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
    const today = todayIn(org.timezone);
    const issueDate = input.issueDate ?? today;
    const validUntil = input.validUntil ?? addDays(issueDate, org.quoteValidityDays);
    if (validUntil < issueDate) throw AppError.validation({ validUntil: ["La date de validité doit suivre la date d'émission."] });
    const vatExempt = org.vatRegime === "FRANCHISE";
    const { lines, totals } = await prepareLines(tx, input.lines, { vatExempt });
    const number = await nextNumber(tx, "QUOTE", Number(issueDate.slice(0, 4)), org.quotePrefix);
    const quote = await tx.quote.create({
      data: {
        number,
        clientId: input.clientId,
        siteId: input.siteId ?? null,
        title: input.title ?? null,
        issueDate: toDbDate(issueDate),
        validUntil: toDbDate(validUntil),
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
    await logActivity(tx, ctx, "QUOTE_CREATED", { type: "quote", id: quote.id }, { number, totalCents: totals.totalCents });
    return toQuoteDto(tx, await loadQuote(tx, quote.id), today);
  });
}

/** Seul un brouillon se modifie : un devis envoyé reste tel que le client l'a reçu. */
export async function updateQuote(ctx: Ctx, id: string, raw: UpdateQuoteInput): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.write");
  const input = parse(updateQuoteSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const quote = await loadQuote(tx, id);
    if (quote.status !== "DRAFT")
      throw AppError.conflict("Ce devis a déjà été envoyé : dupliquez-le pour en faire une nouvelle version.", "QUOTE_LOCKED");
    await assertClientAndSite(tx, input.clientId, input.siteId);
    const data: Prisma.QuoteUpdateInput = {
      client: input.clientId ? { connect: { id: input.clientId } } : undefined,
      site: input.siteId === null ? { disconnect: true } : input.siteId ? { connect: { id: input.siteId } } : undefined,
      title: input.title,
      issueDate: input.issueDate ? toDbDate(input.issueDate) : undefined,
      validUntil: input.validUntil ? toDbDate(input.validUntil) : undefined,
      notes: input.notes,
      internalNotes: input.internalNotes,
    };
    if (input.lines) {
      const { lines, totals } = await prepareLines(tx, input.lines, { vatExempt: quote.vatExempt });
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      await tx.quoteLine.createMany({ data: lines.map((l) => ({ ...l, quoteId: id })) });
      Object.assign(data, {
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        vatBreakdown: totals.vatBreakdown as unknown as Prisma.InputJsonValue,
      });
    }
    await tx.quote.update({ where: { id }, data });
    await logActivity(tx, ctx, "QUOTE_UPDATED", { type: "quote", id }, { fields: Object.keys(input) });
    return toQuoteDto(tx, await loadQuote(tx, id), todayIn(ctx.timezone));
  });
}

export async function deleteQuote(ctx: Ctx, id: string): Promise<void> {
  requirePermission(ctx, "quotes.write");
  await withTenant(ctx.orgId, async (tx) => {
    const quote = await loadQuote(tx, id);
    if (quote.status !== "DRAFT") throw AppError.conflict("Seul un brouillon peut être supprimé. Annulez plutôt ce devis.");
    await tx.quote.delete({ where: { id } });
    await logActivity(tx, ctx, "QUOTE_DELETED", { type: "quote", id }, { number: quote.number });
  });
}

/** Envoi au client par email, PDF joint. Le devis est figé au premier envoi. */
export async function sendQuote(ctx: Ctx, id: string, raw: SendDocumentInput = {}): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.send");
  const input = parse(sendDocumentSchema, raw);
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    const quote = await loadQuote(tx, id);
    if (quote.status !== "DRAFT" && quote.status !== "SENT") {
      throw AppError.conflict("Ce devis ne peut plus être envoyé (déjà accepté, refusé ou annulé).");
    }
    if (quote.lines.length === 0 || quote.totalCents <= 0) {
      throw AppError.validation({ lines: ["Ajoutez au moins une prestation avant d'envoyer le devis."] });
    }
    const to = input.to ?? quote.client.email;
    if (!to)
      throw AppError.validation({ to: ["Ce client n'a pas d'adresse email : ajoutez-la sur sa fiche ou précisez le destinataire."] });

    const [org, client, sender] = await seq(
      () => tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
      () => tx.client.findUniqueOrThrow({ where: { id: quote.clientId } }),
      () => tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
    );
    if (quote.status === "DRAFT") {
      await tx.quote.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          clientSnapshot: clientSnapshot(client) as unknown as Prisma.InputJsonValue,
          sellerSnapshot: sellerSnapshot(org) as unknown as Prisma.InputJsonValue,
        },
      });
    }
    const contactName = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ") || null;
    const { subject, text } = quoteEmail({
      orgName: org.name,
      senderName: `${sender.firstName} ${sender.lastName}`,
      contactName,
      signature: org.emailSignature,
      message: input.message ?? null,
      number: quote.number,
      totalCents: quote.totalCents,
      validUntil: fromDbDate(quote.validUntil),
      vatExempt: quote.vatExempt,
    });
    await queueEmail(tx, ctx, after, {
      kind: "QUOTE",
      entityType: "quote",
      entityId: id,
      to,
      replyTo: sender.email ?? org.email,
      subject,
      body: text,
    });
    await logActivity(tx, ctx, "QUOTE_SENT", { type: "quote", id }, { number: quote.number, to });
    return toQuoteDto(tx, await loadQuote(tx, id), todayIn(org.timezone));
  });
}

async function transition(ctx: Ctx, id: string, target: "ACCEPTED" | "DECLINED" | "CANCELLED"): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.write");
  return withTenant(ctx.orgId, async (tx) => {
    const quote = await loadQuote(tx, id);
    const allowed: Record<typeof target, QuoteStatus[]> = {
      ACCEPTED: ["SENT", "DRAFT"],
      DECLINED: ["SENT"],
      CANCELLED: ["DRAFT", "SENT"],
    };
    if (!allowed[target].includes(quote.status)) {
      throw AppError.conflict(
        `Ce devis est « ${quote.status === "ACCEPTED" ? "accepté" : quote.status === "DECLINED" ? "refusé" : quote.status === "CANCELLED" ? "annulé" : "en brouillon"} » : action impossible.`,
      );
    }
    const now = new Date();
    await tx.quote.update({
      where: { id },
      data: {
        status: target,
        acceptedAt: target === "ACCEPTED" ? now : undefined,
        declinedAt: target === "DECLINED" ? now : undefined,
        cancelledAt: target === "CANCELLED" ? now : undefined,
      },
    });
    await logActivity(tx, ctx, `QUOTE_${target}`, { type: "quote", id }, { number: quote.number });
    return toQuoteDto(tx, await loadQuote(tx, id), todayIn(ctx.timezone));
  });
}

export const acceptQuote = (ctx: Ctx, id: string) => transition(ctx, id, "ACCEPTED");
export const declineQuote = (ctx: Ctx, id: string) => transition(ctx, id, "DECLINED");
export const cancelQuote = (ctx: Ctx, id: string) => transition(ctx, id, "CANCELLED");

/** Nouvelle version d'un devis : copie en brouillon, nouveau numéro, date du jour. */
export async function duplicateQuote(ctx: Ctx, id: string): Promise<QuoteDto> {
  requirePermission(ctx, "quotes.write");
  const source = await withTenant(ctx.orgId, (tx) => loadQuote(tx, id));
  return createQuote(ctx, {
    clientId: source.clientId,
    siteId: source.siteId,
    title: source.title,
    notes: source.notes,
    internalNotes: source.internalNotes,
    lines: source.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity.toString()),
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      vatRateBps: l.vatRateBps,
      discountBps: l.discountBps,
      catalogItemId: l.catalogItemId,
    })),
  });
}
