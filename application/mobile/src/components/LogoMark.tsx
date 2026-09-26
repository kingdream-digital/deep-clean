import React from "react";
import { Image } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

const markWhite = require("../../assets/brand/mark-white.png");
const markInk = require("../../assets/brand/mark-ink.png");

interface LogoMarkProps {
  size?: number;
  /** Force une variante précise au lieu de suivre le thème courant. */
  variant?: "auto" | "white" | "ink";
}

export function LogoMark({ size = 40, variant = "auto" }: LogoMarkProps) {
  const { isDark } = useTheme();
  const useWhite = variant === "white" || (variant === "auto" && isDark);

  return (
    <Image
      source={useWhite ? markWhite : markInk}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Deep Clean"
    />
  );
}
