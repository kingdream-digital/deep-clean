import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";
import { PressableScale } from "./PressableScale";
import { StatusBadge } from "./StatusBadge";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { PulsingDot } from "./PulsingDot";
import type { Mission, MissionAssignee } from "../api/missions.api";
import { formatMissionDay, formatMissionTimeRange, isMissionOverdue, relativeDayLabel } from "../utils/missionFormat";

interface MissionCardProps {
  mission: Mission;
  onPress: () => void;
}

// Icône + teinte pastel par statut : identifie la mission d'un coup d'œil,
// même sans lire le badge texte — cohérent avec la palette pastel déjà
// utilisée pour les puces de statut du Planning (MISSION_SOFT_BG/TEXT).
const STATUS_ICON: Record<Mission["status"], keyof typeof Ionicons.glyphMap> = {
  SCHEDULED: "calendar-outline",
  IN_PROGRESS: "play",
  COMPLETED: "checkmark",
  CANCELLED: "close",
};

const STATUS_TINT: Record<Mission["status"], (c: ReturnType<typeof useTheme>["colors"]) => { bg: string; fg: string }> = {
  SCHEDULED: (c) => ({ bg: c.accentSoft, fg: c.accent }),
  IN_PROGRESS: (c) => ({ bg: c.warningSoft, fg: c.warning }),
  COMPLETED: (c) => ({ bg: c.successSoft, fg: c.success }),
  CANCELLED: (c) => ({ bg: c.dangerSoft, fg: c.danger }),
};

// Nombre d'assignés affichés avec photo + prénom avant de replier le reste
// dans un simple "+N" — au-delà, la carte deviendrait illisible (retour
// explicite du client : voir d'un coup d'œil qui est sur la mission, pas
// une liste exhaustive).
const MAX_VISIBLE_ASSIGNEES = 4;

function AssigneesRow({ assignments }: { assignments: MissionAssignee[] }) {
  const theme = useTheme();
  const { colors, spacing, type, isDark } = theme;
  if (assignments.length === 0) return null;

  const visible = assignments.slice(0, MAX_VISIBLE_ASSIGNEES);
  const overflow = assignments.length - visible.length;
  const avatarSize = 26;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
      {/* Avatars imbriqués (léger chevauchement + liseré de la couleur de la
          carte) : rendu "groupe d'équipe" plus premium qu'une simple liste. */}
      <View style={{ flexDirection: "row" }}>
        {visible.map((assignee, index) => (
          <View
            key={assignee.userId}
            style={{
              marginLeft: index === 0 ? 0 : -8,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: colors.backgroundElevated,
              zIndex: visible.length - index,
            }}
          >
            <AssigneeAvatar assignee={assignee} size={avatarSize} />
          </View>
        ))}
        {overflow > 0 && (
          <View
            style={{
              marginLeft: -8,
              width: avatarSize,
              height: avatarSize,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: colors.backgroundElevated,
              backgroundColor: isDark ? colors.surfaceAlt : colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[type.caption, { color: colors.inkSecondary, fontWeight: "700" }]}>+{overflow}</Text>
          </View>
        )}
      </View>
      <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: spacing.sm, flexShrink: 1 }]} numberOfLines={1}>
        {assignments.length} {assignments.length > 1 ? "personnes" : "personne"}
      </Text>
    </View>
  );
}

export function MissionCard({ mission, onPress }: MissionCardProps) {
  const theme = useTheme();
  const { colors, radius, spacing, type, isDark } = theme;
  // Horaire passé sans démarrage : toute la carte passe en teinte d'alerte
  // (icône, jour, badge), comme sur l'accueil — une même mission ne doit pas
  // se lire « non démarrée » à un endroit et « planifiée » à un autre.
  const overdue = isMissionOverdue(mission);
  const tint = overdue ? { bg: colors.warningSoft, fg: colors.warning } : STATUS_TINT[mission.status](colors);
  const icon = overdue ? "alert-circle-outline" : STATUS_ICON[mission.status];
  const dayLabel = relativeDayLabel(mission.date);
  const isLive = mission.status === "IN_PROGRESS";

  return (
    <PressableScale onPress={onPress}>
      <Card
        style={{
          borderColor: isLive ? tint.fg + "55" : colors.border,
          shadowColor: isLive ? tint.fg : colors.shadow,
          shadowOpacity: isLive ? (isDark ? 0.22 : 0.28) : 0.5,
          shadowRadius: isLive ? 14 : 8,
          elevation: isLive ? 4 : 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {/* Badge icône statut : identifie la mission sans lire de texte,
              avec un halo pulsant discret pour une mission en cours. */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: tint.bg,
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing.md,
            }}
          >
            {isLive && (
              <PulsingDot
                color={tint.fg}
                size={44}
                style={{ position: "absolute", borderRadius: radius.md, opacity: 0.18 }}
              />
            )}
            <Ionicons name={icon} size={18} color={tint.fg} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                {/* Deux lignes : un intitulé de mission réel ("Désinfection
                    des salles de consultation") tient rarement sur une seule,
                    et s'affichait coupé en "Désinfection salles de c…" alors
                    que la place existe juste en dessous. */}
                <Text style={[type.headline, { color: colors.ink }]} numberOfLines={2}>
                  {mission.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                  <Ionicons name="location-outline" size={13} color={colors.inkTertiary} />
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]} numberOfLines={1}>
                    {mission.site.name}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: spacing.sm }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: isDark ? colors.surfaceAlt : colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  marginRight: spacing.xs,
                  marginTop: spacing.xxs,
                }}
              >
                <Ionicons name="calendar-outline" size={12} color={dayLabel ? tint.fg : colors.inkTertiary} />
                <Text
                  style={[
                    type.caption,
                    { color: dayLabel ? tint.fg : colors.inkSecondary, marginLeft: 4, fontWeight: dayLabel ? "700" : "400" },
                  ]}
                  numberOfLines={1}
                >
                  {dayLabel ?? formatMissionDay(mission.date)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: isDark ? colors.surfaceAlt : colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  marginTop: spacing.xxs,
                }}
              >
                <Ionicons name="time-outline" size={12} color={colors.inkTertiary} />
                <Text style={[type.caption, { color: colors.inkSecondary, marginLeft: 4 }]}>
                  {formatMissionTimeRange(mission.startTime, mission.endTime)}
                </Text>
              </View>
            </View>

            {/* Le badge passe à la ligne, calé à droite, quand il ne tient pas
                à côté de l'équipe (« NON DÉMARRÉE », ou quatre avatars) — il
                débordait de la carte et chevauchait « N personnes ». */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: spacing.md,
                // Écart minimal seulement : un écart plus large faisait passer
                // à la ligne des badges qui tenaient très bien à côté.
                columnGap: spacing.xxs,
                rowGap: spacing.xs,
              }}
            >
              <AssigneesRow assignments={mission.assignments} />
              <View style={{ marginLeft: "auto" }}>
                <StatusBadge status={mission.status} overdue={overdue} />
              </View>
            </View>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}
