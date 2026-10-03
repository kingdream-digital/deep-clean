import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { BrandEmblem, Tagline, TAGLINE_RATIO, TitlePart, TITLE_RATIO } from "./BrandEmblem";
import { AnimatedWaves } from "./AnimatedWaves";

// Visuel de la page de connexion (retour explicite du client : un écran
// « waouh » avec le vrai logo) : dégradé aux couleurs du logo, médaillon qui
// flotte doucement et émet des ondes, « DEEPCLEAN » et slogan, vagues animées
// qui se fondent dans le formulaire.

interface Props {
  emblemSize: number;
  titleWidth: number;
  /** Couleur du fond sous les vagues (celle du formulaire). */
  pageColor: string;
  /** Plein écran (ordinateur) : pas de vagues, contenu centré. */
  fill?: boolean;
}

export function LoginHero({ emblemSize, titleWidth, pageColor, fill }: Props) {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const ripple = useSharedValue(0);

  useEffect(() => {
    if (reduced) return undefined;
    float.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1, false);
    ripple.value = withDelay(900, withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1, false));
    return () => {
      cancelAnimation(float);
      cancelAnimation(ripple);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 12 }] }));
  const rippleStyle = useAnimatedStyle(() => ({ opacity: (1 - ripple.value) * 0.45, transform: [{ scale: 1 + ripple.value * 0.55 }] }));
  const ripple2Style = useAnimatedStyle(() => {
    const v = (ripple.value + 0.5) % 1;
    return { opacity: (1 - v) * 0.3 * (ripple.value > 0 ? 1 : 0), transform: [{ scale: 1 + v * 0.55 }] };
  });

  return (
    <View style={[styles.root, fill && { flex: 1 }]}>
      <LinearGradient colors={["#1F2D69", "#243F86", "#1E86B8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Bulles lumineuses discrètes en arrière-plan. */}
      <View style={[styles.glow, { top: -80, left: -60, width: 240, height: 240 }]} />
      <View style={[styles.glow, { bottom: 20, right: -90, width: 300, height: 300, opacity: 0.08 }]} />

      <View style={[styles.content, fill && { flex: 1, justifyContent: "center" }]}>
        <Animated.View entering={reduced ? undefined : ZoomIn.duration(650).springify().damping(14)} style={{ width: emblemSize, height: emblemSize }}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.ripple, { borderRadius: emblemSize / 2 }, rippleStyle]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.ripple, { borderRadius: emblemSize / 2 }, ripple2Style]} />
          <Animated.View style={[styles.emblemShadow, { borderRadius: emblemSize / 2 }, floatStyle]}>
            <BrandEmblem size={emblemSize} />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(600).delay(250)} style={{ width: titleWidth, height: titleWidth / TITLE_RATIO, marginTop: emblemSize * 0.16 }}>
          <View style={StyleSheet.absoluteFill}>
            <TitlePart part="deep" width={titleWidth} deepColor="#FFFFFF" />
          </View>
          <View style={StyleSheet.absoluteFill}>
            <TitlePart part="clean" width={titleWidth} cleanColor="#7FD3F2" />
          </View>
        </Animated.View>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(600).delay(550)} style={{ marginTop: titleWidth * 0.045 }}>
          <Tagline width={titleWidth * 0.9} color="rgba(255,255,255,0.82)" />
        </Animated.View>
      </View>

      {!fill && <AnimatedWaves height={64} pageColor={pageColor} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  content: { alignItems: "center", paddingTop: 36, paddingBottom: 8 },
  glow: { position: "absolute", borderRadius: 999, backgroundColor: "#FFFFFF", opacity: 0.06 },
  ripple: { borderWidth: 2, borderColor: "rgba(127,211,242,0.9)" },
  emblemShadow: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
});
