import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

interface CardProps extends ViewProps {
  padded?: boolean;
  /** Réservé à UNE SEULE carte prioritaire par écran (ex. chantier actuel) — glow accent au lieu de l'ombre neutre. */
  glow?: boolean;
}

export function Card({ style, padded = true, glow = false, children, ...rest }: CardProps) {
  const { colors, radius, spacing } = useTheme();

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
          shadowColor: glow ? colors.accentBright : colors.shadow,
          shadowOpacity: glow ? 0.35 : 0.5,
          shadowRadius: glow ? 18 : 8,
          shadowOffset: { width: 0, height: glow ? 8 : 2 },
          elevation: glow ? 6 : 1,
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
