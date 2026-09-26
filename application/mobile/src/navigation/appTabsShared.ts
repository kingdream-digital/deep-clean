// Source unique pour tout ce qui est partagé entre AppTabs.tsx (mobile) et
// AppTabs.web.tsx (web) : le type des routes, les icônes et les rôles
// d'encadrement. Dans un fichier séparé, jamais réexporté en dur par
// AppTabs.tsx — un import de "./AppTabs" depuis AppTabs.web.tsx serait résolu
// par le bundler web vers AppTabs.web.tsx lui-même (résolution par extension
// de plateforme), créant un cycle d'auto-import et des valeurs `undefined`
// au chargement (bug constaté : "Cannot read properties of undefined
// (reading 'includes')" au premier rendu de la barre latérale web).
import { Ionicons } from "@expo/vector-icons";
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { HomeStackParamList } from "./HomeStack";
import type { PlanningStackParamList } from "./PlanningStack";
import type { MissionsStackParamList } from "./MissionsStack";
import type { MenuStackParamList } from "./MenuStack";

// "Gestion" (variable selon le rôle) et "Profil" ont fusionné en un seul
// onglet "Menu", commun à tous les rôles (retour explicite du client,
// maquette validée) — le contenu affiché à l'intérieur reste, lui, adapté au
// rôle (voir screens/dashboard/MenuScreen.tsx).
export type AppTabsParamList = {
  Accueil: NavigatorScreenParams<HomeStackParamList> | undefined;
  Planning: NavigatorScreenParams<PlanningStackParamList> | undefined;
  Missions: NavigatorScreenParams<MissionsStackParamList> | undefined;
  Messagerie: undefined;
  Menu: NavigatorScreenParams<MenuStackParamList> | undefined;
};

export const ICONS: Record<keyof AppTabsParamList, keyof typeof Ionicons.glyphMap> = {
  Accueil: "home-outline",
  Planning: "calendar-outline",
  Missions: "briefcase-outline",
  Messagerie: "chatbubbles-outline",
  Menu: "menu-outline",
};
