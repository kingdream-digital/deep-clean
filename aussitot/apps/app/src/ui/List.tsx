import { Children, isValidElement, type ComponentType, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronRight, type LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/** Liste groupée (façon réglages iOS) : un titre de section, des lignes séparées par un trait fin. */
export function ListGroup({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {title ? (
        <Text variant="overline" tone="tertiary" uppercase style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View
        style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
      >
        {rows.map((row, index) => (
          <View key={row.key ?? index}>
            {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 }} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" tone="tertiary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  icon?: ComponentType<LucideProps>;
  iconTone?: "accent" | "spark" | "success" | "warning" | "danger" | "neutral";
  leading?: ReactNode;
  trailing?: ReactNode;
  trailingText?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  icon: Icon,
  iconTone = "accent",
  leading,
  trailing,
  trailingText,
  onPress,
  chevron = Boolean(onPress),
  destructive,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const tones = {
    accent: [colors.accentSoft, colors.accentText],
    spark: [colors.sparkSoft, colors.sparkText],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.surfaceMuted, colors.textSecondary],
  } as const;
  const [iconBg, iconFg] = tones[iconTone];
  const content = (
    <View style={styles.row}>
      {leading ??
        (Icon ? (
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Icon size={18} color={iconFg} strokeWidth={2.1} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Text variant="callout" weight="medium" tone={destructive ? "danger" : "primary"} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailingText ? (
        <Text variant="subhead" tone="secondary" tabular numberOfLines={1}>
          {trailingText}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return <View accessibilityLabel={accessibilityLabel}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={1}
      haptic="selection"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, trailingText].filter(Boolean).join(", ")}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  title: { marginLeft: 16, marginBottom: 8 },
  footer: { marginHorizontal: 16, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
});
