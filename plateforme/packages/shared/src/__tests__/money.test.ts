import { describe, expect, it } from "vitest";
import { computeTotals, lineTotalHtCents, parseEurosToCents } from "../money";

describe("lineTotalHtCents", () => {
  it("multiplie quantité et prix unitaire", () => {
    expect(lineTotalHtCents({ quantity: 3, unitPriceCents: 3500, vatRateBps: 2000 })).toBe(10500);
  });

  it("gère les quantités décimales sans erreur d'arrondi flottant", () => {
    // 0,1 + 0,2 en flottant vaut 0,30000000000000004 : le calcul doit rester exact.
    expect(lineTotalHtCents({ quantity: 0.1 + 0.2, unitPriceCents: 1000, vatRateBps: 2000 })).toBe(300);
    expect(lineTotalHtCents({ quantity: 2.5, unitPriceCents: 2890, vatRateBps: 2000 })).toBe(7225);
  });

  it("applique une remise en points de base, arrondie au centime le plus proche", () => {
    expect(lineTotalHtCents({ quantity: 1, unitPriceCents: 999, vatRateBps: 2000, discountBps: 1000 })).toBe(899); // 899,1 → 899
    expect(lineTotalHtCents({ quantity: 1, unitPriceCents: 1005, vatRateBps: 2000, discountBps: 5000 })).toBe(503); // 502,5 → 503
  });

  it("reste exact sur de très gros montants", () => {
    expect(lineTotalHtCents({ quantity: 99_999.999, unitPriceCents: 100_000_000, vatRateBps: 2000 })).toBe(9_999_999_900_000);
  });
});

describe("computeTotals", () => {
  it("calcule la TVA par taux, sur la base cumulée", () => {
    const totals = computeTotals([
      { quantity: 1, unitPriceCents: 333, vatRateBps: 2000 },
      { quantity: 1, unitPriceCents: 333, vatRateBps: 2000 },
      { quantity: 1, unitPriceCents: 1000, vatRateBps: 1000 },
    ]);
    expect(totals.subtotalCents).toBe(1666);
    // 666 × 20 % = 133,2 → 133 ; 1000 × 10 % = 100
    expect(totals.vatBreakdown).toEqual([
      { rateBps: 2000, baseCents: 666, vatCents: 133 },
      { rateBps: 1000, baseCents: 1000, vatCents: 100 },
    ]);
    expect(totals.vatCents).toBe(233);
    expect(totals.totalCents).toBe(1899);
  });

  it("n'applique aucune TVA en franchise en base", () => {
    const totals = computeTotals([{ quantity: 2, unitPriceCents: 5000, vatRateBps: 2000 }], { vatExempt: true });
    expect(totals).toEqual({ subtotalCents: 10000, vatCents: 0, totalCents: 10000, vatBreakdown: [{ rateBps: 0, baseCents: 10000, vatCents: 0 }] });
  });

  it("arrondit symétriquement les montants négatifs (avoirs)", () => {
    const totals = computeTotals([{ quantity: -1, unitPriceCents: 1005, vatRateBps: 2000, discountBps: 5000 }]);
    expect(totals.subtotalCents).toBe(-503);
    expect(totals.vatCents).toBe(-101); // -100,6 → -101
  });

  it("renvoie des zéros sans ligne", () => {
    expect(computeTotals([])).toEqual({ subtotalCents: 0, vatCents: 0, totalCents: 0, vatBreakdown: [] });
  });
});

describe("parseEurosToCents", () => {
  it("lit les saisies françaises", () => {
    expect(parseEurosToCents("1 250,50 €")).toBe(125050);
    expect(parseEurosToCents("35")).toBe(3500);
    expect(parseEurosToCents("35.5")).toBe(3550);
    expect(parseEurosToCents("abc")).toBeNull();
    expect(parseEurosToCents("1,234")).toBeNull();
  });
});
