import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewProps } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";
import { useResponsive } from "../hooks/useResponsive";
import { useWebKeyboardInset } from "../hooks/useWebKeyboardInset";

interface ScreenContainerProps extends ViewProps {
  scroll?: boolean;
  avoidKeyboard?: boolean;
  /**
   * Décalage additionnel pour `KeyboardAvoidingView` (iOS, mode "padding").
   * La valeur par défaut (12) suppose un écran sans en-tête de navigation
   * juste au-dessus ; un écran avec un composeur collé en bas ET un en-tête
   * (ex. un fil de conversation) doit passer la hauteur réelle de l'en-tête
   * (`useHeaderHeight()`) sous peine de voir son bouton d'envoi pousser
   * hors de l'écran visible quand le clavier s'ouvre.
   */
  keyboardVerticalOffset?: number;
  /** Fond en léger dégradé (écrans "hero" : connexion...) plutôt que plat. */
  gradient?: boolean;
  /**
   * À réserver aux écrans qui n'ont PAS d'en-tête de navigation (connexion,
   * changement de mot de passe forcé, accueil, écran d'accueil de la
   * messagerie — ceux qui passent `headerShown: false` dans leur stack, ou
   * qui sont rendus hors de tout `Stack.Navigator`). Dans tous les autres cas
   * (immense majorité des écrans), le header natif couvre déjà la zone
   * sécurisée du haut ; redemander cet espace ici le comptait deux fois et
   * poussait tout le contenu plus bas que prévu.
   */
  noHeader?: boolean;
  /**
   * Sur web large uniquement : désactive le plafond de largeur du contenu
   * (tableaux, tableaux de bord denses). Sans effet natif/mobile web.
   */
  fullBleed?: boolean;
}

// Au-delà de cette largeur de contenu, une liste ou un formulaire mobile
// étiré tel quel devient illisible (lignes de texte trop longues, formulaires
// à la largeur d'un écran de cinéma) — plafond appliqué UNIQUEMENT sur web
// large ; jamais sur natif, jamais sur web étroit (le contenu y reste
// full-bleed, identique au mobile).
const WEB_CONTENT_MAX_WIDTH = 1120;

export function ScreenContainer({
  children,
  style,
  avoidKeyboard,
  keyboardVerticalOffset = 12,
  gradient,
  fullBleed = false,
  noHeader = false,
  ...rest
}: ScreenContainerProps) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const capWidth = isDesktopWeb && !fullBleed;
  // Web sur téléphone : le clavier recouvre l'écran au lieu de le réduire
  // (voir useWebKeyboardInset). On remonte le contenu de la hauteur cachée,
  // moins la barre d'onglets, déjà sous le clavier elle aussi.
  const webKeyboardInset = useWebKeyboardInset();
  const tabBarHeight = React.useContext(BottomTabBarHeightContext) ?? 0;
  const webKeyboardPadding = avoidKeyboard ? Math.max(0, webKeyboardInset - tabBarHeight) : 0;

  const content = (
    <View
      style={[
        styles.content,
        { paddingHorizontal: spacing.lg },
        capWidth && { maxWidth: WEB_CONTENT_MAX_WIDTH, width: "100%", alignSelf: "center", paddingHorizontal: spacing.xxl },
        style,
        webKeyboardPadding > 0 && { paddingBottom: webKeyboardPadding },
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={noHeader ? ["top", "bottom"] : ["bottom"]}
    >
      {gradient && (
        <LinearGradient
          colors={isDark ? [colors.background, colors.surfaceAlt] : [colors.background, colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          // Bug remonté par un utilisateur (Android) : laisser `behavior`
          // à `undefined` sur Android partait du principe que le
          // `adjustResize` natif suffirait seul à redimensionner l'écran
          // quand le clavier s'ouvre — plus fiable depuis qu'Expo active
          // l'affichage "edge-to-edge" par défaut sur Android (SDK 53+),
          // qui casse ce comportement dans de nombreuses apps : le clavier
          // recouvre alors le champ de saisie sans que rien ne remonte.
          // `"height"` fait porter le repositionnement par
          // KeyboardAvoidingView lui-même, comme sur iOS.
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1 },
});
