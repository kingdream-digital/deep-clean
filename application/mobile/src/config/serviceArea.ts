// Zone d'intervention de DEEP CLEAN : communes listées sur le site officiel
// (deep-clean.fr, version « La Plongée »), environ 20 minutes autour de
// Manosque. Sert à répondre tout de suite à « Intervenez-vous chez moi ? »
// sans rien envoyer au serveur.

export const SERVICE_TOWNS: { name: string; postalCode: string; distance: string }[] = [
  { name: "Manosque", postalCode: "04100", distance: "Notre base" },
  { name: "Pierrevert", postalCode: "04860", distance: "3,6 km" },
  { name: "Sainte-Tulle", postalCode: "04220", distance: "5,6 km" },
  { name: "Volx", postalCode: "04130", distance: "6,8 km" },
  { name: "Corbières", postalCode: "04220", distance: "8,5 km" },
  { name: "Villeneuve", postalCode: "04180", distance: "9,3 km" },
  { name: "Gréoux-les-Bains", postalCode: "04800", distance: "11,7 km" },
  { name: "Forcalquier", postalCode: "04300", distance: "13,9 km" },
];

// Départements voisins de Manosque où une intervention reste envisageable
// selon la commune exacte (Alpes-de-Haute-Provence, Var, Vaucluse).
const NEARBY_DEPARTMENTS = ["04", "83", "84"];

export type ServiceAreaAnswer =
  | { kind: "invalid" }
  | { kind: "served"; towns: string[] }
  | { kind: "maybe" }
  | { kind: "outside" };

export function checkServiceArea(rawPostalCode: string): ServiceAreaAnswer {
  const code = rawPostalCode.replace(/\s/g, "");
  if (!/^\d{5}$/.test(code)) return { kind: "invalid" };
  const towns = SERVICE_TOWNS.filter((t) => t.postalCode === code).map((t) => t.name);
  if (towns.length > 0) return { kind: "served", towns };
  if (NEARBY_DEPARTMENTS.includes(code.slice(0, 2))) return { kind: "maybe" };
  return { kind: "outside" };
}
