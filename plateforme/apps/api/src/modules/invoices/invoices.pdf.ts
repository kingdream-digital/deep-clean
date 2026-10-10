import type { VatBreakdownEntry } from "@aussitot/shared";
import { addDays } from "@aussitot/shared";
import { decimalToNumber, fromDbDate, withTenant } from "../../lib/db.ts";
import { assertFound } from "../../lib/errors.ts";
import { renderDocumentPdf } from "../../lib/pdf/documentPdf.ts";
import { storage } from "../../lib/storage.ts";
import { todayIn } from "../../lib/time.ts";
import { clientSnapshot, sellerSnapshot, type ClientSnapshot, type SellerSnapshot } from "../sales/snapshots.ts";
import { siteAddress } from "../sites/sites.service.ts";

/**
 * PDF d'une facture ou d'un avoir. Une facture émise utilise ses coordonnées
 * figées ; un brouillon est un APERÇU, clairement marqué comme tel.
 */
export async function renderInvoicePdfFor(orgId: string, invoiceId: string): Promise<{ filename: string; buffer: Buffer }> {
  const { invoice, seller, client, today } = await withTenant(orgId, async (tx) => {
    const invoice = assertFound(
      await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          lines: { orderBy: { position: "asc" } },
          client: true,
          site: true,
          quote: { select: { number: true } },
          creditedInvoice: { select: { number: true } },
          payments: { orderBy: { paidOn: "desc" }, take: 1 },
        },
      }),
      "Facture introuvable.",
    );
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    const seller = (invoice.sellerSnapshot as unknown as SellerSnapshot | null) ?? sellerSnapshot(org);
    const client = (invoice.clientSnapshot as unknown as ClientSnapshot | null) ?? clientSnapshot(invoice.client);
    return { invoice, seller, client, today: todayIn(org.timezone) };
  });
  const logo = seller.logoKey ? await storage.get(seller.logoKey).catch(() => null) : null;
  const isDraft = invoice.status === "DRAFT";
  const issueDate = fromDbDate(invoice.issueDate) ?? today;
  const buffer = await renderDocumentPdf({
    kind: invoice.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE",
    number: invoice.number ?? "BROUILLON",
    title: isDraft ? `Aperçu — document non émis${invoice.title ? ` · ${invoice.title}` : ""}` : invoice.title,
    issueDate,
    secondaryDate: invoice.kind === "CREDIT_NOTE" ? null : (fromDbDate(invoice.dueDate) ?? addDays(issueDate, seller.paymentTermsDays)),
    seller,
    client,
    lines: invoice.lines.map((l) => ({ ...l, quantity: decimalToNumber(l.quantity) })),
    subtotalCents: invoice.subtotalCents,
    vatBreakdown: invoice.vatBreakdown as unknown as VatBreakdownEntry[],
    totalCents: invoice.totalCents,
    vatExempt: invoice.vatExempt,
    notes: invoice.notes,
    amountPaidCents: invoice.status === "PARTIALLY_PAID" ? invoice.amountPaidCents : undefined,
    paidOn: invoice.status === "PAID" ? fromDbDate(invoice.payments[0]?.paidOn ?? null) : null,
    quoteNumber: invoice.quote?.number ?? null,
    creditedInvoiceNumber: invoice.creditedInvoice?.number ?? null,
    servicePeriod: invoice.servicePeriod,
    siteLabel: invoice.site ? [invoice.site.name, siteAddress(invoice.site)].filter(Boolean).join(" — ") : null,
    logo,
  });
  const label = invoice.kind === "CREDIT_NOTE" ? "Avoir" : "Facture";
  return { filename: `${label}-${invoice.number ?? "brouillon"}.pdf`, buffer };
}
