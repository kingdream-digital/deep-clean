import { siteInputSchema, siteUpdateSchema, type SiteDto, type SiteInput } from "@aussitot/shared";
import { withTenant, type Db } from "../../lib/db.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import type { Site } from "../../generated/prisma/client.ts";

export function toSiteDto(site: Site & { client?: { name: string } | null }): SiteDto {
  return {
    id: site.id,
    name: site.name,
    clientId: site.clientId,
    clientName: site.client?.name ?? null,
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    postalCode: site.postalCode,
    city: site.city,
    accessNotes: site.accessNotes,
    isActive: site.isActive,
  };
}

export function siteAddress(site: Pick<Site, "addressLine1" | "postalCode" | "city">): string | null {
  const parts = [site.addressLine1, [site.postalCode, site.city].filter(Boolean).join(" ")].filter((p) => p && p.trim());
  return parts.length ? parts.join(", ") : null;
}

export async function fuzzySiteIds(tx: Db, q: string, limit: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM sites
    WHERE "isActive" = true
      AND (app_unaccent(lower(${q})) <% app_unaccent(lower(name))
           OR app_unaccent(lower(name)) LIKE '%' || app_unaccent(lower(${q})) || '%')
    ORDER BY word_similarity(app_unaccent(lower(${q})), app_unaccent(lower(name))) DESC, name ASC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

async function assertClient(tx: Db, clientId: string | null | undefined): Promise<void> {
  if (clientId && !(await tx.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
    throw AppError.validation({ clientId: ["Client introuvable."] });
  }
}

export async function listSites(ctx: Ctx, query: { q?: string; clientId?: string }): Promise<SiteDto[]> {
  requirePermission(ctx, "sites.read");
  return withTenant(ctx.orgId, async (tx) => {
    const ids = query.q?.trim() ? await fuzzySiteIds(tx, query.q.trim(), 30) : null;
    const sites = await tx.site.findMany({
      where: { isActive: true, clientId: query.clientId, id: ids ? { in: ids } : undefined },
      include: { client: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    });
    return sites.map(toSiteDto);
  });
}

export async function getSite(ctx: Ctx, id: string): Promise<SiteDto> {
  requirePermission(ctx, "sites.read");
  return withTenant(ctx.orgId, async (tx) =>
    toSiteDto(
      assertFound(await tx.site.findUnique({ where: { id }, include: { client: { select: { name: true } } } }), "Lieu introuvable."),
    ),
  );
}

export async function createSite(ctx: Ctx, raw: SiteInput): Promise<SiteDto> {
  requirePermission(ctx, "sites.write");
  const input = parse(siteInputSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    await assertClient(tx, input.clientId);
    const site = await tx.site.create({ data: input, include: { client: { select: { name: true } } } });
    await logActivity(tx, ctx, "SITE_CREATED", { type: "site", id: site.id });
    return toSiteDto(site);
  });
}

export async function updateSite(ctx: Ctx, id: string, raw: Partial<SiteInput>): Promise<SiteDto> {
  requirePermission(ctx, "sites.write");
  const input = parse(siteUpdateSchema, raw);
  return withTenant(ctx.orgId, async (tx) => {
    assertFound(await tx.site.findUnique({ where: { id } }), "Lieu introuvable.");
    await assertClient(tx, input.clientId);
    const site = await tx.site.update({ where: { id }, data: input, include: { client: { select: { name: true } } } });
    await logActivity(tx, ctx, "SITE_UPDATED", { type: "site", id });
    return toSiteDto(site);
  });
}
