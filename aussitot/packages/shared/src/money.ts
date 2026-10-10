/**
 * Calculs de montants — source de vérité unique, utilisée par l'API (seule à
 * enregistrer un montant : un total envoyé par l'app n'est jamais cru) et par
 * l'app (aperçu en direct pendant la saisie).
 *
 * Tous les montants sont des entiers en CENTIMES, les taux de TVA et les
 * remises en POINTS DE BASE (2000 = 20 %). Les quantités ont au plus 3
 * décimales. Les produits intermédiaires passent en BigInt : aucune perte de
 * précision possible, même sur de gros montants.
 */

export const VAT_RATES_BPS = [2000, 1000, 550, 210, 0] as const;
export type VatRateBps = (typeof VAT_RATES_BPS)[number];

export const MAX_QUANTITY = 99_999.999;
export const MAX_UNIT_PRICE_CENTS = 100_000_000; // 1 000 000 €

export interface MoneyLine {
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  /** Remise sur la ligne, en points de base (0 à 10 000). */
  discountBps?: number;
}

export interface VatBreakdownEntry {
  rateBps: number;
  baseCents: number;
  vatCents: number;
}

export interface Totals {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  vatBreakdown: VatBreakdownEntry[];
}

/** Division entière arrondie au plus proche, à mi-chemin loin de zéro (arrondi commercial). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** Quantité en millièmes (2,5 → 2500). */
export function quantityToMilli(quantity: number): number {
  return Math.round(quantity * 1000);
}

/** Total HT d'une ligne, en centimes. */
export function lineTotalHtCents(line: MoneyLine): number {
  const qtyMilli = BigInt(quantityToMilli(line.quantity));
  const price = BigInt(Math.trunc(line.unitPriceCents));
  const discount = BigInt(Math.trunc(line.discountBps ?? 0));
  return Number(divRound(qtyMilli * price * (10_000n - discount), 1000n * 10_000n));
}

/**
 * Totaux d'un devis ou d'une facture. La TVA est calculée par taux, sur la
 * somme des lignes HT de ce taux (et non ligne par ligne) : c'est ce
 * qu'attendent l'administration fiscale et le format de facture électronique.
 * En franchise en base de TVA (micro-entreprise), aucune TVA n'est due.
 */
export function computeTotals(lines: MoneyLine[], options: { vatExempt?: boolean } = {}): Totals {
  const byRate = new Map<number, number>();
  let subtotal = 0;
  for (const line of lines) {
    const ht = lineTotalHtCents(line);
    subtotal += ht;
    const rate = options.vatExempt ? 0 : line.vatRateBps;
    byRate.set(rate, (byRate.get(rate) ?? 0) + ht);
  }
  const vatBreakdown: VatBreakdownEntry[] = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rateBps, baseCents]) => ({
      rateBps,
      baseCents,
      vatCents: Number(divRound(BigInt(baseCents) * BigInt(rateBps), 10_000n)),
    }));
  const vat = vatBreakdown.reduce((sum, entry) => sum + entry.vatCents, 0);
  return { subtotalCents: subtotal, vatCents: vat, totalCents: subtotal + vat, vatBreakdown };
}

/** « 1 250,50 » → 125050. Accepte la virgule ou le point. Renvoie null si illisible. */
export function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [intPart = "0", decPart = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  return cleaned.startsWith("-") ? -cents : cents;
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}
