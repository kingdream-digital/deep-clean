import React from "react";
import { View } from "react-native";
import { BRAND_COLORS, BrandEmblem, Tagline, TitlePart, TITLE_RATIO } from "./BrandEmblem";

// Logo horizontal officiel (comme l'en-tête du site deep-clean.fr) : le
// médaillon, « DEEP CLEAN », puis « SERVICE DE NETTOYAGE », entièrement
// vectoriel (tracés de brandArtwork.ts) — net à toutes les tailles.
export function BrandWordmark({ height = 34, inverted = false }: { height?: number; inverted?: boolean }) {
  // Proportions du logo du site : texte ≈ 3,8 × la hauteur du médaillon.
  const textWidth = Math.round(height * 3.8);
  const titleHeight = textWidth / TITLE_RATIO;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessible accessibilityRole="image" accessibilityLabel="Deep Clean — Service de nettoyage">
      <BrandEmblem size={height} />
      <View style={{ marginLeft: Math.round(height * 0.28) }}>
        <View style={{ width: textWidth, height: titleHeight }}>
          <View style={{ position: "absolute" }}>
            <TitlePart part="deep" width={textWidth} deepColor={inverted ? "#FFFFFF" : BRAND_COLORS.navy} />
          </View>
          <View style={{ position: "absolute" }}>
            <TitlePart part="clean" width={textWidth} />
          </View>
        </View>
        <View style={{ marginTop: Math.round(height * 0.07) }}>
          <Tagline width={textWidth} color={inverted ? "#DDF0FA" : BRAND_COLORS.navy} />
        </View>
      </View>
    </View>
  );
}
