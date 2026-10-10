import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Mic, Square } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "@/ui";

/**
 * Bouton micro de l'assistant : une sphère cobalt → corail qui « respire » au
 * repos et suit le volume de la voix pendant l'écoute. Immobile si
 * l'utilisateur a demandé de réduire les animations.
 */
export function VoiceOrb({
  listening,
  thinking,
  level = 0,
  size = 64,
  onPress,
  onLongPress,
  label,
}: {
  listening: boolean;
  thinking?: boolean;
  level?: number;
  size?: number;
  onPress: () => void;
  onLongPress?: () => void;
  label?: string;
}) {
  const { reduceMotion } = useTheme();
  const breath = useSharedValue(0);
  const amplitude = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath, reduceMotion]);

  useEffect(() => {
    amplitude.value = withSpring(listening ? Math.max(0.25, level) : 0, { damping: 14, stiffness: 160 });
  }, [listening, level, amplitude]);

  useEffect(() => {
    if (thinking && !reduceMotion) spin.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [thinking, spin, reduceMotion]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.18 + amplitude.value * 0.35 + breath.value * 0.08,
    transform: [{ scale: 1.12 + breath.value * 0.06 + amplitude.value * 0.45 }],
  }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 + amplitude.value * 0.08 }, { rotate: `${spin.value * 360}deg` }] }));

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={label ?? (listening ? "Arrêter l'écoute" : "Parler à l'assistant")}
      accessibilityHint={listening ? undefined : "Dites par exemple : fais un devis pour la boulangerie Dupont"}
      haptic="medium"
      scaleTo={0.93}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: "#4B63FF" }, halo]}
      />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, core]}>
        <LinearGradient
          colors={["#3B5BFF", "#5B3FF0", "#FF6B3D"]}
          locations={[0, 0.62, 1]}
          start={{ x: 0.1, y: 0.05 }}
          end={{ x: 0.95, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <View pointerEvents="none" style={{ position: "absolute" }}>
        {listening ? (
          <Square size={size * 0.3} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Mic size={size * 0.4} color="#FFFFFF" strokeWidth={2.2} />
        )}
      </View>
    </PressableScale>
  );
}
