import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { useTheme } from "../../theme/ThemeProvider";
import { getAnnouncement } from "../../api/announcements.api";
import type { Announcement } from "../../api/announcements.api";
import type { Role } from "../../api/auth.api";

type Route = RouteProp<{ AnnouncementDetail: { announcementId: string } }, "AnnouncementDetail">;

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Direction",
  ADMIN: "Administration",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function AnnouncementDetailScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const route = useRoute<Route>();
  const { announcementId } = route.params;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      const data = await getAnnouncement(announcementId);
      setAnnouncement(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [announcementId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") return <ScreenContainer><StateView kind="loading" /></ScreenContainer>;
  if (state === "error" || !announcement) return <ScreenContainer><StateView kind="error" onRetry={load} /></ScreenContainer>;

  const initials = `${announcement.author.firstName[0] ?? ""}${announcement.author.lastName[0] ?? ""}`.toUpperCase();

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card glow>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: radius.pill,
                backgroundColor: colors.purpleSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[type.callout, { color: colors.purple, fontWeight: "700" }]}>{initials}</Text>
            </View>
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[type.headline, { color: colors.ink }]}>
                  {announcement.author.firstName} {announcement.author.lastName}
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
                  <Text style={[type.caption, { color: colors.purple }]}>{ROLE_LABELS[announcement.author.role]}</Text>
                </View>
              </View>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
                {dateFmt.format(new Date(announcement.createdAt))} · toute l'entreprise
              </Text>
            </View>
          </View>

          <Text style={[type.title2, { color: colors.ink, marginTop: spacing.lg }]}>{announcement.title}</Text>
          <Text style={[type.body, { color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 24 }]}>
            {announcement.body}
          </Text>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
