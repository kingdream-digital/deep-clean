import {
  clientInputSchema,
  clientUpdateSchema,
  INVOICE_OPEN_STATUSES,
  type ClientDto,
  type ClientInput,
  type Page,
} from "@aussitot/shared";
import { seq, withTenant, type Db } from "../../lib/db.ts";
import { assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import type { Client } from "../../generated/prisma/client.ts";

export function toClientDto(client: Client): ClientDto {
  return {
    id: client.id,
    kind: client.kind,
    name: client.name,
    contactFirstName: client.contactFirstName,
    contactLastName: client.contactLastName,
    email: client.email,
    phone: client.phone,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    postalCode: client.postalCode,
    city: client.city,
    country: client.country,
    siren: client.siren,
    siret: client.siret,
    vatNumber: client.vatNumber,
    notes: client.notes,
    createdAt: client.createdAt.toISOString(),
  };
}

/**
 * Recherche tolérante (fautes de frappe, accents, mots partiels) : c'est elle
 * qui permet à l'assistant de comprendre « la boulangerie Dupond » quand le
 * client s'appelle « Boulangerie Dupont & Fils ». Index trigrammes PostgreSQL.
 */
export async function fuzzyClientIds(tx: Db, q: string, limit: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM clients
    WHERE "archivedAt" IS NULL
      AND (app_unaccent(lower(${q})) <% app_unaccent(lower(name))
           OR app_unaccent(lower(name)) LIKE '%' || app_unaccent(lower(${q})) || '%')
    ORDER BY word_similarity(app_unaccent(lower(${q})), app_unaccent(lower(name))) DESC, name ASC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export async function listClients(
  ctx: Ctx,
  query: { q?: string; cursor?: string; limit: number; includeArchived?: boolean },
): Promise<Page<ClientDto>> {
  requirePermission(ctx, "clients.read");
  return withTenant(ctx.orgId, async (tx) => {
    const q = query.q?.trim();
    if (q) {
      const ids = await fuzzyClientIds(tx, q, query.limit);
      const clients = await tx.client.findMany({ where: { id: { in: ids } } });
      const byId = new Map(clients.map((c) => [c.id, c]));
      return {
        items: ids
          .map((id) => byId.get(id))
          .filter((c): c is Client => Boolean(c))
          .map(toClientDto),
        nextCursor: null,
      };
    }
    const clients = await tx.client.findMany({
      where: { archivedAt: query.includeArchived ? undefined : null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = clients.length > query.limit;
    const items = clients.slice(0, query.limit);
    return { items: items.map(toClientDto), nextCursor: hasMore ? items.at(-1)!.id : null };
  });
}

export async function getClient(ctx: Ctx, id: string): Promise<ClientDto> {
  requirePermission(ctx, "clients.read");
  return withTenant(ctx.orgId, async (tx) => {
    const client = assertFound(await tx.client.findUnique({ where: { id } }), "Client introuvable.");
    const [quotesCount, invoiced, outstanding] = await seq(
      () => tx.quote.count({ where: { clientId: id } }),
      () => tx.invoice.aggregate({ where: { clientId: id, status: { not: "DRAFT" } }, _sum: { totalCents: true } }),
      () =>
        tx.invoice.aggregate({
          where: { clientId: id, status: { in: [...INVOICE_OPEN_STATUSES] } },
          _sum: { totalCents: true, amountPaidCents: true },
        }),
    );
    return {
      ...toClientDto(client),
      stats: {
        quotesCount,
        invoicedCents: invoiced._sum.totalCents ?? 0,
        outstandingCents: (outstanding._sum.totalCents ?? 0) - (outstanding._sum.amountPaidCents ?? 0),
      },
    };
  });
}

export async function createClient(ctx: Ctx, raw: ClientInput): Promise<ClientDto> {
  requirePermission(ctx, "clients.write");
  const input = parse(clientInputSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const client = await tx.client.create({ data: { ...input, createdById: ctx.userId } });
    await logActivity(tx, ctx, "CLIENT_CREATED", { type: "client", id: client.id });
    return toClientDto(client);
  });
}

export async function updateClient(ctx: Ctx, id: string, raw: Partial<ClientInput>): Promise<ClientDto> {
  requirePermission(ctx, "clients.write");
  const input = parse(clientUpdateSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    assertFound(await tx.client.findUnique({ where: { id } }), "Client introuvable.");
    const client = await tx.client.update({ where: { id }, data: input });
    await logActivity(tx, ctx, "CLIENT_UPDATED", { type: "client", id }, { fields: Object.keys(input) });
    return toClientDto(client);
  });
}

/** Archivage (jamais de suppression : les devis et factures émis y font référence). */
export async function archiveClient(ctx: Ctx, id: string): Promise<ClientDto> {
  requirePermission(ctx, "clients.write");
  return withTenant(ctx.orgId, async (tx) => {
    assertFound(await tx.client.findUnique({ where: { id } }), "Client introuvable.");
    const client = await tx.client.update({ where: { id }, data: { archivedAt: new Date() } });
    await logActivity(tx, ctx, "CLIENT_ARCHIVED", { type: "client", id });
    return toClientDto(client);
  });
}
