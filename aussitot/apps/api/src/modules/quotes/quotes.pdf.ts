import { fromDbDate, decimalToNumber, withTenant } from "../../lib/db.ts";
import { assertFound } from "../../lib/errors.ts";
import { renderDocumentPdf } from "../../lib/pdf/documentPdf.ts";
import { storage } from "../../lib/storage.ts";
import { clientSnapshot, sellerSnapshot, type ClientSnapshot, type SellerSnapshot } from "../sales/snapshots.ts";
import { siteAddress } from "../sites/sites.service.ts";
import type { VatBreakdownEntry } from "@aussitot/shared";

/**
 * PDF d'un devis. Après envoi : coordonnées figées (snapshots). Avant :
 * aperçu avec les coordonnées actuelles du client et de l'entreprise.
 */
export async function renderQuotePdfFor(orgId: string, quoteId: string): Promise<{ filename: string; buffer: Buffer }> {
  const { quote, seller, client } = await withTenant(orgId, async (tx) => {
    const quote = assertFound(
      await tx.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } }, client: true, site: true } }),
      "Devis introuvable.",
    );
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    const seller = (quote.sellerSnapshot as unknown as SellerSnapshot | null) ?? sellerSnapshot(org);
    const client = (quote.clientSnapshot as unknown as ClientSnapshot | null) ?? clientSnapshot(quote.client);
    return { quote, seller, client };
  });
  const logo = seller.logoKey ? await storage.get(seller.logoKey).catch(() => null) : null;
  const buffer = await renderDocumentPdf({
    kind: "QUOTE",
    number: quote.number,
    title: quote.title,
    issueDate: fromDbDate(quote.issueDate),
    secondaryDate: fromDbDate(quote.validUntil),
    seller,
    client,
    lines: quote.lines.map((l) => ({ ...l, quantity: decimalToNumber(l.quantity) })),
    subtotalCents: quote.subtotalCents,
    vatBreakdown: quote.vatBreakdown as unknown as VatBreakdownEntry[],
    totalCents: quote.totalCents,
    vatExempt: quote.vatExempt,
    notes: quote.notes,
    siteLabel: quote.site ? [quote.site.name, siteAddress(quote.site)].filter(Boolean).join(" — ") : null,
    logo,
  });
  return { filename: `Devis-${quote.number}.pdf`, buffer };
}
