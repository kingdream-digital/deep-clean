import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { logoAccentColor } from "../src/lib/logoColor.ts";

/** Logo sur fond blanc ou transparent, avec une zone de la couleur de marque. */
async function logo(color: string, background: { r: number; g: number; b: number; alpha: number }) {
  const mark = await sharp({ create: { width: 80, height: 60, channels: 4, background: color } })
    .png()
    .toBuffer();
  const text = await sharp({ create: { width: 120, height: 20, channels: 4, background: "#111111" } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 300, height: 120, channels: 4, background } })
    .composite([
      { input: mark, left: 10, top: 30 },
      { input: text, left: 120, top: 50 },
    ])
    .png()
    .toBuffer();
}

describe("couleur proposée à partir du logo", () => {
  it("retrouve la couleur de marque, ni le fond ni le texte noir", async () => {
    expect(await logoAccentColor(await logo("#0E7490", { r: 255, g: 255, b: 255, alpha: 1 }))).toBe("#0E7490");
    expect(await logoAccentColor(await logo("#B91C1C", { r: 0, g: 0, b: 0, alpha: 0 }))).toBe("#B91C1C");
  });

  it("ne propose rien pour un logo en noir et blanc", async () => {
    const mono = await sharp({ create: { width: 200, height: 80, channels: 3, background: "#222222" } })
      .png()
      .toBuffer();
    expect(await logoAccentColor(mono)).toBeNull();
  });
});
