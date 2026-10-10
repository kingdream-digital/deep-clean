import { View } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale, Text } from "@/ui";

/** Ligne d'une liste de devis / factures : client, numéro, montant, statut. */
export function DocumentRow({
  title,
  subtitle,
  amount,
  badge,
  onPress,
  first,
  accessibilityLabel,
  testID,
}: {
  title: string;
  subtitle: string;
  amount: string;
  badge: ReactNode;
  onPress: () => void;
  first?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={1}
      haptic="selection"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text variant="callout" weight="semibold" tabular>
          {amount}
        </Text>
        {badge}
      </View>
    </PressableScale>
  );
}

/** Conteneur de liste (carte à lignes séparées). */
export function ListCard({ children }: { children: ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
    >
      {children}
    </View>
  );
}
