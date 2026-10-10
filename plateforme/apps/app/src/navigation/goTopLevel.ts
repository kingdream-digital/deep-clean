import { router } from "expo-router";

/**
 * Passage d'une section à une autre (onglet, barre latérale) : on revient à
 * la racine de la pile puis on remplace l'écran, pour que « Retour » ne
 * parcoure pas tout l'historique des sections visitées.
 */
export function goTopLevel(href: string): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href as never);
}
