import { describe, expect, it } from "vitest";
import { BRAND_COLOR_PRESETS, brandTextOnWhite, contrastRatio, readableTextOn } from "../color";

describe("couleurs de marque", () => {
  it("calcule les contrastes WCAG de référence", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("garde le texte lisible sur n'importe quelle couleur choisie", () => {
    expect(readableTextOn("#2347F5")).toBe("#FFFFFF");
    expect(readableTextOn("#FACC15")).toBe("#0F172A"); // jaune : texte foncé
    expect(brandTextOnWhite("#FDE68A")).toBe("#0F172A"); // trop pâle pour un titre sur blanc
    expect(brandTextOnWhite("#0E7490")).toBe("#0E7490");
  });
  it("ne propose que des couleurs lisibles avec du texte blanc", () => {
    for (const color of BRAND_COLOR_PRESETS) expect(contrastRatio(color, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});
