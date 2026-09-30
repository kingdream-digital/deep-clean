import React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

// Barre de progression linéaire simple (une valeur / un objectif) — extraite
// de CommercialHomeScreen pour être réutilisée telle quelle sur la fiche
// chantier (même logique visuelle, jamais deux implémentations qui divergent).
export function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const { colors, radius } = useTheme();
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceAlt }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}
