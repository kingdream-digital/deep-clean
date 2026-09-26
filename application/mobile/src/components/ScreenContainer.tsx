import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";
import { useResponsive } from "../hooks/useResponsive";

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
  ...rest
}: ScreenContainerProps) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const capWidth = isDesktopWeb && !fullBleed;

  const content = (
    <View
      style={[
        styles.content,
        { paddingHorizontal: spacing.lg },
        capWidth && { maxWidth: WEB_CONTENT_MAX_WIDTH, width: "100%", alignSelf: "center", paddingHorizontal: spacing.xxl },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
