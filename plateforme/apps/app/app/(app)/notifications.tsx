import { View } from "react-native";
import { useRouter } from "expo-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CalendarClock, CalendarX2, ClipboardList, MapPinned } from "lucide-react-native";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react-native";
import type { NotificationDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { timeAgo } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, EmptyState, ErrorState, PressableScale, Screen, SkeletonList, Text } from "@/ui";

const ICONS: Record<string, ComponentType<LucideProps>> = {
  MISSION_ASSIGNED: CalendarClock,
  MISSION_RESCHEDULED: CalendarClock,
  MISSION_MOVED: MapPinned,
  MISSION_CANCELLED: CalendarX2,
  MISSION_INSTRUCTIONS: ClipboardList,
  MISSION_UNASSIGNED: CalendarX2,
};

/** Centre de notifications : non lues en tête de liste, toucher pour ouvrir l'élément concerné. */
export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const timezone = useOrgTimezone();
  const list = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) => endpoints.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  const markRead = useMutation({
    mutationFn: (ids: string[] | "all") => endpoints.notifications.markRead(ids),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const open = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) router.push(n.link as never);
  };

  return (
    <Screen
      title="Notifications"
      subtitle={unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Vous êtes à jour"}
      actions={
        unread ? (
          <Button
            label="Tout marquer lu"
            variant="ghost"
            size="sm"
            onPress={() => markRead.mutate("all")}
            loading={markRead.isPending}
            testID="notifications-read-all"
          />
        ) : undefined
      }
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      maxWidth={760}
      testID="notifications"
    >
      {list.isPending ? (
        <SkeletonList rows={5} />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellOff}
            title="Aucune notification"
            message="Vous serez prévenu ici d'une nouvelle mission, d'un changement d'horaire ou d'une consigne."
          />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onPress={() => open(n)} timezone={timezone} />
          ))}
        </View>
      )}
      {list.hasNextPage ? (
        <Button
          label="Afficher plus"
          variant="secondary"
          loading={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
          style={{ alignSelf: "center" }}
        />
      ) : null}
    </Screen>
  );
}

function NotificationRow({ notification: n, onPress, timezone }: { notification: NotificationDto; onPress: () => void; timezone: string }) {
  const { colors, radius } = useTheme();
  const Icon = ICONS[n.type] ?? Bell;
  const unread = !n.readAt;
  const danger = n.type === "MISSION_CANCELLED" || n.type === "MISSION_UNASSIGNED";
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityLabel={`${unread ? "Non lue. " : ""}${n.title} ${n.body}, ${timeAgo(n.createdAt, timezone)}`}
      style={{
        flexDirection: "row",
        gap: 12,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: unread ? colors.surface : "transparent",
        borderWidth: 1,
        borderColor: unread ? colors.border : "transparent",
      }}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: danger ? colors.dangerSoft : colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={19} color={danger ? colors.danger : colors.accentText} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text variant="callout" weight={unread ? "semibold" : "medium"} style={{ flex: 1 }}>
            {n.title}
          </Text>
          <Text variant="caption" tone="tertiary">
            {timeAgo(n.createdAt, timezone)}
          </Text>
        </View>
        <Text variant="subhead" tone="secondary" numberOfLines={3}>
          {n.body}
        </Text>
      </View>
      {unread ? (
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.spark, marginTop: 6 }} accessibilityElementsHidden />
      ) : null}
    </PressableScale>
  );
}
