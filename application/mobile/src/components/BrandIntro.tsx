import React, { useEffect } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { EmblemPiece, Tagline, TAGLINE_RATIO, TitlePart, TITLE_RATIO } from "./BrandEmblem";

// Ouverture animée du logo Deep Clean (retour explicite du client : une
// animation à l'ouverture de l'app, la première fois de la journée, même
// déjà connecté). Le cercle apparaît, l'eau monte vague après vague, la
// goutte tombe, « DEEP » et « CLEAN » se rejoignent, puis le slogan.
// Un appui n'importe où passe l'animation.

const ease = Easing.out(Easing.cubic);

export function BrandIntro({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const size = Math.min(width * 0.52, height * 0.3, 230);
  const titleWidth = Math.min(width * 0.78, 360);
  const taglineWidth = titleWidth * 0.92;

  const ring = useSharedValue(0);
  const waveLight = useSharedValue(1);
  const waveMid = useSharedValue(1);
  const waveNavy = useSharedValue(1);
  const drop = useSharedValue(0);
  const ripple = useSharedValue(0);
  const deep = useSharedValue(0);
  const clean = useSharedValue(0);
  const tagline = useSharedValue(0);
  const exit = useSharedValue(0);

  const finish = () => onDone();

  useEffect(() => {
    if (reduced) {
      ring.value = 1;
      waveLight.value = 0;
      waveMid.value = 0;
      waveNavy.value = 0;
      drop.value = 1;
      deep.value = 1;
      clean.value = 1;
      tagline.value = 1;
      exit.value = withDelay(900, withTiming(1, { duration: 300 }, (ok) => ok && runOnJS(finish)()));
      return;
    }
    ring.value = withTiming(1, { duration: 520, easing: ease });
    waveNavy.value = withDelay(260, withTiming(0, { duration: 700, easing: ease }));
    waveMid.value = withDelay(380, withTiming(0, { duration: 700, easing: ease }));
    waveLight.value = withDelay(500, withTiming(0, { duration: 700, easing: ease }));
    drop.value = withDelay(820, withSpring(1, { damping: 9, stiffness: 140, mass: 0.7 }));
    ripple.value = withDelay(1020, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    deep.value = withDelay(1180, withTiming(1, { duration: 520, easing: ease }));
    clean.value = withDelay(1260, withTiming(1, { duration: 520, easing: ease }));
    tagline.value = withDelay(1650, withTiming(1, { duration: 480, easing: ease }));
    exit.value = withDelay(2650, withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }, (ok) => ok && runOnJS(finish)()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  function skip() {
    exit.value = withTiming(1, { duration: 220 }, (ok) => ok && runOnJS(finish)());
  }

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + exit.value * 0.06 }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value, transform: [{ scale: 0.7 + ring.value * 0.3 }, { rotate: `${(1 - ring.value) * -40}deg` }] }));
  const wave = (v: typeof waveNavy) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({ transform: [{ translateY: v.value * size * 0.75 }] }));
  const navyStyle = wave(waveNavy);
  const midStyle = wave(waveMid);
  const lightStyle = wave(waveLight);
  const dropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, drop.value * 3), transform: [{ translateY: (1 - drop.value) * -size * 0.9 }] }));
  const rippleStyle = useAnimatedStyle(() => ({ opacity: (1 - ripple.value) * 0.5 * (ripple.value > 0 ? 1 : 0), transform: [{ scale: 1 + ripple.value * 0.45 }] }));
  const deepStyle = useAnimatedStyle(() => ({ opacity: deep.value, transform: [{ translateX: (1 - deep.value) * -40 }] }));
  const cleanStyle = useAnimatedStyle(() => ({ opacity: clean.value, transform: [{ translateX: (1 - clean.value) * 40 }] }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value, transform: [{ translateY: (1 - tagline.value) * 8 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} accessibilityLabel="Deep Clean">
      <LinearGradient colors={["#FFFFFF", "#F2F8FC", "#E4F1F9"]} style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel="Passer l'animation">
        <Animated.View style={[styles.center, stageStyle]}>
          <View style={{ width: size, height: size }}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.ripple, { borderRadius: size / 2 }, rippleStyle]} />
            {/* L'eau monte dans le cercle : les vagues sont découpées par le disque. */}
            <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
              <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: "hidden" }]}>
                <EmblemPiece piece="disc" size={size} />
                <Animated.View style={[StyleSheet.absoluteFill, navyStyle]}>
                  <EmblemPiece piece="waveNavy" size={size} />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, midStyle]}>
                  <EmblemPiece piece="waveMid" size={size} />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, lightStyle]}>
                  <EmblemPiece piece="waveLight" size={size} />
                </Animated.View>
              </View>
              <View style={StyleSheet.absoluteFill}>
                <EmblemPiece piece="ring" size={size} />
              </View>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, dropStyle]}>
              <EmblemPiece piece="drop" size={size} />
            </Animated.View>
          </View>

          <View style={{ width: titleWidth, height: titleWidth / TITLE_RATIO, marginTop: size * 0.14 }}>
            <Animated.View style={[StyleSheet.absoluteFill, deepStyle]}>
              <TitlePart part="deep" width={titleWidth} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, cleanStyle]}>
              <TitlePart part="clean" width={titleWidth} />
            </Animated.View>
          </View>
          <Animated.View style={[{ width: taglineWidth, height: taglineWidth / TAGLINE_RATIO, marginTop: titleWidth * 0.05 }, taglineStyle]}>
            <Tagline width={taglineWidth} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  ripple: { borderWidth: 2, borderColor: "#1E9CC6" },
});
