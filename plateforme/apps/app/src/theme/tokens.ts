/**
 * Système de design Aussitôt.
 *
 * Principes : clarté avant tout (hiérarchie typographique nette, beaucoup
 * d'air), une seule couleur d'action (cobalt) et une couleur « voix » (corail)
 * réservée à l'assistant ; contrastes AA vérifiés pour tout texte (≥ 4,5:1).
 * Le mode sombre n'est jamais du noir pur : des paliers de gris bleutés
 * permettent de lire la profondeur (cartes au-dessus du fond).
 */

export interface Palette {
  mode: "light" | "dark";
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  /** Couleur d'action : liens, icônes actives (texte). */
  accent: string;
  /** Aplat portant du texte blanc (boutons principaux). */
  accentFill: string;
  accentFillPressed: string;
  accentSoft: string;
  /** Texte accentué posé sur accentSoft. */
  accentText: string;
  onAccent: string;
  /** Couleur de la voix / de l'assistant. */
  spark: string;
  sparkSoft: string;
  sparkText: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  shadow: string;
  focusRing: string;
}

export const light: Palette = {
  mode: "light",
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#EEF0F3",
  surfacePressed: "#E6E9EE",
  border: "#E3E6EB",
  borderStrong: "#CBD1DA",
  text: "#0B0F19",
  textSecondary: "#4A5363",
  textTertiary: "#7C8696",
  textInverse: "#FFFFFF",
  accent: "#2347F5",
  accentFill: "#2347F5",
  accentFillPressed: "#1A37C9",
  accentSoft: "#ECF0FF",
  accentText: "#1A37C9",
  onAccent: "#FFFFFF",
  spark: "#FF6B3D",
  sparkSoft: "#FFF0EA",
  sparkText: "#B9400E",
  success: "#0E7A4F",
  successSoft: "#E6F6EE",
  warning: "#9A5A06",
  warningSoft: "#FFF3DC",
  danger: "#C42B1C",
  dangerSoft: "#FDECEA",
  overlay: "rgba(11, 15, 25, 0.45)",
  shadow: "#0B1026",
  focusRing: "rgba(35, 71, 245, 0.35)",
};

export const dark: Palette = {
  mode: "dark",
  bg: "#0A0C10",
  surface: "#14171D",
  surfaceRaised: "#1A1E26",
  surfaceMuted: "#1C2029",
  surfacePressed: "#252A35",
  border: "#262B35",
  borderStrong: "#363C49",
  text: "#F3F5F8",
  textSecondary: "#AEB6C3",
  textTertiary: "#7A8394",
  textInverse: "#0A0C10",
  accent: "#8099FF",
  accentFill: "#3D5CFF",
  accentFillPressed: "#2F4DEB",
  accentSoft: "rgba(110, 139, 255, 0.16)",
  accentText: "#A9B9FF",
  onAccent: "#FFFFFF",
  spark: "#FF7A4D",
  sparkSoft: "rgba(255, 122, 77, 0.16)",
  sparkText: "#FFA584",
  success: "#4ADE9B",
  successSoft: "rgba(74, 222, 155, 0.14)",
  warning: "#FBBF4A",
  warningSoft: "rgba(251, 191, 74, 0.14)",
  danger: "#FF7B6E",
  dangerSoft: "rgba(255, 123, 110, 0.14)",
  overlay: "rgba(0, 0, 0, 0.6)",
  shadow: "#000000",
  focusRing: "rgba(128, 153, 255, 0.45)",
};

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

/** Échelle typographique (taille / interligne / approche). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, fontFamily: fonts.bold },
  title1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontFamily: fonts.bold },
  title2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontFamily: fonts.semibold },
  title3: { fontSize: 19, lineHeight: 24, letterSpacing: -0.25, fontFamily: fonts.semibold },
  headline: { fontSize: 16, lineHeight: 22, letterSpacing: -0.15, fontFamily: fonts.semibold },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: -0.1, fontFamily: fonts.regular },
  callout: { fontSize: 15, lineHeight: 21, letterSpacing: -0.1, fontFamily: fonts.regular },
  subhead: { fontSize: 14, lineHeight: 19, letterSpacing: -0.05, fontFamily: fonts.regular },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontFamily: fonts.regular },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1, fontFamily: fonts.medium },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, fontFamily: fonts.semibold },
} as const;

export type TypeVariant = keyof typeof type;

export const breakpoints = {
  /** Au-delà : barre latérale et panneau de l'assistant (tablette paysage, ordinateur). */
  wide: 1024,
  /** Au-delà : mises en page à deux colonnes. */
  medium: 720,
} as const;

/** Largeur de lecture maximale du contenu principal. */
export const contentMaxWidth = 1120;
