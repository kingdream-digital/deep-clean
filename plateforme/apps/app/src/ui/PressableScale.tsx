import { useState, type ReactNode } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Échelle au toucher (1 = aucune). */
  scaleTo?: number;
  haptic?: "light" | "medium" | "selection" | false;
  pressedStyle?: StyleProp<ViewStyle>;
}

/**
 * Surface pressable : léger enfoncement au toucher (ressort court), retour
 * haptique sur téléphone, anneau de focus visible au clavier sur le web.
 * Les mouvements sont coupés si l'utilisateur a demandé « réduire les animations ».
 */
export function PressableScale({ children, style, scaleTo = 0.97, haptic = "light", pressedStyle, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const { colors, reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduceMotion) scale.value = withSpring(scaleTo, { damping: 20, stiffness: 420, mass: 0.6 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.value = reduceMotion ? 1 : withTiming(1, { duration: 140 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== "web") {
          if (haptic === "selection") void Haptics.selectionAsync();
          else void Haptics.impactAsync(haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        style,
        animated,
        pressed ? pressedStyle : null,
        disabled ? { opacity: 0.45 } : null,
        focused && Platform.OS === "web" ? ({ outlineColor: colors.focusRing, outlineWidth: 3, outlineStyle: "solid", outlineOffset: 2 } as ViewStyle) : null,
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
