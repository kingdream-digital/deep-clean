import React, { useEffect } from "react";
import { ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

interface PulsingDotProps {
  color: string;
  size?: number;
  style?: ViewStyle;
}

// Pastille à pulsation douce, réservée aux états "actifs" (mission en cours,
// signalement nouveau, notification non lue) — jamais sur un état terminal,
// pour que le mouvement reste porteur de sens plutôt que décoratif.
export function PulsingDot({ color, size = 7, style }: PulsingDotProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animatedStyle, style]}
    />
  );
}
