import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

const HUES = ["#2347F5", "#0E7490", "#7C3AED", "#B45309", "#0F766E", "#BE185D", "#4338CA", "#15803D"];

/** Couleur opaque = teinte mélangée au fond (les avatars qui se chevauchent restent lisibles). */
function mix(hex: string, base: string, alpha: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1 = 0, g1 = 0, b1 = 0] = parse(hex);
  const [r2 = 0, g2 = 0, b2 = 0] = parse(base);
  const c = (a: number, b: number) =>
    Math.round(a * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function hueFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export function Avatar({ firstName, lastName, size = 36 }: { firstName: string; lastName: string; size?: number }) {
  const { colors } = useTheme();
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const hue = hueFor(`${firstName}${lastName}`);
  return (
    <View
      accessibilityLabel={`${firstName} ${lastName}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: mix(hue, colors.mode === "dark" ? "#14171D" : "#FFFFFF", colors.mode === "dark" ? 0.32 : 0.14),
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.surface,
      }}
    >
      <Text variant={size >= 44 ? "headline" : "caption"} style={{ color: colors.mode === "dark" ? "#E8ECFF" : hue }} weight="semibold">
        {initials}
      </Text>
    </View>
  );
}

/** Pile d'avatars qui se chevauchent (équipe d'une mission). */
export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { firstName: string; lastName: string }[];
  max?: number;
  size?: number;
}) {
  const { colors } = useTheme();
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={`Équipe : ${people.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}`}>
      {shown.map((p, i) => (
        <View key={`${p.firstName}-${p.lastName}-${i}`} style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.2) }}>
          <Avatar firstName={p.firstName} lastName={p.lastName} size={size} />
        </View>
      ))}
      {rest > 0 ? (
        <View
          style={{
            marginLeft: -Math.round(size * 0.2),
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        >
          <Text variant="caption" tone="secondary">
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
