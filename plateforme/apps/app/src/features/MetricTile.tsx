import { View } from "react-native";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale, Text } from "@/ui";

/** Indicateur chiffré du tableau de bord ; toucher : la liste correspondante. */
export function MetricTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = "accent",
  onPress,
  testID,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: ComponentType<LucideProps>;
  tone?: "accent" | "success" | "danger" | "warning" | "spark";
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const [bg, fg] = {
    accent: [colors.accentSoft, colors.accentText],
    success: [colors.successSoft, colors.success],
    danger: [colors.dangerSoft, colors.danger],
    warning: [colors.warningSoft, colors.warning],
    spark: [colors.sparkSoft, colors.sparkText],
  }[tone];
  const content = (
    <>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} color={fg} strokeWidth={2.2} />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="title2" tabular numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text variant="subhead" tone="secondary" numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" tone={tone === "danger" ? "danger" : "tertiary"} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </>
  );
  const style = {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <PressableScale
      onPress={onPress}
      testID={testID}
      accessibilityLabel={`${label} : ${value}${caption ? `, ${caption}` : ""}`}
      style={style}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
      scaleTo={0.98}
    >
      {content}
    </PressableScale>
  );
}
