import React from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

interface PressableScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Échelle atteinte pendant la pression (0.98 par défaut — carte ; utiliser 0.96 pour un bouton). */
  pressedScale?: number;
}

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

// Retour tactile cohérent sur tout élément cliquable non-bouton (cartes de
// mission, de signalement, de tableau de bord...) : léger tassement au
// contact, ressort au relâchement — jamais un simple changement d'opacité.
export function PressableScale({ pressedScale = 0.98, style, children, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(pressedScale, { damping: 16, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressableBase>
  );
}
