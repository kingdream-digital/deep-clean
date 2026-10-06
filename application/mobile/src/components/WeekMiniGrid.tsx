import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { useResponsive } from "../hooks/useResponsive";
import { siteColor } from "../utils/siteColor";
import type { Mission } from "../api/missions.api";
import { WEEKDAY_LABELS, addDays, isSameLocalDay, toLocalDateKey } from "../utils/missionFormat";

interface WeekMiniGridProps {
  weekStart: Date;
  missions: Mission[];
  onPressDay?: (day: Date) => void;
}

// Aperçu de la semaine (lundi → dimanche) directement sur le tableau de bord —
// jusqu'à 2 chantiers visibles par jour, colorés par chantier (voir
// utils/siteColor.ts) pour repérer d'un coup d'œil "qui va où" sans ouvrir
// l'onglet Planning.
//
// Sur téléphone, une case fait une quarantaine de pixels de large : le nom
// du chantier s'y réduisait à « Cow… » ou « Clini… », en 9 px — illisible.
// On y montre donc une pastille par mission, à la couleur de son chantier,
// comme les points d'un calendrier ; le détail est à un toucher, dans le
// Planning. Les noms restent affichés là où la case est assez large.
const COMPACT_MAX_WIDTH = 600;
const MAX_DOTS = 3;

export function WeekMiniGrid({ weekStart, missions, onPressDay }: WeekMiniGridProps) {
  const { colors, spacing, radius, type } = useTheme();
  const { width } = useResponsive();
  const compact = width < COMPACT_MAX_WIDTH;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const byDay = new Map<string, Mission[]>();
  for (const mission of missions) {
    const key = mission.date.slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(mission);
    byDay.set(key, list);
  }

  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {days.map((day, index) => {
        const key = toLocalDateKey(day);
        const dayMissions = byDay.get(key) ?? [];
        const isToday = isSameLocalDay(day, today);
        return (
          <PressableScale key={key} style={{ flex: 1 }} onPress={() => onPressDay?.(day)}>
            <View
              style={{
                borderRadius: radius.sm,
                backgroundColor: isToday ? colors.accentSoft : colors.surface,
                borderWidth: 1,
                borderColor: isToday ? colors.accentDeep : colors.border,
                paddingVertical: spacing.xs,
                paddingHorizontal: 4,
                minHeight: compact ? 72 : 84,
              }}
            >
              <Text
                style={[
                  type.caption,
                  { color: isToday ? colors.accentText : colors.inkTertiary, textAlign: "center", fontWeight: "700" },
                ]}
              >
                {WEEKDAY_LABELS[index]}
              </Text>
              <Text
                style={[
                  type.footnote,
                  { color: isToday ? colors.accentText : colors.ink, textAlign: "center", fontWeight: "700", marginBottom: 4 },
                ]}
              >
                {day.getDate()}
              </Text>
              {compact && dayMissions.length > 0 && (
                <View
                  style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 3, marginTop: 4 }}
                  accessibilityLabel={`${dayMissions.length} ${dayMissions.length > 1 ? "missions" : "mission"}`}
                >
                  {dayMissions.slice(0, MAX_DOTS).map((mission) => (
                    <View
                      key={mission.id}
                      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: siteColor(mission.site.id, colors).fg }}
                    />
                  ))}
                </View>
              )}
              {compact && dayMissions.length > MAX_DOTS && (
                <Text style={[type.caption, { color: colors.inkTertiary, textAlign: "center", marginTop: 3 }]}>
                  +{dayMissions.length - MAX_DOTS}
                </Text>
              )}
              {!compact && dayMissions.slice(0, 2).map((mission) => {
                const tone = siteColor(mission.site.id, colors);
                return (
                  <View
                    key={mission.id}
                    style={{
                      backgroundColor: tone.bg,
                      borderRadius: 6,
                      paddingVertical: 2,
                      paddingHorizontal: 4,
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ color: tone.fg, fontSize: 9, fontWeight: "700" }} numberOfLines={1}>
                      {mission.site.name}
                    </Text>
                  </View>
                );
              })}
              {!compact && dayMissions.length > 2 && (
                <Text style={[type.caption, { color: colors.inkTertiary, textAlign: "center", marginTop: 2, fontSize: 9 }]}>
                  +{dayMissions.length - 2}
                </Text>
              )}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
