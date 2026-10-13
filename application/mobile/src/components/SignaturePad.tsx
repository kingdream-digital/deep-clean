import React, { useMemo, useRef, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, PanResponder, Platform, Text, View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

export interface SignatureValue {
  width: number;
  height: number;
  // Chaque trait : liste plate [x1, y1, x2, y2…] en coordonnées de la zone.
  strokes: number[][];
}

interface SignaturePadProps {
  value: SignatureValue | null;
  onChange: (value: SignatureValue | null) => void;
  height?: number;
  // Prévient l'écran parent qu'un tracé est en cours (pour bloquer le
  // défilement pendant que le client signe).
  onDrawingChange?: (drawing: boolean) => void;
  style?: ViewStyle;
}

// Distance minimale entre deux points enregistrés : lisse le tracé et limite
// le volume envoyé au serveur sans perte visible.
const MIN_DISTANCE = 1.5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function strokeToPath(stroke: number[]): string {
  if (stroke.length < 2) return "";
  if (stroke.length === 2) {
    // Simple point (un « i », un point final) : petit trait visible.
    return `M ${stroke[0]} ${stroke[1]} L ${stroke[0]! + 0.5} ${stroke[1]! + 0.5}`;
  }
  let d = `M ${stroke[0]} ${stroke[1]}`;
  for (let i = 2; i + 1 < stroke.length; i += 2) d += ` L ${stroke[i]} ${stroke[i + 1]}`;
  return d;
}

/**
 * Zone de signature manuscrite : le client signe au doigt (ou à la souris sur
 * le web). Le tracé est conservé en vectoriel pour être redessiné à
 * l'identique dans le PDF du devis.
 */
export function SignaturePad({ value, onChange, height = 220, onDrawingChange, style }: SignaturePadProps) {
  const { colors, radius, type } = useTheme();
  const [size, setSize] = useState({ width: 0, height });
  const currentStroke = useRef<number[] | null>(null);
  const [, forceRender] = useState(0);

  // Références à jour pour les callbacks du PanResponder (créé une seule fois).
  const latest = useRef({ value, onChange, size, onDrawingChange });
  latest.current = { value, onChange, size, onDrawingChange };

  const responder = useMemo(() => {
    const point = (e: GestureResponderEvent): [number, number] => {
      const { width: w, height: h } = latest.current.size;
      const x = Math.min(Math.max(e.nativeEvent.locationX, 0), w);
      const y = Math.min(Math.max(e.nativeEvent.locationY, 0), h);
      return [round1(x), round1(y)];
    };
    const finish = () => {
      const stroke = currentStroke.current;
      currentStroke.current = null;
      latest.current.onDrawingChange?.(false);
      if (!stroke || stroke.length < 2) return;
      const { width: w, height: h } = latest.current.size;
      const previous = latest.current.value?.strokes ?? [];
      latest.current.onChange({ width: w, height: h, strokes: [...previous, stroke] });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        latest.current.onDrawingChange?.(true);
        currentStroke.current = point(e);
        forceRender((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const stroke = currentStroke.current;
        if (!stroke) return;
        const [x, y] = point(e);
        const lastX = stroke[stroke.length - 2]!;
        const lastY = stroke[stroke.length - 1]!;
        if (Math.hypot(x - lastX, y - lastY) < MIN_DISTANCE) return;
        stroke.push(x, y);
        forceRender((n) => n + 1);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  }, []);

  function handleLayout(e: LayoutChangeEvent) {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize({ width: round1(w), height: round1(h) });
  }

  const strokes = [...(value?.strokes ?? []), ...(currentStroke.current ? [currentStroke.current] : [])];
  const isEmpty = strokes.length === 0;

  return (
    <View
      onLayout={handleLayout}
      accessibilityLabel="Zone de signature"
      style={[
        {
          height,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.accent,
          backgroundColor: colors.backgroundElevated,
          overflow: "hidden",
        },
        // Web : empêche la page de défiler ou de sélectionner du texte
        // pendant que le client signe au doigt / à la souris.
        Platform.OS === "web" ? ({ touchAction: "none", userSelect: "none", cursor: "crosshair" } as unknown as ViewStyle) : null,
        style,
      ]}
      {...responder.panHandlers}
    >
      {isEmpty && (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={[type.subhead, { color: colors.inkTertiary }]}>Signez ici</Text>
        </View>
      )}
      <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, bottom: 40, height: 1, backgroundColor: colors.border }} />
      {/* pointerEvents="none" : les coordonnées du toucher restent celles de
          la zone entière, jamais celles d'un trait déjà dessiné. */}
      <Svg pointerEvents="none" width={size.width} height={size.height} style={{ position: "absolute", top: 0, left: 0 }}>
        {strokes.map((stroke, i) => (
          <Path key={i} d={strokeToPath(stroke)} stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
    </View>
  );
}
