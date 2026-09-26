import { Platform, useWindowDimensions } from "react-native";
import { breakpoints } from "../theme/breakpoints";

interface Responsive {
  width: number;
  /** true uniquement sur le build web (jamais sur iOS/Android). */
  isWeb: boolean;
  /** Largeur "bureau" — sidebar complète, grilles multi-colonnes, tableaux. */
  isDesktopWeb: boolean;
  /** Web sous le seuil "bureau" — sidebar en rail d'icônes, grilles resserrées. */
  isCompactWeb: boolean;
}

/**
 * Point d'entrée unique pour toute logique de mise en page dépendant de la
 * largeur d'écran. Sur natif, `isWeb`/`isDesktopWeb`/`isCompactWeb` sont
 * toujours `false` : un composant qui les utilise pour choisir entre deux
 * rendus retombe donc systématiquement sur son rendu mobile d'origine.
 */
export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  if (!isWeb) {
    return { width, isWeb: false, isDesktopWeb: false, isCompactWeb: false };
  }

  const isDesktopWeb = width >= breakpoints.expanded;
  return { width, isWeb: true, isDesktopWeb, isCompactWeb: !isDesktopWeb };
}
