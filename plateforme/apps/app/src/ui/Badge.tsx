import { View } from "react-native";
import type { Tone } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** Pastille de statut : couleur + texte (jamais la couleur seule, pour les daltoniens). */
export function Badge({ label, tone = "neutral", dot = true }: { label: string; tone?: Tone; dot?: boolean }) {
  const { colors } = useTheme();
  const map: Record<Tone, [string, string]> = {
    neutral: [colors.surfaceMuted, colors.textSecondary],
    info: [colors.accentSoft, colors.accentText],
    accent: [colors.accentSoft, colors.accentText],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  };
  const [bg, fg] = map[tone];
  return (
    <View
      accessibilityLabel={`Statut : ${label}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
