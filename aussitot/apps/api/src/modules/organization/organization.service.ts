import sharp from "sharp";
import {
  addDays,
  can,
  computeTotals,
  lineTotalHtCents,
  organizationSettingsSchema,
  PREVIEW_CLIENT_NAME,
  previewDocumentLines,
  type OrganizationDto,
  type OrganizationSettingsInput,
} from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { withTenant } from "../../lib/db.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { invalidateOrg, logoVersionOf } from "../../lib/orgCache.ts";
import { logoAccentColor } from "../../lib/logoColor.ts";
import { renderDocumentPdf, type PdfDocumentKind } from "../../lib/pdf/documentPdf.ts";
import { todayIn } from "../../lib/time.ts";
import { sellerSnapshot } from "../sales/snapshots.ts";
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
    logoVersion: logoVersionOf(org.logoKey),
    logoColor: org.logoKey ? org.logoColor : null,
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
  const encode = (trim: boolean) => {
    const image = sharp(data, { limitInputPixels: 40_000_000 }).rotate();
    // Marges vides (fond transparent ou uni) retirées : le logo s'aligne au bord du document.
    if (trim) image.trim({ threshold: 12 });
    return image.resize({ width: 800, height: 400, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  };
  let png: Buffer;
  try {
    png = await encode(true).catch(() => encode(false));
  } catch {
    throw AppError.badRequest("Image illisible. Utilisez un fichier PNG, JPEG ou WebP.");
  }
  const logoColor = await logoAccentColor(png).catch(() => null);
  const key = orgKey(ctx.orgId, "branding", `logo-${Date.now()}.png`);
  await storage.put(key, png, "image/png");
  // L'ancien fichier n'est PAS supprimé : les devis envoyés et les factures
  // émises le référencent (coordonnées figées) et doivent rester identiques
  // à ce qu'a reçu le client, même après un changement de logo.
  const org = await withTenant(ctx.orgId, async (tx) => {
    const updated = await tx.organization.update({ where: { id: ctx.orgId }, data: { logoKey: key, logoColor } });
    await logActivity(tx, ctx, "ORG_LOGO_UPDATED", { type: "organization", id: ctx.orgId });
    return updated;
  });
  await invalidateOrg(ctx.orgId);
  return toOrganizationDto(org);
}

/** Retire le logo des PROCHAINS documents (les documents déjà transmis gardent le leur). */
export async function removeLogo(ctx: Ctx): Promise<OrganizationDto> {
  requirePermission(ctx, "org.update");
  const org = await withTenant(ctx.orgId, async (tx) => {
    const updated = await tx.organization.update({ where: { id: ctx.orgId }, data: { logoKey: null, logoColor: null } });
    await logActivity(tx, ctx, "ORG_LOGO_REMOVED", { type: "organization", id: ctx.orgId });
    return updated;
  });
  await invalidateOrg(ctx.orgId);
  return toOrganizationDto(org);
}

/**
 * Aperçu de mise en page : un devis ou une facture FICTIFS, rendus avec le
 * logo, la couleur et les mentions actuelles de l'entreprise, pour juger du
 * résultat avant d'envoyer de vrais documents. Rien n'est enregistré ni numéroté.
 */
export async function renderDocumentPreview(ctx: Ctx, kind: PdfDocumentKind): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, "org.update");
  const org = await withTenant(ctx.orgId, (tx) => tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }));
  const seller = sellerSnapshot(org);
  const vatExempt = org.vatRegime === "FRANCHISE";
  const lines = previewDocumentLines(vatExempt ? 0 : org.defaultVatRateBps);
  const totals = computeTotals(lines, { vatExempt });
  const today = todayIn(org.timezone);
  const logo = org.logoKey ? await storage.get(org.logoKey).catch(() => null) : null;
  const buffer = await renderDocumentPdf({
    kind,
    number: "EXEMPLE",
    title: "Aperçu de mise en page — document fictif, sans valeur",
    issueDate: today,
    secondaryDate: kind === "QUOTE" ? addDays(today, org.quoteValidityDays) : addDays(today, org.paymentTermsDays),
    seller,
    client: {
      kind: "COMPANY",
      name: PREVIEW_CLIENT_NAME,
      contactName: "Camille Martin",
      email: "contact@client-exemple.example",
      phone: null,
      addressLines: ["10 rue de l'Exemple", "69002 Lyon"],
      siren: null,
      siret: null,
      vatNumber: null,
    },
    lines: lines.map((l) => ({ ...l, totalHtCents: lineTotalHtCents(l) })),
    subtotalCents: totals.subtotalCents,
    vatBreakdown: totals.vatBreakdown,
    totalCents: totals.totalCents,
    vatExempt,
    notes: "Ce document est un exemple généré pour vérifier la mise en page (logo, couleur, mentions). Il n'a aucune valeur.",
    logo,
  });
  return { filename: `Apercu-${kind === "QUOTE" ? "devis" : "facture"}.pdf`, buffer };
}

export async function getLogo(ctx: Ctx): Promise<Buffer> {
  const org = await withTenant(ctx.orgId, (tx) => tx.organization.findUnique({ where: { id: ctx.orgId }, select: { logoKey: true } }));
  if (!org?.logoKey) throw AppError.notFound("Aucun logo.");
  return getOrThrow(org.logoKey);
}
