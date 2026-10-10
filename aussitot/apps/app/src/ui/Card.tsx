import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Carte mise en avant (ombre portée douce). */
  elevated?: boolean;
  testID?: string;
}

/** Carte : surface blanche (ou palier supérieur en sombre), bord très fin, coins généreux. */
export function Card({ children, onPress, padding = 16, style, accessibilityLabel, elevated, testID }: CardProps) {
  const { colors, radius } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding,
    ...(elevated
      ? {
          shadowColor: colors.shadow,
          shadowOpacity: colors.mode === "dark" ? 0.4 : 0.07,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 3,
        }
      : null),
  };
  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
        pressedStyle={{ backgroundColor: colors.surfacePressed }}
        scaleTo={0.985}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={[base, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}
