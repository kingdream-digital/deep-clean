import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, useAnimatedStyle } from "react-native-reanimated";
import { Card } from "./Card";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";
import { PulsingDot } from "./PulsingDot";
import { ProgressRing } from "./ProgressRing";
import { useTheme } from "../theme/ThemeProvider";
import { useWeeklyTimesheetSummary } from "../hooks/useWeeklyTimesheetSummary";
import { formatHoursMinutes } from "../utils/timesheetSummary";
import { useClockStatus, elapsedLabel, REFERENCE_WORKDAY_MINUTES } from "../hooks/useClockStatus";

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Pointage mis en avant tout en haut du tableau de bord — c'est l'action la
// plus fréquente de l'application (potentiellement deux fois par jour, pour
// tout le monde), elle ne doit jamais être à plus d'un geste de l'accueil.
export function TimesheetWidget({
  onOpenHistory,
  onOpenRetroactive,
}: {
  onOpenHistory: () => void;
  onOpenRetroactive: () => void;
}) {
  const { colors, spacing, type } = useTheme();
  const { summary, reload: reloadSummary } = useWeeklyTimesheetSummary();
  const {
    state,
    acting,
    error,
    pendingAction,
    effectiveClockedIn,
    effectiveClockInTime,
    minutesElapsed,
    showSuccess,
    successScale,
    handlePress: handlePressAction,
  } = useClockStatus();

  function handlePress() {
    void handlePressAction(() => void reloadSummary());
  }

  const successStyle = useAnimatedStyle(() => ({ transform: [{ scale: successScale.value }] }));

  if (state === "loading") return <Card style={{ height: 96 }} />;
  if (state === "error") return null; // widget discret : jamais bloquant pour le reste du tableau de bord

  return (
    <Card glow={effectiveClockedIn}>
      {effectiveClockedIn && effectiveClockInTime ? (
        <PressableScale onPress={onOpenHistory}>
          <View style={{ alignItems: "center" }}>
            <ProgressRing size={96} strokeWidth={7} progress={minutesElapsed / REFERENCE_WORKDAY_MINUTES}>
              <Text style={[type.title3, { color: colors.ink, fontVariant: ["tabular-nums"] }]}>
                {elapsedLabel(minutesElapsed)}
              </Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>
                depuis {timeFmt.format(new Date(effectiveClockInTime))}
              </Text>
            </ProgressRing>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing.md,
                backgroundColor: pendingAction ? colors.warningSoft : colors.successSoft,
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 12,
              }}
            >
              <PulsingDot color={pendingAction ? colors.warning : colors.success} style={{ marginRight: spacing.xs }} />
              <Text
                style={[type.footnote, { color: pendingAction ? colors.warning : colors.success, fontWeight: "600" }]}
                numberOfLines={1}
              >
                {pendingAction ? "En attente de synchronisation" : "En poste"}
              </Text>
            </View>
          </View>
        </PressableScale>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <PressableScale onPress={onOpenHistory} style={{ flex: 1 }}>
            <View>
              <Text style={[type.headline, { color: colors.ink }]}>Vous n'êtes pas pointé</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>Mon historique de pointage</Text>
            </View>
          </PressableScale>
          <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
        </View>
      )}

      {/* Résumé hebdomadaire — remis à 0 chaque lundi (voir
          useWeeklyTimesheetSummary), pour un visuel immédiat sur les heures
          déjà validées vs. encore en attente, sans avoir à ouvrir l'historique. */}
      <View
        style={{
          flexDirection: "row",
          marginTop: spacing.md,
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>Cette semaine</Text>
          <Text style={[type.headline, { color: colors.ink, marginTop: 2 }]}>
            {formatHoursMinutes(summary.totalMinutes)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>Validées</Text>
          <Text style={[type.headline, { color: colors.success, marginTop: 2 }]}>
            {formatHoursMinutes(summary.validatedMinutes)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>En attente</Text>
          <Text style={[type.headline, { color: colors.warning, marginTop: 2 }]}>
            {formatHoursMinutes(summary.pendingMinutes)}
          </Text>
        </View>
      </View>

      {error && (
        <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>
      )}

      {showSuccess ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(280)}
          style={[
            {
              marginTop: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: colors.successSoft,
            },
            successStyle,
          ]}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={[type.headline, { color: colors.success, marginLeft: spacing.xs }]}>
            Pointage terminé — bon travail !
          </Text>
        </Animated.View>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label={effectiveClockedIn ? "Pointer ma sortie" : "Pointer mon arrivée"}
            variant={effectiveClockedIn ? "destructive" : "primary"}
            loading={acting}
            onPress={handlePress}
          />
        </View>
      )}

      {/* Pour un oubli de pointage : saisir après coup une session déjà
          terminée plutôt qu'un pointage en cours (voir RetroactiveClockScreen). */}
      <PressableScale onPress={onOpenRetroactive} style={{ marginTop: spacing.sm, alignSelf: "center" }}>
        <Text style={[type.footnote, { color: colors.inkTertiary, textDecorationLine: "underline" }]}>
          J'ai oublié de pointer — pointage différé
        </Text>
      </PressableScale>
    </Card>
  );
}
