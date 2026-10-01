import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { useResponsive } from "../hooks/useResponsive";
import { Card } from "./Card";
import type { KpiTile } from "../screens/dashboard/useDashboardData";

// Une SEULE carte groupée (façon Apple Santé/Réglages) plutôt qu'une tuile
// séparée par chiffre : c'est l'empilement de petites cartes à ombre propre
// qui donnait un rendu "carrés non intégrés" — ici les cellules partagent un
// même contour et sont juste séparées par un filet, comme une liste groupée.
export function KpiGrid({ tiles }: { tiles: KpiTile[] }) {
  const { colors, spacing, radius, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const fg: Record<KpiTile["tone"], string> = {
    accent: colors.accentText,
    info: colors.info,
    purple: colors.purple,
    warning: colors.warning,
    success: colors.success,
    danger: colors.danger,
    neutral: colors.neutral,
  };

  // Sur bureau (web large), une grille dense de 4 colonnes se lit d'un coup
  // d'œil façon tableau de bord d'admin ; sur mobile/web étroit, la grille à
  // 2 colonnes d'origine reste inchangée.
  const perRow = isDesktopWeb ? 4 : 2;
  const rows: KpiTile[][] = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));

  return (
    <Card padded={false}>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            borderTopWidth: ri === 0 ? 0 : StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          {row.map((tile, ci) => (
            <View
              key={tile.key}
              style={{
                flex: 1,
                padding: spacing.lg,
                borderLeftWidth: ci === 0 ? 0 : StyleSheet.hairlineWidth,
                borderLeftColor: colors.border,
              }}
            >
              {tile.icon && (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radius.sm,
                    backgroundColor: fg[tile.tone] + "1F",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: spacing.xs,
                  }}
                >
                  <Ionicons name={tile.icon} size={13} color={fg[tile.tone]} />
                </View>
              )}
              <Text style={[type.statNumber, { color: fg[tile.tone] }]}>
                {tile.value}
              </Text>
              <View style={{ height: spacing.xxs }} />
              <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={2}>
                {tile.label}
              </Text>
            </View>
          ))}
          {row.length < perRow &&
            Array.from({ length: perRow - row.length }).map((_, fillerIndex) => (
              <View key={`filler-${fillerIndex}`} style={{ flex: 1 }} />
            ))}
        </View>
      ))}
    </Card>
  );
}
