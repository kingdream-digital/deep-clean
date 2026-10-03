import React from "react";
import { Image } from "react-native";

// Goutte du logo officiel Deep Clean (vectorisée depuis le logo fourni par le
// client, source : assets/brand/logo-drop.svg). Bleu sur fond clair comme
// sombre : la même goutte partout.
const drop = require("../../assets/brand/drop.png");
export const DROP_RATIO = 203 / 300;

interface LogoMarkProps {
  /** Hauteur de la goutte. */
  size?: number;
  /** Conservé pour compatibilité : la goutte est la même sur tous les fonds. */
  variant?: "auto" | "white" | "ink";
}

export function LogoMark({ size = 40 }: LogoMarkProps) {
  return <Image source={drop} style={{ width: Math.round(size * DROP_RATIO), height: size }} resizeMode="contain" accessibilityLabel="Deep Clean" />;
}
