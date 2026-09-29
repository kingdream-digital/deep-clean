import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

interface CardProps extends ViewProps {
  padded?: boolean;
  /** Réservé à UNE SEULE carte prioritaire par écran (ex. chantier actuel) — glow accent au lieu de l'ombre neutre. */
  glow?: boolean;
}

export function Card({ style, padded = true, glow = false, children, ...rest }: CardProps) {
  const { colors, radius, spacing, isDark } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.backgroundElevated,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: glow ? colors.accentDeep : colors.border,
          padding: padded ? spacing.lg : 0,
          // Ombre volontairement discrète (Apple HIG : la profondeur vient
          // surtout du contraste de fond, jamais d'une ombre épaisse) — un
          // empilement de cartes à ombre marquée est ce qui donne le rendu
          // "gabarit gratuit" que le fond gris + bordure fine suffit à éviter.
          // Retour explicite du client : le glow accent était bien trop
          // marqué en mode sombre (accentBright y est déjà la teinte la plus
          // vive de la palette) — nettement atténué ici, inchangé en clair.
          shadowColor: glow ? colors.accentBright : colors.shadow,
          shadowOpacity: glow ? (isDark ? 0.16 : 0.35) : 0.5,
          shadowRadius: glow ? (isDark ? 10 : 18) : 8,
          shadowOffset: { width: 0, height: glow ? (isDark ? 4 : 8) : 2 },
          elevation: glow ? (isDark ? 3 : 6) : 1,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
