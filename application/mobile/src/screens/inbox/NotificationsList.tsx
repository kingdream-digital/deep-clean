import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { OfflineBanner } from "../../components/OfflineBanner";
import { PressableScale } from "../../components/PressableScale";
import { SwipeableRow } from "../../components/SwipeableRow";
import { useTheme } from "../../theme/ThemeProvider";
import { Alert } from "../../utils/alert";
import { extractErrorMessage } from "../../api/client";
import {
  AppNotification,
  deleteNotification,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../../api/notifications.api";
import { getAbsence } from "../../api/absences.api";
import { readCache, writeCache } from "../../offline/cache";
import { timeAgo } from "../../utils/timeAgo";
import { NOTIFICATION_TYPE_ICON } from "../../utils/notificationIcons";
import type { InboxStackParamList } from "../../navigation/InboxStack";

const CACHE_KEY = "notifications.list";

type LoadState = "loading" | "ready" | "error";

const RELATED_ENTITY_TYPES = new Set(["Mission", "TimeEntry", "Problem", "Absence", "Announcement", "Conversation"]);

// Regroupement par jour façon Centre de notifications iOS ("Aujourd'hui",
// "Hier"...) — les éléments arrivent déjà triés du plus récent au plus ancien
// (voir notifications.service.ts::listNotifications), l'ordre à l'intérieur
// de chaque section est donc préservé tel quel.
function sectionTitleFor(iso: string): string {
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const diffDays = Math.round((startOfDay(new Date()).getTime() - startOfDay(new Date(iso)).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays <= 6) return "Cette semaine";
  return "Plus ancien";
}

const SECTION_ORDER = ["Aujourd'hui", "Hier", "Cette semaine", "Plus ancien"];

function groupByDate(items: AppNotification[]): { title: string; data: AppNotification[] }[] {
  const buckets = new Map<string, AppNotification[]>();
  for (const item of items) {
    const key = sectionTitleFor(item.createdAt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return SECTION_ORDER.filter((title) => buckets.has(title)).map((title) => ({ title, data: buckets.get(title)! }));
}

// Contenu de l'onglet "Notifications" du segment Messagerie — extrait de
// l'ancien écran plein pour pouvoir cohabiter avec "Messages" sous le même
// contrôle segmenté (voir InboxHomeScreen), sans dupliquer la logique.
export function NotificationsList() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listNotifications();
      setItems(res.items);
      setOfflineCachedAt(null);
      setState("ready");
      void writeCache(CACHE_KEY, res.items);
    } catch {
      const net = await NetInfo.fetch();
      const cached = net.isConnected === false ? await readCache<AppNotification[]>(CACHE_KEY) : null;
      if (cached) {
        setItems(cached.data);
        setOfflineCachedAt(cached.cachedAt);
        setState("ready");
      } else {
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleMarkAsRead(notification: AppNotification) {
    if (notification.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
    try {
      await markNotificationAsRead(notification.id);
    } catch (err) {
      void extractErrorMessage(err);
    }
  }

  async function handleMarkAllAsRead() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllNotificationsAsRead();
    } catch {
      await load();
    }
  }

  async function handleDelete(notification: AppNotification) {
    const previous = items;
    setItems((prev) => prev.filter((n) => n.id !== notification.id));
    try {
      await deleteNotification(notification.id);
    } catch (err) {
      setItems(previous);
      Alert.alert("Suppression impossible", extractErrorMessage(err));
    }
  }

  async function handlePress(notification: AppNotification) {
    void handleMarkAsRead(notification);
    if (!notification.relatedEntityId) return;

    if (notification.relatedEntityType === "Mission") {
      navigation.navigate("MissionDetail", { missionId: notification.relatedEntityId });
    } else if (notification.relatedEntityType === "TimeEntry") {
      navigation.navigate("TimeEntryDetail", { entryId: notification.relatedEntityId });
    } else if (notification.relatedEntityType === "Problem") {
      navigation.navigate("ProblemDetail", { problemId: notification.relatedEntityId });
    } else if (notification.relatedEntityType === "Absence") {
      if (notification.type === "ABSENCE_REQUESTED") {
        // Demande à valider (RH/direction/admin) : relatedEntityId est
        // l'absence, pas l'employé — on la récupère pour connaître son
        // auteur, puis on amène directement sur sa fiche pour décider (retour
        // explicite du client : ça basculait à tort sur "Mes absences", les
        // absences de la personne connectée, pas de l'employé concerné).
        try {
          const absence = await getAbsence(notification.relatedEntityId);
          navigation.navigate("UserDetail", { userId: absence.userId });
        } catch (err) {
          Alert.alert("Impossible d'ouvrir la fiche", extractErrorMessage(err));
        }
      } else {
        // ABSENCE_DECIDED : ne cible que l'intéressé, "Mes absences" suffit,
        // l'absence décidée y est visible avec son statut.
        navigation.navigate("MyAbsences");
      }
    } else if (notification.relatedEntityType === "Announcement") {
      navigation.navigate("AnnouncementDetail", { announcementId: notification.relatedEntityId });
    } else if (notification.relatedEntityType === "Conversation") {
      // relatedEntityId porte l'identifiant du FIL de discussion (et non plus
      // de l'expéditeur, qui ne suffirait pas à désigner un groupe) — voir
      // messages.service.ts::notifyUsers.
      navigation.navigate("ConversationThread", { conversationId: notification.relatedEntityId });
    }
  }

  const hasUnread = items.some((n) => !n.isRead);

  if (state === "loading") return <StateView kind="loading" />;
  if (state === "error") return <StateView kind="error" onRetry={load} />;
  if (items.length === 0) {
    return <StateView kind="empty" icon="notifications-outline" message="Vous n'avez aucune notification." />;
  }

  return (
    <SectionList
      sections={groupByDate(items)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      SectionSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      ListHeaderComponent={
        <>
          {offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}
          {hasUnread && (
            <Pressable onPress={handleMarkAllAsRead} style={{ alignSelf: "flex-end", marginBottom: spacing.xs }}>
              <Text style={[type.subhead, { color: colors.accent }]}>Tout marquer comme lu</Text>
            </Pressable>
          )}
        </>
      }
      renderSectionHeader={({ section }) => (
        <Text
          style={[
            type.overline,
            { color: colors.inkTertiary, backgroundColor: colors.background, marginTop: spacing.md, marginBottom: spacing.xs },
          ]}
        >
          {section.title.toUpperCase()}
        </Text>
      )}
      renderItem={({ item, index }) => {
        const hasRelatedEntity = !!item.relatedEntityId && RELATED_ENTITY_TYPES.has(item.relatedEntityType ?? "");

        return (
          <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(240)}>
            <SwipeableRow onDelete={() => handleDelete(item)}>
              <Card padded={false} style={{ backgroundColor: item.isRead ? colors.background : colors.accentSoft }}>
                <PressableScale onPress={() => void handlePress(item)}>
                  <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: radius.md,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={NOTIFICATION_TYPE_ICON[item.type]} size={16} color={colors.accent} />
                    </View>

                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <View style={styles.row}>
                        <Text style={[type.headline, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {!item.isRead && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
                        <Text style={[type.caption, { color: colors.inkTertiary, marginLeft: 6 }]}>
                          {timeAgo(item.createdAt)}
                        </Text>
                      </View>
                      <Text style={[type.callout, { color: colors.inkSecondary, marginTop: 2 }]} numberOfLines={2}>
                        {item.body}
                      </Text>
                    </View>

                    {hasRelatedEntity && (
                      <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} style={{ marginLeft: spacing.xs }} />
                    )}
                  </View>
                </PressableScale>
              </Card>
            </SwipeableRow>
          </Animated.View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
