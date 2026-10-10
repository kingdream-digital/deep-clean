import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CalendarX2, ChevronLeft, ChevronRight } from "lucide-react-native";
import { addDays, formatDayLong, formatDayShort, formatMonth, startOfWeek, type MissionDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { MissionCard } from "@/features/missions/MissionCard";
import { useToday } from "@/lib/today";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { AvatarStack, Button, Card, EmptyState, ErrorState, IconButton, PressableScale, Screen, Segmented, SkeletonList, Text } from "@/ui";

const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Planning de la semaine : mon planning ou celui de toute l'équipe (selon les droits). */
export default function PlanningScreen() {
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const { user, can } = useAuth();
  const readAll = can("planning.readAll");
  const [scope, setScope] = useState<"mine" | "all">(readAll ? "all" : "mine");
  const [selected, setSelected] = useState(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today);
  const weekStart = startOfWeek(selected);
  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const planning = useQuery({
    queryKey: ["planning", weekStart, weekEnd, scope],
    queryFn: () => endpoints.missions.planning(weekStart, weekEnd, scope === "mine" && readAll ? user?.id : undefined),
  });
  const byDay = useMemo(() => {
    const map = new Map<string, MissionDto[]>();
    for (const m of planning.data ?? []) map.set(m.date, [...(map.get(m.date) ?? []), m]);
    return map;
  }, [planning.data]);

  const monthLabel = capitalize(formatMonth(weekStart.slice(0, 7)));
  const actions = can("planning.manage") ? (
    <Button
      label={isWide ? "Nouvelle mission" : "Nouvelle"}
      icon={CalendarPlus}
      size="sm"
      onPress={() => router.push(`/planning/nouvelle?date=${selected}`)}
      testID="planning-new"
    />
  ) : undefined;

  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
  const weekLabel = `${sameMonth ? Number(weekStart.slice(8)) : formatDayShort(weekStart, { year: false })} – ${formatDayShort(weekEnd, { year: false })}`;
  const weekNav = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <IconButton
        icon={ChevronLeft}
        label="Semaine précédente"
        onPress={() => setSelected(addDays(selected, -7))}
        variant="tinted"
        size={38}
      />
      <Text variant="subhead" weight="semibold" tabular style={{ minWidth: 110, textAlign: "center" }} accessibilityLiveRegion="polite">
        {weekLabel}
      </Text>
      <IconButton
        icon={ChevronRight}
        label="Semaine suivante"
        onPress={() => setSelected(addDays(selected, 7))}
        variant="tinted"
        size={38}
      />
      {startOfWeek(today) !== weekStart ? (
        <Button label="Aujourd'hui" variant="ghost" size="sm" onPress={() => setSelected(today)} />
      ) : null}
    </View>
  );

  return (
    <Screen
      title="Planning"
      subtitle={monthLabel}
      actions={actions}
      refreshing={planning.isRefetching}
      onRefresh={() => void planning.refetch()}
      maxWidth={isWide ? 1400 : undefined}
      testID="planning"
    >
      <View
        style={{
          flexDirection: isWide ? "row" : "column",
          gap: 12,
          alignItems: isWide ? "center" : "stretch",
          justifyContent: "space-between",
        }}
      >
        {readAll ? (
          <View style={{ minWidth: isWide ? 320 : undefined }}>
            <Segmented
              options={[
                { value: "all", label: "Toute l'équipe" },
                { value: "mine", label: "Mon planning" },
              ]}
              value={scope}
              onChange={setScope}
            />
          </View>
        ) : null}
        {weekNav}
      </View>

      {isWide ? (
        <WeekBoard days={days} today={today} byDay={byDay} loading={planning.isPending} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="tablist">
            {days.map((day, i) => {
              const active = day === selected;
              const isToday = day === today;
              const count = byDay.get(day)?.filter((m) => m.status !== "CANCELLED").length ?? 0;
              return (
                <PressableScale
                  key={day}
                  onPress={() => setSelected(day)}
                  haptic="selection"
                  scaleTo={0.94}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${formatDayLong(day, { year: false })}${count ? `, ${count} mission${count > 1 ? "s" : ""}` : ""}`}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    gap: 4,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.accentFill : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.accentFill : isToday ? colors.accent : colors.border,
                  }}
                >
                  <Text variant="caption" style={{ color: active ? colors.onAccent : colors.textTertiary }}>
                    {WEEKDAYS_SHORT[i]}
                  </Text>
                  <Text variant="headline" tabular style={{ color: active ? colors.onAccent : isToday ? colors.accentText : colors.text }}>
                    {Number(day.slice(8))}
                  </Text>
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: count ? (active ? colors.onAccent : colors.spark) : "transparent",
                    }}
                  />
                </PressableScale>
              );
            })}
          </View>
          <Text variant="title3" accessibilityRole="header">
            {selected === today
              ? "Aujourd'hui"
              : selected === addDays(today, 1)
                ? "Demain"
                : capitalize(formatDayLong(selected, { year: false }))}
          </Text>
          {planning.isPending ? (
            <SkeletonList rows={3} />
          ) : planning.isError && !planning.data ? (
            <ErrorState error={planning.error} onRetry={() => void planning.refetch()} />
          ) : (byDay.get(selected) ?? []).length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarX2}
                title="Aucune mission ce jour-là"
                message={
                  can("planning.manage")
                    ? "Ajoutez une mission, ou dites à l'assistant : « planifie une mission ici demain à 8 h »."
                    : undefined
                }
                actionLabel={can("planning.manage") ? "Ajouter une mission" : undefined}
                onAction={() => router.push(`/planning/nouvelle?date=${selected}`)}
              />
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {(byDay.get(selected) ?? []).map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Vue semaine sur grand écran : une colonne par jour. */
function WeekBoard({ days, today, byDay, loading }: { days: string[]; today: string; byDay: Map<string, MissionDto[]>; loading: boolean }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  // Largeur des colonnes calculée : un texte long ne doit jamais élargir la semaine au-delà de l'écran.
  const [available, setAvailable] = useState(0);
  const columnWidth = available ? Math.max(124, Math.floor((available - 60) / 7)) : 124;
  return (
    <View onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {days.map((day, i) => {
            const isToday = day === today;
            const missions = byDay.get(day) ?? [];
            return (
              <View key={day} style={{ width: columnWidth, gap: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 4,
                    paddingBottom: 6,
                    borderBottomWidth: 2,
                    borderBottomColor: isToday ? colors.accent : colors.border,
                  }}
                  accessibilityRole="header"
                >
                  <Text variant="caption" tone={isToday ? "accent" : "tertiary"} uppercase>
                    {WEEKDAYS_SHORT[i]}
                  </Text>
                  <Text variant="title3" tabular style={{ color: isToday ? colors.accentText : colors.text }}>
                    {Number(day.slice(8))}
                  </Text>
                </View>
                {loading ? (
                  <View style={{ height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }} />
                ) : missions.length === 0 ? (
                  <Text variant="footnote" tone="tertiary" style={{ paddingHorizontal: 4 }}>
                    —
                  </Text>
                ) : (
                  missions.map((m) => {
                    const cancelled = m.status === "CANCELLED";
                    const bar = {
                      PLANNED: colors.accent,
                      IN_PROGRESS: colors.spark,
                      DONE: colors.success,
                      VALIDATED: colors.success,
                      CANCELLED: colors.borderStrong,
                    }[m.status];
                    return (
                      <PressableScale
                        key={m.id}
                        onPress={() => router.push(`/planning/${m.id}`)}
                        scaleTo={0.98}
                        accessibilityLabel={`${m.title}, de ${m.startTime} à ${m.endTime}${m.site ? `, ${m.site.name}` : ""}`}
                        style={{
                          padding: 10,
                          gap: 6,
                          borderRadius: radius.md,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderLeftWidth: 3,
                          borderLeftColor: bar,
                          opacity: cancelled ? 0.6 : 1,
                        }}
                        pressedStyle={{ backgroundColor: colors.surfacePressed }}
                      >
                        <Text variant="caption" tone="secondary" tabular>
                          {m.startTime} – {m.endTime}
                        </Text>
                        <Text
                          variant="subhead"
                          weight="semibold"
                          numberOfLines={2}
                          style={cancelled ? { textDecorationLine: "line-through" } : undefined}
                        >
                          {m.title}
                        </Text>
                        {m.site ? (
                          <Text variant="caption" tone="tertiary" numberOfLines={1}>
                            {m.site.name}
                          </Text>
                        ) : null}
                        {m.assignees.length ? <AvatarStack people={m.assignees} size={22} max={3} /> : null}
                      </PressableScale>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
