import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getReconciliation, listTimeEntries } from "../../api/timesheets.api";
import { addDays, mondayOf, toLocalDateKey } from "../../utils/missionFormat";
import { useLiveFocusEffect } from "../../sync/liveSync";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Target =
  | "TimesheetValidation"
  | "Reconciliation"
  | "StaffHoursList"
  | "Timesheet";

interface Tile {
  screen: Target;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  count?: number | null;
  countLabel?: string;
  tone: "success" | "warning" | "accent" | "purple";
}

// Retour explicite du client : « le menu des heures doit être simple, qu'on
// voie tout, sans complexité ». Les quatre entrées de menu séparées (valider,
// écarts, dossiers d'heures, mes heures) sont réunies ici, avec en tête ce
// qui demande une action (pointages à valider, écarts de la semaine).
export function HoursHubScreen() {
  const { colors, spacing, type, radius } = useTheme();
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const [pending, setPending] = useState<number | null>(null);
  const [gaps, setGaps] = useState<number | null>(null);

  const load = useCallback(async () => {
    const monday = mondayOf(new Date());
    const [p, r] = await Promise.allSettled([
      listTimeEntries({ status: "PENDING", pageSize: 1 }),
      getReconciliation(
        toLocalDateKey(monday),
        toLocalDateKey(addDays(monday, 6)),
      ),
    ]);
    setPending(p.status === "fulfilled" ? p.value.total : null);
    setGaps(
      r.status === "fulfilled"
        ? r.value.filter((row) => row.status === "ANOMALY").length
        : null,
    );
  }, []);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) return null;
  // Le chef d'équipe ne gère pas la paie : pas de dossiers d'heures pour lui.
  const showPayroll = user.role !== "SITE_MANAGER";
  const team =
    user.role === "SITE_MANAGER" ? "de votre équipe" : "de l'entreprise";

  const tiles: Tile[] = [
    {
      screen: "TimesheetValidation",
      icon: "checkmark-done-outline",
      title: "Pointages à valider",
      subtitle: `Arrivées et départs ${team}`,
      count: pending,
      countLabel: "à valider",
      tone: "success",
    },
    {
      screen: "Reconciliation",
      icon: "swap-horizontal-outline",
      title: "Écarts à vérifier",
      subtitle: "Heures pointées comparées aux missions, cette semaine",
      count: gaps,
      countLabel: "à vérifier",
      tone: "warning",
    },
    ...(showPayroll
      ? [
          {
            screen: "StaffHoursList" as const,
            icon: "folder-outline" as const,
            title: "Heures par personne",
            subtitle:
              "Total du mois, heures de nuit, dimanches, fériés · export paie",
            tone: "accent" as const,
          },
        ]
      : []),
    {
      screen: "Timesheet",
      icon: "time-outline",
      title: "Mes heures",
      subtitle: "Mon pointage et mon historique",
      tone: "purple",
    },
  ];
  const toneColors = {
    success: { fg: colors.success, bg: colors.successSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    accent: { fg: colors.accent, bg: colors.accentSoft },
    purple: { fg: colors.purple, bg: colors.purpleSoft },
  };

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl, gap: spacing.sm }}
      >
        {tiles.map((tile) => {
          const tone = toneColors[tile.tone];
          const hasCount = tile.count !== undefined;
          const urgent = (tile.count ?? 0) > 0;
          return (
            <PressableScale
              key={tile.screen}
              onPress={() => navigation.navigate(tile.screen)}
              accessibilityLabel={tile.title}
            >
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: radius.md,
                      backgroundColor: tone.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={tile.icon} size={22} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[type.headline, { color: colors.ink }]}>
                      {tile.title}
                    </Text>
                    <Text
                      style={[
                        type.footnote,
                        { color: colors.inkSecondary, marginTop: 2 },
                      ]}
                    >
                      {tile.subtitle}
                    </Text>
                  </View>
                  {hasCount ? (
                    <View
                      style={{ alignItems: "flex-end", marginLeft: spacing.sm }}
                    >
                      <Text
                        style={[
                          type.title2,
                          {
                            color: urgent ? tone.fg : colors.inkTertiary,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {tile.count ?? "–"}
                      </Text>
                      <Text
                        style={[type.caption, { color: colors.inkTertiary }]}
                      >
                        {tile.countLabel}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.inkTertiary}
                    />
                  )}
                </View>
              </Card>
            </PressableScale>
          );
        })}
        <Text
          style={[
            type.footnote,
            {
              color: colors.inkTertiary,
              textAlign: "center",
              marginTop: spacing.sm,
            },
          ]}
        >
          Les heures de nuit (21 h – 6 h), du dimanche et des jours fériés sont
          calculées automatiquement selon la convention collective de la
          propreté.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
