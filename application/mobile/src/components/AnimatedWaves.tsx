import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

// Vagues du logo Deep Clean qui ondulent lentement en bas de l'en-tête de
// l'accueil. Chaque vague est un motif périodique deux fois plus large que
// l'écran, décalé en boucle d'une période : le mouvement est continu, sans
// raccord visible. Animation désactivée si l'appareil demande moins de
// mouvements.

function wavePath(base: number, amp: number, phase: number): string {
  // Largeur 1200 = deux périodes de 600 : décaler de 600 retombe sur le même dessin.
  let d = `M0 ${base + amp * Math.sin(phase)}`;
  for (let x = 20; x <= 1200; x += 20) d += ` L${x} ${(base + amp * Math.sin((2 * Math.PI * x) / 600 + phase)).toFixed(1)}`;
  return `${d} L1200 100 L0 100 Z`;
}

interface Layer {
  color: string;
  base: number;
  amp: number;
  phase: number;
  duration: number;
}

function Wave({ layer, width, height }: { layer: Layer; width: number; height: number }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced || width === 0) return undefined;
    x.value = 0;
    x.value = withRepeat(withTiming(-width, { duration: layer.duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { width: width * 2 }, style]}>
      <Svg width={width * 2} height={height} viewBox="0 0 1200 100" preserveAspectRatio="none">
        <Path d={wavePath(layer.base, layer.amp, layer.phase)} fill={layer.color} />
      </Svg>
    </Animated.View>
  );
}

/** Bande de vagues ; la dernière prend la couleur du fond de page pour s'y fondre. */
export function AnimatedWaves({ height = 56, pageColor }: { height?: number; pageColor: string }) {
  const [width, setWidth] = useState(0);
  const layers: Layer[] = [
    { color: "rgba(90,156,196,0.6)", base: 34, amp: 16, phase: 0, duration: 14000 },
    { color: "rgba(30,156,198,0.5)", base: 50, amp: 14, phase: 2.1, duration: 9500 },
    { color: pageColor, base: 68, amp: 14, phase: 4.2, duration: 12000 },
  ];
  return (
    <View style={{ height, overflow: "hidden" }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none">
      {width > 0 && layers.map((l, i) => <Wave key={i} layer={l} width={width} height={height} />)}
    </View>
  );
}
