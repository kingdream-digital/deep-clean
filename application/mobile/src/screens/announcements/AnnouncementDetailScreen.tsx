import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PhotoViewerModal } from "../../components/PhotoViewerModal";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar } from "../../components/Avatar";
import { useAuth } from "../../auth/AuthContext";
import { announcementCoverPhotoUrl, deleteAnnouncement, getAnnouncement } from "../../api/announcements.api";
import type { Announcement } from "../../api/announcements.api";
import type { Role } from "../../api/auth.api";
import { Alert } from "../../utils/alert";
import { extractErrorMessage } from "../../api/client";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<{ AnnouncementDetail: { announcementId: string } }, "AnnouncementDetail">;
type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

// Même liste que ANNOUNCEMENT_DELETE_ROLES côté serveur — la suppression est
// réservée à la RH et à la direction (et l'admin technique), contrairement à
// la publication qui inclut aussi le superviseur. Ceci ne fait qu'afficher ou
// non le bouton, tout est revérifié côté serveur.
const CAN_DELETE_ROLES: Role[] = ["HR", "DIRECTOR", "ADMIN"];

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Direction",
  ADMIN: "Administration",
};

const dateFmt = frenchDateFormat({ weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function AnnouncementDetailScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { announcementId } = route.params;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  function handleDelete() {
    Alert.alert("Supprimer cette actualité ?", "Elle disparaîtra pour tout le monde, définitivement.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAnnouncement(announcementId);
            navigation.goBack();
          } catch (err) {
            Alert.alert("Suppression impossible", extractErrorMessage(err));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  const canDelete = !!user && CAN_DELETE_ROLES.includes(user.role);

  useEffect(() => {
    if (!canDelete) return;
    navigation.setOptions({
      headerRight: () => (
        <PressableScale onPress={handleDelete} disabled={deleting} style={{ padding: spacing.xs }}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </PressableScale>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDelete, deleting, announcementId]);

  if (state === "loading") return <ScreenContainer><StateView kind="loading" /></ScreenContainer>;
  if (state === "error" || !announcement) return <ScreenContainer><StateView kind="error" onRetry={load} /></ScreenContainer>;


  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card glow padded={false}>
          {announcement.hasCoverPhoto && (
            <PressableScale onPress={() => setViewerOpen(true)}>
              <AuthenticatedImage
                uri={announcementCoverPhotoUrl(announcement.id)}
                style={{ width: "100%", height: 220, backgroundColor: colors.surfaceAlt }}
              />
            </PressableScale>
          )}
          <View style={{ padding: spacing.lg }}>
          {/* L'auteur comme dans le reste de l'app : sa photo, son nom sur
              toute la largeur, puis son rôle et la date — le badge de rôle
              collé au nom le coupait en deux (« Marie / Dupont »). */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Avatar user={announcement.author} size={42} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                {announcement.author.firstName} {announcement.author.lastName}
              </Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
                {ROLE_LABELS[announcement.author.role]} · {dateFmt.format(new Date(announcement.createdAt))}
              </Text>
            </View>
          </View>

          <Text style={[type.title2, { color: colors.ink, marginTop: spacing.lg }]}>{announcement.title}</Text>
          <Text style={[type.body, { color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 24 }]}>
            {announcement.body}
          </Text>
          </View>
        </Card>
      </ScrollView>
      {announcement.hasCoverPhoto && (
        <PhotoViewerModal
          visible={viewerOpen}
          uri={announcementCoverPhotoUrl(announcement.id)}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </ScreenContainer>
  );
}
