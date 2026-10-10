import type { ComponentType } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";

export interface IconButtonProps {
  icon: ComponentType<LucideProps>;
  /** Obligatoire : lu par le lecteur d'écran (bouton sans texte visible). */
  label: string;
  onPress?: () => void;
  variant?: "plain" | "tinted" | "filled" | "spark";
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({ icon: Icon, label, onPress, variant = "plain", size = 44, disabled, style, testID }: IconButtonProps) {
  const { colors } = useTheme();
  const bg = { plain: "transparent", tinted: colors.surfaceMuted, filled: colors.accentFill, spark: colors.spark }[variant];
  const fg = { plain: colors.text, tinted: colors.text, filled: colors.onAccent, spark: "#FFFFFF" }[variant];
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      haptic="selection"
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, style]}
      pressedStyle={{ backgroundColor: variant === "plain" ? colors.surfacePressed : undefined, opacity: variant === "plain" ? 1 : 0.85 }}
      scaleTo={0.92}
    >
      <Icon size={Math.round(size * 0.47)} color={fg} strokeWidth={2.1} />
    </PressableScale>
  );
}
