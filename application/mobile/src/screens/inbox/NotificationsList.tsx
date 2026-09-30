import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { OfflineBanner } from "../../components/OfflineBanner";
import { PressableScale } from "../../components/PressableScale";
import { PulsingDot } from "../../components/PulsingDot";
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

  async function handleMarkAllAsRead() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllNotificationsAsRead();
    } catch {
      await load();
    }
  }

  async function handleOpenRelatedEntity(notification: AppNotification) {
    if (!notification.relatedEntityId) return;
    void handleMarkAsRead(notification);
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
      // relatedEntityId porte l'identifiant de l'expéditeur (pas du message) —
      // voir messages.service.ts::sendMessage.
      navigation.navigate("ConversationThread", { userId: notification.relatedEntityId });
    }
  }

  const hasUnread = items.some((n) => !n.isRead);

  if (state === "loading") return <StateView kind="loading" />;
  if (state === "error") return <StateView kind="error" onRetry={load} />;
  if (items.length === 0) {
    return <StateView kind="empty" icon="notifications-outline" message="Vous n'avez aucune notification." />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      ListHeaderComponent={
        <>
          {offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}
          {hasUnread && (
            <Pressable onPress={handleMarkAllAsRead} style={{ alignSelf: "flex-end", marginBottom: spacing.sm }}>
              <Text style={[type.subhead, { color: colors.accent }]}>Tout marquer comme lu</Text>
            </Pressable>
          )}
        </>
      }
      renderItem={({ item, index }) => {
        const hasRelatedEntity =
          !!item.relatedEntityId &&
          (item.relatedEntityType === "Mission" ||
            item.relatedEntityType === "TimeEntry" ||
            item.relatedEntityType === "Problem" ||
            item.relatedEntityType === "Absence" ||
            item.relatedEntityType === "Announcement" ||
            item.relatedEntityType === "Conversation");
        const relatedEntityLabel =
          item.relatedEntityType === "TimeEntry"
            ? "Voir le pointage"
            : item.relatedEntityType === "Problem"
              ? "Voir le signalement"
              : item.relatedEntityType === "Announcement"
                ? "Voir l'actualité"
                : item.relatedEntityType === "Conversation"
                  ? "Voir le message"
                  : item.relatedEntityType === "Absence"
                    ? item.type === "ABSENCE_REQUESTED"
                      ? "Voir la fiche employé"
                      : "Voir mes absences"
                    : "Voir la mission";
        return (
          <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
            <SwipeableRow onDelete={() => handleDelete(item)}>
            <Card padded={false} style={{ backgroundColor: item.isRead ? colors.background : colors.accentSoft }}>
              <PressableScale onPress={() => handleMarkAsRead(item)}>
                <View style={{ padding: spacing.md }}>
                  <View style={styles.row}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: radius.md,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: spacing.sm,
                      }}
                    >
                      <Ionicons name={NOTIFICATION_TYPE_ICON[item.type]} size={16} color={colors.accent} />
                    </View>
                    <Text style={[type.headline, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {!item.isRead && <PulsingDot color={colors.accent} style={styles.dot} />}
                  </View>
                  <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.xs }]}>{item.body}</Text>
                  <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </PressableScale>

              {hasRelatedEntity && (
                <PressableScale onPress={() => void handleOpenRelatedEntity(item)}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: spacing.sm,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={[type.callout, { color: colors.accent, fontWeight: "600" }]}>{relatedEntityLabel}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.accent} style={{ marginLeft: 4 }} />
                  </View>
                </PressableScale>
              )}
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
  dot: { marginLeft: 8 },
});
