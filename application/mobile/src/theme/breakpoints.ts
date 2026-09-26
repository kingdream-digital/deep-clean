// Points de rupture pour la version web (panel entreprise) — jamais utilisés
// nativement : `Platform.OS` reste "ios"/"android" sur mobile, donc toute
// logique qui les combine avec un check `isWeb` n'y est simplement jamais
// activée.
export const breakpoints = {
  // Barre latérale complète (icônes + libellés) à partir de ce seuil ;
  // en dessous, rail d'icônes seules.
  expanded: 1280,
};
