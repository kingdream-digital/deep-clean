import type { Db } from "./db.ts";

export type SequenceKind = "QUOTE" | "INVOICE" | "CREDIT_NOTE";

/**
 * Prochain numéro d'une séquence (par entreprise, par type et par année).
 * L'incrément est fait dans la transaction appelante, ligne verrouillée
 * jusqu'à sa validation : deux émissions simultanées ne peuvent pas obtenir
 * le même numéro, et une émission annulée ne consomme pas de numéro (la
 * numérotation des factures doit être continue, sans trou).
 */
export async function nextNumber(tx: Db, kind: SequenceKind, year: number, prefix: string): Promise<string> {
  const key = `${kind}:${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO number_sequences (organization_id, key, "lastValue")
    VALUES (app_current_org(), ${key}, 1)
    ON CONFLICT (organization_id, key) DO UPDATE SET "lastValue" = number_sequences."lastValue" + 1
    RETURNING "lastValue" AS value`;
  const value = Number(rows[0]?.value ?? 1);
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}
