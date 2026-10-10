import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { BRAND } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** Symbole Aussitôt : une onde de voix qui devient une coche — « dit », puis « fait ». */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={BRAND.name}>
      <Defs>
        <LinearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B5BFF" />
          <Stop offset="1" stopColor="#1B33C7" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="18" fill="url(#mark)" />
      <Rect x="12" y="27" width="4.5" height="10" rx="2.25" fill="#FFFFFF" />
      <Rect x="19.5" y="21" width="4.5" height="22" rx="2.25" fill="#FFFFFF" />
      <Rect x="27" y="25" width="4.5" height="14" rx="2.25" fill="#FFFFFF" opacity={0.92} />
      <Path d="M35.5 33.5 L41.5 39.5 L53 25.5" fill="none" stroke="#FF6B3D" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Wordmark({ size = 22, inverse }: { size?: number; inverse?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: Math.round(size * 0.45) }}>
      <LogoMark size={Math.round(size * 1.55)} />
      <Text
        weight="bold"
        style={{ fontSize: size, lineHeight: Math.round(size * 1.2), letterSpacing: -0.6, color: inverse ? "#FFFFFF" : colors.text }}
      >
        {BRAND.name}
      </Text>
    </View>
  );
}
