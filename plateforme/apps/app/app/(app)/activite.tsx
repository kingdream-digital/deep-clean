import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react-native";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { timeAgo } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, EmptyState, ErrorState, Screen, SkeletonList, Text } from "@/ui";

/** Journal d'activité : actions importantes, avec leur auteur et l'heure (non modifiable, côté serveur). */
export default function ActivityScreen() {
  const { colors } = useTheme();
  const timezone = useOrgTimezone();
  const { can } = useAuth();
  const activity = useQuery({ queryKey: ["activity"], queryFn: endpoints.activity, enabled: can("activity.read") });

  if (!can("activity.read")) {
    return (
      <Screen title="Activité">
        <EmptyState title="Accès réservé" message="Le journal d'activité est réservé à la direction et à la RH." />
      </Screen>
    );
  }
  return (
    <Screen
      title="Activité"
      subtitle="Les 50 dernières actions de l'entreprise"
      refreshing={activity.isRefetching}
      onRefresh={() => void activity.refetch()}
      maxWidth={760}
      testID="activity"
    >
      {activity.isPending ? (
        <SkeletonList rows={6} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : activity.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="Aucune activité pour l'instant" />
        </Card>
      ) : (
        <Card padding={0}>
          {activity.data.items.map((a, index) => (
            <View
              key={a.id}
              style={{
                flexDirection: "row",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout">{a.label}</Text>
                <Text variant="footnote" tone="secondary">
                  {a.actor?.name ?? "Système"} · {timeAgo(a.createdAt, timezone)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
