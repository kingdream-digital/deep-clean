import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Bouton avec micro-interaction de pression façon iOS (tassement +, pour le
// variant principal, léger assombrissement de la teinte) plutôt qu'un simple
// changement d'opacité — et un fondu croisé entre libellé et indicateur de
// chargement pour ne jamais faire "sauter" le contenu.
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  fullWidth = true,
  icon,
  style,
}: ButtonProps) {
  const { colors, radius, type } = useTheme();
  const isDisabled = disabled || loading;

  const press = useSharedValue(0); // 0 = relâché, 1 = pressé

  const palette: Record<Variant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
    primary: { bg: colors.accent, bgPressed: colors.accentPressed, fg: colors.onAccent },
    secondary: { bg: colors.surfaceAlt, bgPressed: colors.surfaceAlt, fg: colors.ink, border: colors.border },
    ghost: { bg: "transparent", bgPressed: "transparent", fg: colors.accent },
    destructive: { bg: colors.dangerSoft, bgPressed: colors.dangerSoft, fg: colors.danger },
  };
  const p = palette[variant];
  const isPrimary = variant === "primary";

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
    backgroundColor: isPrimary ? "transparent" : interpolateColor(press.value, [0, 1], [p.bg, p.bgPressed]),
  }));

  // Assombrissement du dégradé à la pression : plus simple et plus fluide
  // qu'animer les stops d'un LinearGradient directement.
  const pressScrimStyle = useAnimatedStyle(() => ({ opacity: press.value * 0.22 }));

  function handlePressIn() {
    if (isDisabled) return;
    press.value = withSpring(1, { damping: 16, stiffness: 320 });
  }
  function handlePressOut() {
    press.value = withSpring(0, { damping: 14, stiffness: 260 });
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.base,
        fullWidth && { width: "100%" },
        {
          borderRadius: radius.md,
          borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: p.border,
          paddingVertical: size === "lg" ? 15 : 11,
          opacity: isDisabled && !loading ? 0.5 : 1,
          overflow: "hidden",
        },
        isPrimary && {
          shadowColor: colors.accentBright,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        },
        animatedStyle,
        style,
      ]}
    >
      {isPrimary && (
        <>
          <LinearGradient
            colors={colors.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#000000" }, pressScrimStyle]}
          />
        </>
      )}
      {loading ? (
        <Animated.View key="loading" entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <ActivityIndicator color={p.fg} />
        </Animated.View>
      ) : (
        <Animated.View key="label" entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {icon && <Ionicons name={icon} size={18} color={p.fg} style={{ marginRight: 7 }} />}
            <Text style={[type.headline, { color: p.fg }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
