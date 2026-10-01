// Points de rupture pour la version web (panel entreprise) — jamais utilisés
// nativement : `Platform.OS` reste "ios"/"android" sur mobile, donc toute
// logique qui les combine avec un check `isWeb` n'y est simplement jamais
// activée.
export const breakpoints = {
  // Barre latérale complète (icônes + libellés) à partir de ce seuil ;
  // en dessous, rail d'icônes seules.
  expanded: 1280,
  // En dessous de cette largeur, la fenêtre est celle d'un téléphone (ou
  // d'une fenêtre réduite) : la barre latérale y mangerait les deux tiers de
  // l'écran, on repasse donc à la barre d'onglets du bas, exactement comme
  // dans l'application mobile. Au-dessus, la barre latérale reste affichée en
  // entier, libellés compris (demande explicite du client).
  sidebar: 900,
};
