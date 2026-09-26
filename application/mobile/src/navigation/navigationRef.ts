import { createNavigationContainerRef } from "@react-navigation/native";
import type { AppTabsParamList } from "./appTabsShared";

// Poignée partagée vers le conteneur de navigation racine — nécessaire pour
// que le tutoriel (OnboardingOverlay, monté hors de l'arbre de navigation
// dans App.tsx) puisse déplacer l'utilisateur d'onglet en onglet pendant la
// visite guidée, comme le ferait un appui réel sur la barre du bas.
export const navigationRef = createNavigationContainerRef<AppTabsParamList>();
