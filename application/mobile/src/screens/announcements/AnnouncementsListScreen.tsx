import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { announcementCoverPhotoUrl, listAnnouncements } from "../../api/announcements.api";
import type { Announcement } from "../../api/announcements.api";
import { timeAgo } from "../../utils/timeAgo";
import type { Role } from "../../api/auth.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Direction",
  ADMIN: "Administration",
};

// Retour explicite du client : RH, superviseur, direction et admin peuvent
// publier — jamais un employé ni un chef d'équipe (même liste que
// backend/src/modules/announcements/announcements.service.ts::ANNOUNCEMENT_AUTHOR_ROLES,
// revérifiée de toute façon côté serveur : ceci ne fait qu'afficher ou non le bouton).
const CAN_POST_ROLES: Role[] = ["HR", "SUPERVISOR", "DIRECTOR", "ADMIN"];

const initialsOf = (firstName: string, lastName: string) => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

export function AnnouncementsListScreen() {
  const { colors, spacing, radius, type, isDark } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [items, setItems] = useState<Announcement[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listAnnouncements();
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const canPost = !!user && CAN_POST_ROLES.includes(user.role);

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="megaphone-outline" message="Aucune actualité pour le moment." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("AnnouncementDetail", { announcementId: item.id })}>
                {/* Seule la plus récente porte le glow — carte prioritaire de l'écran. */}
                <Card glow={index === 0} padded={false}>
                  {item.hasCoverPhoto && (
                    <AuthenticatedImage
                      uri={announcementCoverPhotoUrl(item.id)}
                      style={{ width: "100%", height: 160, backgroundColor: colors.surfaceAlt }}
                    />
                  )}
                  <View style={{ padding: spacing.lg }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: radius.pill,
                        backgroundColor: colors.purpleSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[type.caption, { color: colors.purple, fontWeight: "700" }]}>
                        {initialsOf(item.author.firstName, item.author.lastName)}
                      </Text>
                    </View>
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                          {item.author.firstName} {item.author.lastName}
                        </Text>
                        <View
                          style={{
                            marginLeft: spacing.xs,
                            backgroundColor: colors.purpleSoft,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={[type.caption, { color: colors.purple }]}>{ROLE_LABELS[item.author.role]}</Text>
                        </View>
                      </View>
                      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
                        {timeAgo(item.createdAt)} · toute l'entreprise
                      </Text>
                    </View>
                  </View>
                  <Text style={[type.headline, { color: colors.ink, marginTop: spacing.md }]}>{item.title}</Text>
                  <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.xs }]} numberOfLines={4}>
                    {item.body}
                  </Text>
                  </View>
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}

      {canPost && (
        <PressableScale
          onPress={() => navigation.navigate("AnnouncementForm")}
          style={{
            position: "absolute",
            right: spacing.lg,
            bottom: spacing.lg,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accentDeep,
            alignItems: "center",
            justifyContent: "center",
            // Halo atténué en mode sombre (retour explicite du client) —
            // voir Button.tsx/Card.tsx pour le même ajustement.
            shadowColor: colors.accentBright,
            shadowOpacity: isDark ? 0.18 : 0.4,
            shadowRadius: isDark ? 9 : 14,
            shadowOffset: { width: 0, height: isDark ? 3 : 6 },
            elevation: isDark ? 3 : 6,
          }}
        >
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </PressableScale>
      )}
    </ScreenContainer>
  );
}
