import { parseEurosToCents, type DocumentLineDto, type DocumentLineInput, type MoneyLine, type Unit } from "@aussitot/shared";

/** Ligne en cours de saisie (valeurs texte telles que tapées, converties à l'enregistrement). */
export interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unit: Unit;
  unitPrice: string;
  vatRateBps: number;
  discount: string;
  catalogItemId: string | null;
}

let counter = 0;
export const newLineKey = () => `line-${Date.now()}-${(counter += 1)}`;

export function emptyLine(vatRateBps: number): DraftLine {
  return { key: newLineKey(), description: "", quantity: "1", unit: "UNIT", unitPrice: "", vatRateBps, discount: "", catalogItemId: null };
}

export function parseQuantity(text: string): number {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function parseDiscountBps(text: string): number {
  const n = Number(text.replace(/[\s%]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 100) : 0;
}

const centsToText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function fromDto(line: DocumentLineDto): DraftLine {
  return {
    key: line.id,
    description: line.description,
    quantity: String(line.quantity).replace(".", ","),
    unit: line.unit,
    unitPrice: centsToText(line.unitPriceCents),
    vatRateBps: line.vatRateBps,
    discount: line.discountBps ? String(line.discountBps / 100).replace(".", ",") : "",
    catalogItemId: line.catalogItemId,
  };
}

export function fromCatalog(item: {
  id: string;
  name: string;
  description: string | null;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
}): DraftLine {
  return {
    key: newLineKey(),
    description: item.description ? `${item.name} — ${item.description}` : item.name,
    quantity: "1",
    unit: item.unit,
    unitPrice: centsToText(item.unitPriceCents),
    vatRateBps: item.vatRateBps,
    discount: "",
    catalogItemId: item.id,
  };
}

/** Pour le calcul des totaux en direct (mêmes règles que le serveur). */
export function toMoneyLine(line: DraftLine): MoneyLine {
  return {
    quantity: parseQuantity(line.quantity),
    unitPriceCents: parseEurosToCents(line.unitPrice || "0") ?? 0,
    vatRateBps: line.vatRateBps,
    discountBps: parseDiscountBps(line.discount),
  };
}

/** Pour l'envoi à l'API (qui revalide et recalcule tout). */
export function toInput(line: DraftLine): DocumentLineInput {
  return {
    description: line.description.trim(),
    quantity: parseQuantity(line.quantity),
    unit: line.unit,
    unitPriceCents: parseEurosToCents(line.unitPrice || "0") ?? -1,
    vatRateBps: line.vatRateBps,
    discountBps: parseDiscountBps(line.discount),
    catalogItemId: line.catalogItemId,
  };
}
