import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { BRAND_ART, TAGLINE_VIEWBOX, TITLE_VIEWBOX } from "./brandArtwork";

// Pièces du logo officiel Deep Clean (cercle, vagues, goutte, « DEEP »,
// « CLEAN », slogan), en vectoriel : nettes à toutes les tailles et animables
// séparément (voir BrandIntro).

export const BRAND_COLORS = { navy: "#1F2D69", mid: "#2A4F8E", light: "#5A9CC4", drop: "#1E9CC6" } as const;

const E = BRAND_ART.emblem;
const EMBLEM_VIEWBOX = `0 0 ${E.size} ${E.size}`;

type Piece = "disc" | "waveNavy" | "waveMid" | "waveLight" | "drop" | "ring";

/** Une couche du médaillon, dessinée dans le carré `size` × `size`. */
export function EmblemPiece({ piece, size }: { piece: Piece; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={EMBLEM_VIEWBOX}>
      {piece === "disc" && <Circle cx={E.cx} cy={E.cy} r={E.ringR} fill="#FFFFFF" />}
      {piece === "waveNavy" && <Path d={E.waveNavy} fill={BRAND_COLORS.navy} fillRule="evenodd" />}
      {piece === "waveMid" && <Path d={E.waveMid} fill={BRAND_COLORS.mid} fillRule="evenodd" />}
      {piece === "waveLight" && <Path d={E.waveLight} fill={BRAND_COLORS.light} fillRule="evenodd" />}
      {piece === "drop" && <Path d={E.drop} fill={BRAND_COLORS.drop} fillRule="evenodd" />}
      {piece === "ring" && <Circle cx={E.cx} cy={E.cy} r={E.ringR} fill="none" stroke={BRAND_COLORS.navy} strokeWidth={E.ringWidth} />}
    </Svg>
  );
}

/** Médaillon complet, statique. */
export function BrandEmblem({ size, opacity = 1 }: { size: number; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox={EMBLEM_VIEWBOX} opacity={opacity}>
      <Circle cx={E.cx} cy={E.cy} r={E.ringR} fill="#FFFFFF" />
      <Path d={E.waveNavy} fill={BRAND_COLORS.navy} fillRule="evenodd" />
      <Path d={E.waveMid} fill={BRAND_COLORS.mid} fillRule="evenodd" />
      <Path d={E.waveLight} fill={BRAND_COLORS.light} fillRule="evenodd" />
      <Path d={E.drop} fill={BRAND_COLORS.drop} fillRule="evenodd" />
      <Circle cx={E.cx} cy={E.cy} r={E.ringR} fill="none" stroke={BRAND_COLORS.navy} strokeWidth={E.ringWidth} />
    </Svg>
  );
}

export const TITLE_RATIO = TITLE_VIEWBOX.w / TITLE_VIEWBOX.h;
export const TAGLINE_RATIO = TAGLINE_VIEWBOX.w / TAGLINE_VIEWBOX.h;
const titleVb = `${TITLE_VIEWBOX.x} ${TITLE_VIEWBOX.y} ${TITLE_VIEWBOX.w} ${TITLE_VIEWBOX.h}`;

/** « DEEP » ou « CLEAN » seul, cadré comme le titre complet (superposables). */
export function TitlePart({ part, width, deepColor = BRAND_COLORS.navy }: { part: "deep" | "clean"; width: number; deepColor?: string }) {
  return (
    <Svg width={width} height={width / TITLE_RATIO} viewBox={titleVb}>
      <Path d={part === "deep" ? BRAND_ART.title.deep : BRAND_ART.title.clean} fill={part === "deep" ? deepColor : BRAND_COLORS.drop} fillRule="evenodd" />
    </Svg>
  );
}

export function Tagline({ width, color = BRAND_COLORS.navy }: { width: number; color?: string }) {
  return (
    <Svg width={width} height={width / TAGLINE_RATIO} viewBox={`${TAGLINE_VIEWBOX.x} ${TAGLINE_VIEWBOX.y} ${TAGLINE_VIEWBOX.w} ${TAGLINE_VIEWBOX.h}`}>
      <Path d={BRAND_ART.tagline.d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
