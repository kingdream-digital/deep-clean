// Échelle typographique : Inter (via @expo-google-fonts/inter), chargée dans
// App.tsx avant le premier rendu. Inter plutôt que la police système par
// défaut est un des marqueurs concrets qui distinguent une app "travaillée"
// d'un template — Linear, Superhuman et Revolut s'appuient tous dessus.
export const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const type = {
  largeTitle: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 40, fontWeight: "700" as const, letterSpacing: -0.4 },
  title1: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 33, fontWeight: "700" as const, letterSpacing: -0.3 },
  title2: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 27, fontWeight: "600" as const, letterSpacing: -0.2 },
  title3: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 25, fontWeight: "600" as const },
  headline: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 23, fontWeight: "400" as const },
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 17, lineHeight: 23, fontWeight: "500" as const },
  callout: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 21, fontWeight: "400" as const },
  subhead: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20, fontWeight: "400" as const },
  footnote: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16, fontWeight: "500" as const, letterSpacing: 0.2 },
  overline: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 1.1 },
  // Gros chiffre (KPI directeur, dashboards) — contraste de taille volontairement
  // marqué avec les labels micro, procédé qui donne sa lecture "premium/dense" à
  // Whoop et Revolut plutôt qu'un scale linéaire timide. Taille calée sur son
  // seul usage réel (grille KPI à 2 colonnes, `KpiGrid.tsx`) : le token était
  // auparavant défini à 40/44 mais systématiquement écrasé à 26/30 par son
  // unique consommateur — un token jamais réellement appliqué tel quel.
  statNumber: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 30, fontWeight: "700" as const, letterSpacing: -0.5 },
};
