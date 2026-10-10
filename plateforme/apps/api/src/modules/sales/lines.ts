import {
  computeTotals,
  documentLineInputSchema,
  lineTotalHtCents,
  type DocumentLineDto,
  type DocumentLineInput,
  type Totals,
  type Unit,
} from "@aussitot/shared";
import type { z } from "zod";
import { Prisma } from "../../generated/prisma/client.ts";
import { decimalToNumber, type Db } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";

export type ParsedLine = z.output<typeof documentLineInputSchema>;

export interface PreparedLine {
  position: number;
  description: string;
  quantity: Prisma.Decimal;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  discountBps: number;
  totalHtCents: number;
  catalogItemId: string | null;
}

/**
 * Prépare les lignes d'un devis ou d'une facture : totaux recalculés ICI, à
 * partir des quantités et prix unitaires — un total envoyé par l'app ou par
 * l'assistant n'est jamais repris tel quel.
 */
export async function prepareLines(
  tx: Db,
  lines: ParsedLine[],
  options: { vatExempt: boolean; sign?: 1 | -1 },
): Promise<{ lines: PreparedLine[]; totals: Totals }> {
  const catalogIds = [...new Set(lines.map((l) => l.catalogItemId).filter((id): id is string => Boolean(id)))];
  if (catalogIds.length) {
    // Une prestation référencée doit exister dans le catalogue de CETTE entreprise.
    const found = await tx.catalogItem.count({ where: { id: { in: catalogIds } } });
    if (found !== catalogIds.length) throw AppError.validation({ lines: ["Prestation du catalogue introuvable."] });
  }
  const sign = options.sign ?? 1;
  const prepared = lines.map((line, index) => {
    const quantity = Math.round(line.quantity * 1000) / 1000;
    const vatRateBps = options.vatExempt ? 0 : line.vatRateBps;
    const signedQuantity = quantity * sign;
    return {
      position: index,
      description: line.description,
      quantity: new Prisma.Decimal(signedQuantity.toFixed(3)),
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      vatRateBps,
      discountBps: line.discountBps ?? 0,
      totalHtCents: lineTotalHtCents({
        quantity: signedQuantity,
        unitPriceCents: line.unitPriceCents,
        vatRateBps,
        discountBps: line.discountBps,
      }),
      catalogItemId: line.catalogItemId ?? null,
    };
  });
  const totals = computeTotals(
    prepared.map((l) => ({
      quantity: decimalToNumber(l.quantity),
      unitPriceCents: l.unitPriceCents,
      vatRateBps: l.vatRateBps,
      discountBps: l.discountBps,
    })),
    { vatExempt: options.vatExempt },
  );
  return { lines: prepared, totals };
}

export function toLineDto(line: {
  id: string;
  position: number;
  description: string;
  quantity: Prisma.Decimal;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  discountBps: number;
  totalHtCents: number;
  catalogItemId: string | null;
}): DocumentLineDto {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: decimalToNumber(line.quantity),
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    vatRateBps: line.vatRateBps,
    discountBps: line.discountBps,
    totalHtCents: line.totalHtCents,
    catalogItemId: line.catalogItemId,
  };
}

export type { DocumentLineInput };
