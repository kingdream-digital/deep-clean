import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import { fontFamily } from "../theme/typography";

/**
 * En-tête commun aux cinq piles de l'application (une par onglet). Le titre
 * utilise la police de l'application, Inter, comme tout le reste de
 * l'interface : il était jusqu'ici le seul texte de l'app en police système,
 * avec une graisse et une taille qui ne correspondaient à rien d'autre.
 */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.backgroundElevated },
    headerTintColor: colors.ink,
    headerShadowVisible: false,
    headerTitleStyle: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: 17 },
    // Juste la flèche au retour — jamais le titre de l'écran précédent
    // affiché à côté (ex. "InboxHome"), qui n'a aucun sens pour l'utilisateur.
    headerBackButtonDisplayMode: "minimal",
  };
}
