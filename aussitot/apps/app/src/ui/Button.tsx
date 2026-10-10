import type { ComponentType } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "spark";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ComponentType<LucideProps>;
  iconRight?: ComponentType<LucideProps>;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };

/** Bouton : cible tactile d'au moins 44 px, état de chargement annoncé, libellé toujours explicite. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  fullWidth,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.accentFill, pressed: colors.accentFillPressed, fg: colors.onAccent, border: "transparent" },
    secondary: { bg: colors.surface, pressed: colors.surfacePressed, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: "transparent", pressed: colors.surfacePressed, fg: colors.accentText, border: "transparent" },
    danger: { bg: colors.dangerSoft, pressed: colors.surfacePressed, fg: colors.danger, border: "transparent" },
    spark: { bg: colors.spark, pressed: colors.sparkText, fg: "#FFFFFF", border: "transparent" },
  }[variant];
  const iconSize = size === "sm" ? 16 : 19;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      haptic={variant === "primary" || variant === "spark" ? "medium" : "light"}
      style={[
        styles.base,
        {
          minHeight: Math.max(HEIGHTS[size], size === "sm" ? 36 : 44),
          paddingHorizontal: size === "sm" ? 14 : size === "lg" ? 24 : 18,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: size === "sm" ? radius.sm : radius.md,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
      pressedStyle={{ backgroundColor: palette.pressed }}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={iconSize} color={palette.fg} strokeWidth={2.2} /> : null}
          <Text variant={size === "sm" ? "subhead" : "headline"} weight="semibold" style={{ color: palette.fg }} numberOfLines={1}>
            {label}
          </Text>
          {IconRight ? <IconRight size={iconSize} color={palette.fg} strokeWidth={2.2} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: StyleSheet.hairlineWidth * 2, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
