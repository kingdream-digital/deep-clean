import type { Unit } from "./catalog";

/**
 * Document d'exemple des réglages (« à quoi ressembleront mes devis et
 * factures ? ») : les mêmes lignes servent au PDF d'aperçu du serveur et à
 * l'aperçu en direct de l'application, pour des montants identiques.
 */
export const PREVIEW_CLIENT_NAME = "Client Exemple SAS";

export function previewDocumentLines(vatRateBps: number): {
  description: string;
  quantity: number;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  discountBps: number;
}[] {
  return [
    { description: "Entretien des bureaux — exemple", quantity: 12, unit: "HOUR", unitPriceCents: 3200, vatRateBps, discountBps: 0 },
    { description: "Nettoyage des vitres — exemple", quantity: 2, unit: "VISIT", unitPriceCents: 9500, vatRateBps, discountBps: 0 },
  ];
}
