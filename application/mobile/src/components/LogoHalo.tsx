import React from "react";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

// Halo teal derrière le logo (écran de connexion) : trois cercles concentriques
// à opacité décroissante plutôt qu'un vrai flou temps réel — un effet statique
// n'a pas besoin du coût d'un BlurView, et le rendu reste identique natif/web.
export function LogoHalo() {
  const { colors, isDark } = useTheme();
  if (!isDark) return null;

  const rings = [
    { size: 260, opacity: 0.06 },
    { size: 180, opacity: 0.1 },
    { size: 110, opacity: 0.16 },
  ];

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: -100, alignItems: "center", justifyContent: "center", width: "100%" }}>
      {rings.map((ring) => (
        <View
          key={ring.size}
          style={{
            position: "absolute",
            width: ring.size,
            height: ring.size,
            borderRadius: ring.size / 2,
            backgroundColor: colors.accentBright,
            opacity: ring.opacity,
          }}
        />
      ))}
    </View>
  );
}
