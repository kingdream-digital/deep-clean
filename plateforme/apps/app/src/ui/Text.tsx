import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, type TypeVariant } from "@/theme/tokens";

export type TextTone = "primary" | "secondary" | "tertiary" | "accent" | "spark" | "success" | "warning" | "danger" | "inverse" | "onAccent";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  weight?: keyof typeof fonts;
  align?: TextStyle["textAlign"];
  uppercase?: boolean;
  tabular?: boolean;
}

/** Texte de l'app : échelle typographique unique, couleurs du thème, taille système respectée. */
export function Text({ variant = "body", tone = "primary", weight, align, uppercase, tabular, style, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accentText,
    spark: colors.sparkText,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    inverse: colors.textInverse,
    onAccent: colors.onAccent,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      {...rest}
      style={[
        type[variant],
        { color },
        weight ? { fontFamily: fonts[weight] } : null,
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: "uppercase" } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
