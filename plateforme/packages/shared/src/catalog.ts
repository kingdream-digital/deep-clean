export const UNITS = ["HOUR", "DAY", "UNIT", "SQM", "FLAT", "MONTH", "VISIT", "KM"] as const;
export type Unit = (typeof UNITS)[number];

/** Libellé court (tableaux, PDF). */
export const UNIT_SHORT: Record<Unit, string> = {
  HOUR: "h",
  DAY: "j",
  UNIT: "u.",
  SQM: "m²",
  FLAT: "forfait",
  MONTH: "mois",
  VISIT: "passage",
  KM: "km",
};

/** Libellés au singulier / pluriel (phrases, assistant vocal). */
export const UNIT_WORDS: Record<Unit, [string, string]> = {
  HOUR: ["heure", "heures"],
  DAY: ["jour", "jours"],
  UNIT: ["unité", "unités"],
  SQM: ["m²", "m²"],
  FLAT: ["forfait", "forfaits"],
  MONTH: ["mois", "mois"],
  VISIT: ["passage", "passages"],
  KM: ["km", "km"],
};

export function unitWord(unit: Unit, quantity: number): string {
  const [one, many] = UNIT_WORDS[unit];
  return Math.abs(quantity) >= 2 ? many : one;
}
