import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

interface ProgressRingProps {
  size?: number;
  strokeWidth?: number;
  /** 0 à 1 — au-delà de 1, l'anneau reste plein plutôt que de "déborder". */
  progress: number;
  /** Couleur du tracé — accent par défaut (pointage), personnalisable pour
      d'autres usages (ex. avancement d'un chantier, en vert). */
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

// Anneau de progression générique (pointage aujourd'hui, avancement d'un
// chantier, etc.) — dessiné en SVG plutôt qu'en jouant avec des bordures/
// rotations de View, pour un tracé net à n'importe quelle taille et un
// stroke-linecap arrondi propre.
export function ProgressRing({ size = 112, strokeWidth = 8, progress, color, trackColor, children }: ProgressRingProps) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ?? colors.accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      {children}
    </View>
  );
}
