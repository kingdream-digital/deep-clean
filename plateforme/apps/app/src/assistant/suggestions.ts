import type { Permission } from "@aussitot/shared";

/**
 * Exemples proposés quand la conversation est vide, selon ce que la personne
 * a le droit de faire. « send » : question complète, envoyée au toucher ;
 * « prefill » : début de phrase placé dans la zone de saisie, à compléter.
 */
export interface Suggestion {
  label: string;
  text: string;
  mode: "send" | "prefill";
  permission?: Permission;
}

const ALL: Suggestion[] = [
  { label: "Faire un devis", text: "Fais un devis pour ", mode: "prefill", permission: "quotes.write" },
  { label: "Factures en retard", text: "Quelles factures sont en retard de paiement ?", mode: "send", permission: "invoices.read" },
  { label: "Chiffre du mois", text: "Combien avons-nous facturé et encaissé ce mois-ci ?", mode: "send", permission: "invoices.read" },
  { label: "Devis à relancer", text: "Quels devis envoyés attendent encore une réponse ?", mode: "send", permission: "quotes.read" },
  { label: "Planifier une mission", text: "Planifie une mission demain de 8 h à 12 h pour ", mode: "prefill", permission: "planning.manage" },
  { label: "Qui travaille demain ?", text: "Qui travaille demain, et où ?", mode: "send", permission: "planning.readAll" },
  { label: "Ma journée", text: "Qu'est-ce que j'ai de prévu aujourd'hui ?", mode: "send" },
  { label: "Ma prochaine mission", text: "Quelle est ma prochaine mission, et quelles sont les consignes ?", mode: "send" },
];

export function suggestionsFor(can: (permission: Permission) => boolean, max = 4): Suggestion[] {
  return ALL.filter((s) => !s.permission || can(s.permission)).slice(0, max);
}
