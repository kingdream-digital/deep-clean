// Palette Deep Clean — dérivée du logo (goutte monochrome) : un accent teal
// décliné en rampe (jamais en valeur plate), sur un système de surfaces à
// plusieurs paliers d'élévation. Le mode sombre n'utilise jamais de noir pur
// (#000000) : sur un fond totalement noir, aucune ombre ne peut se voir et
// toutes les cartes se confondent avec le fond — d'où un anthracite bleu-nuit
// profond comme base, chaque palier suivant légèrement plus clair.

const accent = {
  50: "#EAF6F8",
  100: "#CDEAEF",
  deep: "#0B5A70",
  base: "#0E7490",
  bright: "#22D3EE",
};

export type ThemeMode = "light" | "dark";

interface PaletteShape {
  mode: ThemeMode;
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceAlt: string;
  surfaceOverlay: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  inkInverted: string;
  accent: string;
  accentDeep: string;
  accentBright: string;
  accentGradient: [string, string];
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  neutral: string;
  neutralSoft: string;
  info: string;
  infoSoft: string;
  purple: string;
  purpleSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  shadow: string;
}

const light: PaletteShape = {
  mode: "light",
  // Fond légèrement gris (jamais blanc pur) : les cartes blanches se détachent
  // nettement dessus — c'est cette légère différence de palier qui donne la
  // lecture "dashboard dense en infos" plutôt qu'une page plate sans relief.
  background: "#F4F6F9",
  backgroundElevated: "#FFFFFF",
  surface: "#EEF1F6",
  surfaceAlt: "#E4E9F0",
  surfaceOverlay: "#FFFFFF",
  border: "#E6E9EF",
  borderStrong: "#D3D9E3",
  ink: "#101322",
  inkSecondary: "#5B6472",
  inkTertiary: "#94A0AF",
  inkInverted: "#FFFFFF",
  accent: accent.base,
  accentDeep: accent.deep,
  accentBright: accent.bright,
  accentGradient: [accent.deep, accent.base],
  accentPressed: accent.deep,
  accentSoft: accent[50],
  onAccent: "#FFFFFF",
  neutral: "#64748B",
  neutralSoft: "rgba(100,116,139,0.12)",
  info: "#2563EB",
  infoSoft: "rgba(37,99,235,0.1)",
  purple: "#7C3AED",
  purpleSoft: "rgba(124,58,237,0.1)",
  success: "#16A34A",
  successSoft: "rgba(22,163,74,0.1)",
  warning: "#D97706",
  warningSoft: "rgba(217,119,6,0.12)",
  danger: "#DC2626",
  dangerSoft: "rgba(220,38,38,0.1)",
  overlay: "rgba(16,19,34,0.45)",
  // Ombre très légèrement teintée d'accent plutôt que neutre pure — finition
  // "premium" plus chaleureuse qu'un gris plat (retour de recherche design).
  shadow: "rgba(16,24,40,0.09)",
};

const dark: PaletteShape = {
  mode: "dark",
  // Jamais #000000 : anthracite bleu-nuit, cohérent avec la teinte du logo,
  // qui laisse aux paliers suivants la place de "monter" en luminosité.
  background: "#0A0F14",
  backgroundElevated: "#121A21", // cartes primaires (surface.raised1)
  surface: "#121A21",
  surfaceAlt: "#1B242C", // état pressé/survolé, éléments imbriqués (surface.raised2)
  surfaceOverlay: "#212C35", // modales, bottom sheets, menus
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  ink: "#F2F5F7",
  inkSecondary: "#9AA7B0",
  inkTertiary: "#5C6870",
  inkInverted: "#0A0F14",
  // L'accent "texte/icône" en sombre est la valeur claire de la rampe (bonne
  // lisibilité sur fond anthracite : ~9.7:1 sur surface.raised1). accentBright
  // ne sert JAMAIS de fond plein sous du texte (contraste ~1.8:1, illisible) —
  // les remplissages (boutons, pastille sélectionnée, case cochée) utilisent
  // le dégradé deep→base, plus sombre, avec onAccent clair par-dessus.
  accent: accent.bright,
  accentDeep: accent.deep,
  accentBright: accent.bright,
  accentGradient: [accent.deep, accent.base],
  accentPressed: accent.deep,
  accentSoft: "rgba(14,116,144,0.18)",
  onAccent: "#F2FBFD",
  neutral: "#94A3B8",
  neutralSoft: "rgba(148,163,184,0.14)",
  info: "#60A5FA",
  infoSoft: "rgba(96,165,250,0.14)",
  purple: "#A78BFA",
  purpleSoft: "rgba(167,139,250,0.16)",
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.14)",
  warning: "#FBBF24",
  warningSoft: "rgba(251,191,36,0.14)",
  danger: "#F87171",
  dangerSoft: "rgba(248,113,113,0.14)",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "rgba(0,0,0,0.45)",
};

export const palettes = { light, dark };
export type Palette = PaletteShape;
