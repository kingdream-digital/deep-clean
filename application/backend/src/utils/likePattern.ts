// Échappe `\`, `%` et `_` avant de les passer à un `contains` Prisma — sans
// ça, ces caractères tapés par l'utilisateur sont interprétés comme des
// jokers SQL LIKE/ILIKE plutôt que des caractères littéraux (bug déjà
// identifié et corrigé dans sites.service.ts — voir son commentaire pour le
// détail). Centralisé ici pour les nouveaux modules (prospects, clients...)
// plutôt que redupliqué à chaque fois.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
