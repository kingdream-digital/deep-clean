import { describe, expect, it } from "vitest";
import { computeTotals } from "@aussitot/shared";
import { fromCatalog, fromDto, parseDiscountBps, parseQuantity, toInput, toMoneyLine, type DraftLine } from "../lines";

const draft = (patch: Partial<DraftLine>): DraftLine => ({
  key: "k",
  description: "Vitrerie",
  quantity: "1",
  unit: "VISIT",
  unitPrice: "45",
  vatRateBps: 2000,
  discount: "",
  catalogItemId: null,
  ...patch,
});

describe("saisie des lignes de devis / facture", () => {
  it("lit les quantités et remises à la française", () => {
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity("1 000")).toBe(1000);
    expect(parseQuantity("abc")).toBe(0);
    expect(parseDiscountBps("10")).toBe(1000);
    expect(parseDiscountBps("5,5 %")).toBe(550);
    expect(parseDiscountBps("150")).toBe(10_000);
  });

  it("convertit en centimes sans erreur d'arrondi", () => {
    const input = toInput(draft({ quantity: "3", unitPrice: "85,50" }));
    expect(input.unitPriceCents).toBe(8550);
    expect(input.quantity).toBe(3);
    const totals = computeTotals([toMoneyLine(draft({ quantity: "3", unitPrice: "85,50" }))]);
    expect(totals).toMatchObject({ subtotalCents: 25650, vatCents: 5130, totalCents: 30780 });
  });

  it("signale un prix illisible au lieu de l'inventer", () => {
    expect(toInput(draft({ unitPrice: "douze" })).unitPriceCents).toBe(-1);
  });

  it("reprend fidèlement une ligne enregistrée", () => {
    const line = fromDto({
      id: "l1",
      position: 0,
      description: "Bureaux",
      quantity: 2.5,
      unit: "HOUR",
      unitPriceCents: 3250,
      vatRateBps: 1000,
      discountBps: 500,
      totalHtCents: 7719,
      catalogItemId: null,
    });
    expect(line).toMatchObject({ quantity: "2,5", unitPrice: "32,50", discount: "5", vatRateBps: 1000 });
    expect(toInput(line)).toMatchObject({ quantity: 2.5, unitPriceCents: 3250, discountBps: 500 });
  });

  it("pré-remplit une ligne depuis le catalogue", () => {
    const line = fromCatalog({
      id: "c1",
      name: "Vitrerie",
      description: "intérieur",
      unit: "VISIT",
      unitPriceCents: 4500,
      vatRateBps: 2000,
    });
    expect(line).toMatchObject({ description: "Vitrerie — intérieur", unitPrice: "45,00", catalogItemId: "c1" });
  });
});
