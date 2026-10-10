import { catalogItemInputSchema, catalogItemUpdateSchema, type CatalogItemDto, type CatalogItemInput } from "@aussitot/shared";
import { withTenant, type Db } from "../../lib/db.ts";
import { assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import type { CatalogItem } from "../../generated/prisma/client.ts";

export function toCatalogItemDto(item: CatalogItem): CatalogItemDto {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    unit: item.unit,
    unitPriceCents: item.unitPriceCents,
    vatRateBps: item.vatRateBps,
    isActive: item.isActive,
  };
}

/** Recherche tolérante dans le catalogue (« vitrerie » trouve « Nettoyage des vitres »). */
export async function fuzzyCatalogIds(tx: Db, q: string, limit: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM catalog_items
    WHERE "isActive" = true
      AND (app_unaccent(lower(${q})) <% app_unaccent(lower(name))
           OR app_unaccent(lower(name)) LIKE '%' || app_unaccent(lower(${q})) || '%'
           OR app_unaccent(lower(coalesce(description, ''))) LIKE '%' || app_unaccent(lower(${q})) || '%')
    ORDER BY word_similarity(app_unaccent(lower(${q})), app_unaccent(lower(name))) DESC, name ASC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export async function listCatalog(ctx: Ctx, query: { q?: string; includeInactive?: boolean }): Promise<CatalogItemDto[]> {
  requirePermission(ctx, "catalog.read");
  return withTenant(ctx.orgId, async (tx) => {
    const q = query.q?.trim();
    if (q) {
      const ids = await fuzzyCatalogIds(tx, q, 20);
      const items = await tx.catalogItem.findMany({ where: { id: { in: ids } } });
      const byId = new Map(items.map((i) => [i.id, i]));
      return ids
        .map((id) => byId.get(id))
        .filter((i): i is CatalogItem => Boolean(i))
        .map(toCatalogItemDto);
    }
    const items = await tx.catalogItem.findMany({
      where: { isActive: query.includeInactive ? undefined : true },
      orderBy: { name: "asc" },
      take: 500,
    });
    return items.map(toCatalogItemDto);
  });
}

export async function createCatalogItem(ctx: Ctx, raw: CatalogItemInput): Promise<CatalogItemDto> {
  requirePermission(ctx, "catalog.write");
  const input = parse(catalogItemInputSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    const item = await tx.catalogItem.create({ data: input });
    await logActivity(tx, ctx, "CATALOG_CREATED", { type: "catalogItem", id: item.id });
    return toCatalogItemDto(item);
  });
}

export async function updateCatalogItem(ctx: Ctx, id: string, raw: Partial<CatalogItemInput>): Promise<CatalogItemDto> {
  requirePermission(ctx, "catalog.write");
  const input = parse(catalogItemUpdateSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    assertFound(await tx.catalogItem.findUnique({ where: { id } }), "Prestation introuvable.");
    const item = await tx.catalogItem.update({ where: { id }, data: input });
    await logActivity(tx, ctx, "CATALOG_UPDATED", { type: "catalogItem", id });
    return toCatalogItemDto(item);
  });
}
