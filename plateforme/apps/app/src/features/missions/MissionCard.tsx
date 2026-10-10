import { Linking, Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { MapPin, Navigation } from "lucide-react-native";
import type { MissionDto } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { AvatarStack, Card, PressableScale, Text } from "@/ui";
import { MissionStatusBadge } from "@/features/status";

/** Ouvre l'itinéraire vers une adresse dans l'application de cartes de l'appareil. */
export function openDirections(address: string): void {
  const q = encodeURIComponent(address);
  const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  void Linking.openURL(url);
}

/** Carte d'une mission : horaires en colonne, lieu, équipe, statut. Toucher : détail. */
export function MissionCard({ mission, showDate }: { mission: MissionDto; showDate?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const bar = {
    PLANNED: colors.accent,
    IN_PROGRESS: colors.spark,
    DONE: colors.success,
    VALIDATED: colors.success,
    CANCELLED: colors.borderStrong,
  }[mission.status];
  const cancelled = mission.status === "CANCELLED";
  return (
    <Card
      onPress={() => router.push(`/planning/${mission.id}`)}
      padding={0}
      accessibilityLabel={`${mission.title}, ${showDate ? `${showDate}, ` : ""}de ${mission.startTime} à ${mission.endTime}${mission.site ? `, ${mission.site.name}` : ""}`}
      testID={`mission-${mission.id}`}
    >
      <View style={{ flexDirection: "row", padding: 14, gap: 14 }}>
        <View style={{ width: 52, alignItems: "flex-start", gap: 2 }}>
          {showDate ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {showDate}
            </Text>
          ) : null}
          <Text variant="headline" tabular style={cancelled ? { textDecorationLine: "line-through", color: colors.textTertiary } : undefined}>
            {mission.startTime}
          </Text>
          <Text variant="footnote" tone="tertiary" tabular>
            {mission.endTime}
          </Text>
        </View>
        <View style={{ width: 3, borderRadius: 2, backgroundColor: bar }} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text variant="headline" style={{ flex: 1 }} numberOfLines={2} tone={cancelled ? "tertiary" : "primary"}>
              {mission.title}
            </Text>
            {mission.status !== "PLANNED" ? <MissionStatusBadge status={mission.status} /> : null}
          </View>
          {mission.site ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MapPin size={14} color={colors.textTertiary} />
              <Text variant="subhead" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {mission.site.name}
                {mission.site.address ? ` · ${mission.site.address}` : ""}
              </Text>
            </View>
          ) : mission.client ? (
            <Text variant="subhead" tone="secondary" numberOfLines={1}>
              {mission.client.name}
            </Text>
          ) : null}
          {mission.assignees.length ? <AvatarStack people={mission.assignees} size={26} /> : null}
        </View>
      </View>
    </Card>
  );
}

/** Bouton « Itinéraire » (vers l'application de cartes). */
export function DirectionsButton({ address }: { address: string }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      onPress={() => openDirections(address)}
      accessibilityLabel={`Itinéraire vers ${address}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}
    >
      <Navigation size={15} color={colors.accentText} />
      <Text variant="subhead" weight="semibold" tone="accent">
        Itinéraire
      </Text>
    </PressableScale>
  );
}
