import type { QuoteItem } from "../api/quotes.api";
import type { InvoiceItemInput } from "../api/invoices.api";

export type InvoiceBillingMode = "FLAT_RATE" | "PER_SERVICE";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** « octobre 2026 » à partir de « 2026-10 » (vide si aucun mois). */
export function billingPeriodLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return "";
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

// Prix unitaire remise de ligne déduite : une facture n'a pas de colonne
// remise, le montant facturé doit être celui du devis.
function discountedUnitPrice(item: QuoteItem): number {
  return item.quantity > 0 ? round2(item.totalHt / item.quantity) : item.unitPriceHt;
}

/**
 * Lignes d'une facture préparées depuis un devis accepté.
 *
 * - Forfait mensuel : chaque prestation récurrente devient « 1 mois » au
 *   montant mensuel prévu au devis (prix × passages par mois) — le client
 *   paie le mois entier, quel que soit le nombre de passages.
 * - À la prestation : chaque prestation récurrente devient « N passages » au
 *   prix d'un passage ; N = prestations réalisées sur le mois si connu,
 *   sinon le nombre prévu au devis (à ajuster).
 * - Prestations ponctuelles : reprises telles quelles, seulement sur la
 *   première facture du devis (`includeOneTime`) — jamais refacturées chaque mois.
 */
export function buildInvoiceLinesFromQuote(
  items: QuoteItem[],
  options: { mode: InvoiceBillingMode; period: string; includeOneTime: boolean; completedVisits?: number | null }
): InvoiceItemInput[] {
  const label = billingPeriodLabel(options.period);
  const recurring = items.filter((i) => i.frequency !== "ONE_TIME" && i.monthlyAmountHt > 0);
  const lines: InvoiceItemInput[] = [];
  for (const item of items) {
    const isRecurring = recurring.includes(item);
    if (!isRecurring) {
      if (!options.includeOneTime && recurring.length > 0) continue;
      lines.push({ description: item.description, quantity: item.quantity, unit: item.unit, unitPriceHt: discountedUnitPrice(item), sourceQuoteItemId: item.id });
      continue;
    }
    if (options.mode === "FLAT_RATE") {
      lines.push({
        description: `${item.description} — forfait ${label || "mensuel"}`,
        quantity: 1,
        unit: "MONTH",
        unitPriceHt: round2(item.monthlyAmountHt),
        sourceQuoteItemId: item.id,
      });
    } else {
      const planned = item.occurrencesPerMonth ?? 1;
      const done = recurring.length === 1 && options.completedVisits != null ? options.completedVisits : planned;
      lines.push({
        description: label ? `${item.description} — ${label}` : item.description,
        quantity: done,
        unit: "INTERVENTION",
        // Prix d'un passage = montant de la ligne du devis (quantité × prix, remise déduite).
        unitPriceHt: round2(item.totalHt),
        sourceQuoteItemId: item.id,
      });
    }
  }
  return lines;
}
