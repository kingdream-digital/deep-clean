import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";
import { PressableScale } from "./PressableScale";
import { StatusBadge } from "./StatusBadge";
import { AssigneeAvatar } from "./AssigneeAvatar";
import type { Mission, MissionAssignee } from "../api/missions.api";
import { formatMissionDay, formatMissionTimeRange } from "../utils/missionFormat";

interface MissionCardProps {
  mission: Mission;
  onPress: () => void;
}

const STATUS_BAR_COLOR: Record<Mission["status"], (c: ReturnType<typeof useTheme>["colors"]) => string> = {
  SCHEDULED: (c) => c.accent,
  IN_PROGRESS: (c) => c.warning,
  COMPLETED: (c) => c.success,
  CANCELLED: (c) => c.danger,
};

// Nombre d'assignés affichés avec photo + prénom avant de replier le reste
// dans un simple "+N" — au-delà, la carte deviendrait illisible (retour
// explicite du client : voir d'un coup d'œil qui est sur la mission, pas
// une liste exhaustive).
const MAX_VISIBLE_ASSIGNEES = 4;

function AssigneesRow({ assignments }: { assignments: MissionAssignee[] }) {
  const theme = useTheme();
  const { colors, spacing, type } = theme;
  if (assignments.length === 0) return null;

  const visible = assignments.slice(0, MAX_VISIBLE_ASSIGNEES);
  const overflow = assignments.length - visible.length;
  const avatarSize = 20;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.sm }}>
      {visible.map((assignee) => (
        <View
          key={assignee.userId}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginRight: spacing.sm,
            marginTop: spacing.xxs,
          }}
        >
          <AssigneeAvatar assignee={assignee} size={avatarSize} />
          <Text style={[type.caption, { color: colors.inkSecondary, marginLeft: 4 }]} numberOfLines={1}>
            {assignee.user.firstName}
          </Text>
        </View>
      ))}
      {overflow > 0 && (
        <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>+{overflow}</Text>
      )}
    </View>
  );
}

export function MissionCard({ mission, onPress }: MissionCardProps) {
  const theme = useTheme();
  const { colors, radius, spacing, type } = theme;

  return (
    <PressableScale onPress={onPress}>
      <Card style={{ paddingLeft: spacing.lg + 6 }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            borderTopLeftRadius: radius.lg,
            borderBottomLeftRadius: radius.lg,
            backgroundColor: STATUS_BAR_COLOR[mission.status](colors),
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
              {mission.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xxs }}>
              <Ionicons name="location-outline" size={14} color={colors.inkTertiary} />
              <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]} numberOfLines={1}>
                {mission.site.name}
              </Text>
            </View>
          </View>
          <StatusBadge status={mission.status} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
          <Ionicons name="calendar-outline" size={14} color={colors.inkTertiary} />
          <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]} numberOfLines={1}>
            {formatMissionDay(mission.date)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xxs }}>
          <Ionicons name="time-outline" size={14} color={colors.inkTertiary} />
          <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]}>
            {formatMissionTimeRange(mission.startTime, mission.endTime)}
          </Text>
        </View>

        <AssigneesRow assignments={mission.assignments} />
      </Card>
    </PressableScale>
  );
}
