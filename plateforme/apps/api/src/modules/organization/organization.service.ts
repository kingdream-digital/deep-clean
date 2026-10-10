import sharp from "sharp";
import { can, organizationSettingsSchema, type OrganizationDto, type OrganizationSettingsInput } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { withTenant } from "../../lib/db.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { invalidateOrg } from "../../lib/orgCache.ts";
import { getOrThrow, orgKey, storage } from "../../lib/storage.ts";
import { parse } from "../../lib/validate.ts";
import type { Organization } from "../../generated/prisma/client.ts";

export function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    legalName: org.legalName,
    legalForm: org.legalForm,
    shareCapital: org.shareCapital,
    siren: org.siren,
    siret: org.siret,
    vatNumber: org.vatNumber,
    rcs: org.rcs,
    addressLine1: org.addressLine1,
    addressLine2: org.addressLine2,
    postalCode: org.postalCode,
    city: org.city,
    country: org.country,
    email: org.email,
    phone: org.phone,
    website: org.website,
    iban: org.iban,
    bic: org.bic,
    vatRegime: org.vatRegime,
    defaultVatRateBps: org.defaultVatRateBps,
    paymentTermsDays: org.paymentTermsDays,
    quoteValidityDays: org.quoteValidityDays,
    latePenaltyText: org.latePenaltyText,
    timezone: org.timezone,
    quotePrefix: org.quotePrefix,
    invoicePrefix: org.invoicePrefix,
    creditNotePrefix: org.creditNotePrefix,
    brandColor: org.brandColor,
    emailSignature: org.emailSignature,
    hasLogo: Boolean(org.logoKey),
    plan: org.plan,
    assistantEnabled: org.assistantMonthlyQuota > 0 && Boolean(env.ANTHROPIC_API_KEY),
  };
}

/** Réglages complets (mentions légales, IBAN…) : réservés à ceux qui en ont l'usage. */
export async function getOrganization(ctx: Ctx): Promise<OrganizationDto> {
  if (!can(ctx.role, "org.update") && !can(ctx.role, "quotes.read") && !can(ctx.role, "invoices.read")) throw AppError.forbidden();
  return withTenant(ctx.orgId, async (tx) =>
    toOrganizationDto(assertFound(await tx.organization.findUnique({ where: { id: ctx.orgId } }))),
  );
}

export async function updateOrganization(ctx: Ctx, raw: OrganizationSettingsInput): Promise<OrganizationDto> {
  requirePermission(ctx, "org.update");
  const input = parse(organizationSettingsSchema, raw);
  const org = await withTenant(ctx.orgId, async (tx) => {
    const updated = await tx.organization.update({ where: { id: ctx.orgId }, data: { ...input, brandColor: input.brandColor ?? null } });
    await logActivity(tx, ctx, "ORG_UPDATED", { type: "organization", id: ctx.orgId });
    return updated;
  });
  await invalidateOrg(ctx.orgId);
  return toOrganizationDto(org);
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Logo de l'entreprise (en-tête des devis et factures, écran d'accueil). Le
 * fichier reçu est décodé puis RÉENCODÉ en PNG : ce qui est stocké est une
 * image propre, jamais le fichier d'origine (protection contre les fichiers
 * piégés et les métadonnées indiscrètes).
 */
export async function updateLogo(ctx: Ctx, data: Buffer): Promise<OrganizationDto> {
  requirePermission(ctx, "org.update");
  if (data.length > MAX_LOGO_BYTES) throw AppError.badRequest("Le logo ne doit pas dépasser 2 Mo.");
  let png: Buffer;
  try {
    png = await sharp(data, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 800, height: 400, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw AppError.badRequest("Image illisible. Utilisez un fichier PNG, JPEG ou WebP.");
  }
  const key = orgKey(ctx.orgId, "branding", `logo-${Date.now()}.png`);
  await storage.put(key, png, "image/png");
  const { org, previous } = await withTenant(ctx.orgId, async (tx) => {
    const before = await tx.organization.findUnique({ where: { id: ctx.orgId }, select: { logoKey: true } });
    const updated = await tx.organization.update({ where: { id: ctx.orgId }, data: { logoKey: key } });
    await logActivity(tx, ctx, "ORG_LOGO_UPDATED", { type: "organization", id: ctx.orgId });
    return { org: updated, previous: before?.logoKey ?? null };
  });
  if (previous) await storage.delete(previous).catch(() => undefined);
  await invalidateOrg(ctx.orgId);
  return toOrganizationDto(org);
}

export async function getLogo(ctx: Ctx): Promise<Buffer> {
  const org = await withTenant(ctx.orgId, (tx) => tx.organization.findUnique({ where: { id: ctx.orgId }, select: { logoKey: true } }));
  if (!org?.logoKey) throw AppError.notFound("Aucun logo.");
  return getOrThrow(org.logoKey);
}
