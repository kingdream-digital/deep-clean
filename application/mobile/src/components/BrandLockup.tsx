import React from "react";
import { Image, View } from "react-native";
import { LogoMark } from "./LogoMark";
import { useTheme } from "../theme/ThemeProvider";

// Logo officiel en ligne : la goutte, puis « DEEPCLEAN » dans la police et les
// couleurs du logo (vectorisé depuis le logo du client, sources .svg dans
// assets/brand). Sur fond sombre, « DEEP » passe en blanc pour rester lisible.
const titleInk = require("../../assets/brand/title-ink.png");
const titleWhite = require("../../assets/brand/title-white.png");
const TITLE_RATIO = 1200 / 168;

interface Props {
  /** Hauteur de la goutte ; le texte s'aligne dessus. */
  height?: number;
  variant?: "auto" | "white" | "ink";
}

export function BrandLockup({ height = 30, variant = "auto" }: Props) {
  const { isDark } = useTheme();
  const white = variant === "white" || (variant === "auto" && isDark);
  const textHeight = Math.round(height * 0.5);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel="Deep Clean" accessible>
      <LogoMark size={height} />
      <Image
        source={white ? titleWhite : titleInk}
        style={{ width: Math.round(textHeight * TITLE_RATIO), height: textHeight, marginLeft: Math.round(height * 0.28) }}
        resizeMode="contain"
      />
    </View>
  );
}

/** « DEEPCLEAN » seul, dans la police du logo (sous la goutte, à la connexion). */
export function BrandTitle({ height = 22, variant = "auto" }: { height?: number; variant?: "auto" | "white" | "ink" }) {
  const { isDark } = useTheme();
  const white = variant === "white" || (variant === "auto" && isDark);
  return (
    <Image
      source={white ? titleWhite : titleInk}
      style={{ width: Math.round(height * TITLE_RATIO), height }}
      resizeMode="contain"
      accessibilityLabel="Deep Clean"
    />
  );
}
