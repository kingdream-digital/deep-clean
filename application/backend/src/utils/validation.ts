import { z } from "zod";

/**
 * Liste de courtes chaînes saisies dans un formulaire (tâches d'une fiche de
 * poste, équipement d'un standard de nettoyage...), où les lignes laissées
 * vides sont ignorées plutôt que de faire échouer tout l'enregistrement.
 *
 * Les écrans concernés présentent une liste de champs à remplir : il en reste
 * presque toujours un vide à la fin. Refuser la requête entière pour cette
 * raison affichait une erreur incompréhensible ("Expected string, received
 * ''") et faisait perdre la saisie, alors que l'intention est évidente.
 * La longueur maximale, elle, reste bien vérifiée.
 */
export function stringList(maxLength: number, maxItems = 50) {
  return z
    .array(z.string().trim().max(maxLength))
    .max(maxItems)
    .transform((items) => items.filter((item) => item.length > 0));
}
