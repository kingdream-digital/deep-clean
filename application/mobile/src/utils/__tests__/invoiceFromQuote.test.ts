import { buildInvoiceLinesFromQuote } from "../invoiceFromQuote";
import type { QuoteItem } from "../../api/quotes.api";

const base: Omit<QuoteItem, "id" | "description" | "frequency" | "occurrencesPerMonth" | "monthlyAmountHt" | "totalHt" | "quantity" | "unitPriceHt"> = {
  unit: "HOUR",
  discount: 0,
  estimatedHours: null,
  estimatedEmployees: null,
  sortOrder: 0,
};
const daily: QuoteItem = { ...base, id: "a", description: "Entretien boutique", quantity: 1, unitPriceHt: 29, totalHt: 29, frequency: "DAILY", occurrencesPerMonth: 24, monthlyAmountHt: 696 };
const once: QuoteItem = { ...base, id: "b", description: "Remise en état", quantity: 2, unitPriceHt: 100, discount: 10, totalHt: 180, frequency: "ONE_TIME", occurrencesPerMonth: null, monthlyAmountHt: 0 };

describe("Facture préparée depuis un devis", () => {
  it("forfait mensuel : 1 mois au montant mensuel du devis", () => {
    const lines = buildInvoiceLinesFromQuote([daily], { mode: "FLAT_RATE", period: "2026-10", includeOneTime: true });
    expect(lines).toEqual([
      { description: "Entretien boutique — forfait octobre 2026", quantity: 1, unit: "MONTH", unitPriceHt: 696, sourceQuoteItemId: "a" },
    ]);
  });

  it("à la prestation : prestations réalisées × prix d'un passage", () => {
    const lines = buildInvoiceLinesFromQuote([daily], { mode: "PER_SERVICE", period: "2026-10", includeOneTime: true, completedVisits: 20 });
    expect(lines[0]).toMatchObject({ quantity: 20, unit: "INTERVENTION", unitPriceHt: 29 });
  });

  it("les prestations ponctuelles ne sont facturées qu'une fois, remise déduite", () => {
    const first = buildInvoiceLinesFromQuote([daily, once], { mode: "FLAT_RATE", period: "2026-10", includeOneTime: true });
    expect(first[1]).toMatchObject({ quantity: 2, unitPriceHt: 90 });
    const next = buildInvoiceLinesFromQuote([daily, once], { mode: "FLAT_RATE", period: "2026-11", includeOneTime: false });
    expect(next).toHaveLength(1);
  });

  it("un devis sans prestation régulière est repris tel quel", () => {
    const lines = buildInvoiceLinesFromQuote([once], { mode: "FLAT_RATE", period: "", includeOneTime: false });
    expect(lines).toHaveLength(1);
  });
});
