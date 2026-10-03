import React from "react";
import { ImageBackground, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { OfflineBanner } from "../../components/OfflineBanner";
import { Card } from "../../components/Card";
import { MissionCard } from "../../components/MissionCard";
import { WeekMiniGrid } from "../../components/WeekMiniGrid";
import { PressableScale } from "../../components/PressableScale";
import { PulsingDot } from "../../components/PulsingDot";
import { TimesheetWidget } from "../../components/TimesheetWidget";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";
import { useOnboardingScrollProps } from "../../onboarding/useOnboardingScrollProps";
import { BrandLockup } from "../../components/BrandLockup";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { avatarUrl } from "../../api/users.api";
import { announcementCoverPhotoUrl } from "../../api/announcements.api";
import { useUnreadInboxCount } from "../../hooks/useUnreadInboxCount";
import { DASHBOARD_SECTIONS, DashboardSectionTone } from "./dashboardSections";
import { useDashboardData } from "./useDashboardData";
import type { KpiTile } from "./useDashboardData";
import { timeAgo } from "../../utils/timeAgo";
import { addDays, formatWeekRange, toLocalDateKey } from "../../utils/missionFormat";
import { NOTIFICATION_TYPE_ICON } from "../../utils/notificationIcons";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import type { AppTabsParamList } from "../../navigation/AppTabs";
import { opensPlanningTab, resolveNotificationTarget } from "../../utils/notificationTarget";
import { Alert } from "../../utils/alert";
import { extractErrorMessage } from "../../api/client";

// Photo de remplissage (licence Unsplash, libre pour usage commercial) — voir
// assets/photos/README.md : à remplacer par une vraie photo de l'entreprise
// avant publication sur les stores.
const homeBanner = require("../../../assets/photos/home-banner.jpg");

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <Text style={[type.overline, { color: colors.inkTertiary }]}>{children}</Text>
      {action}
    </View>
  );
}

// Cartes "héro" pour les indicateurs de l'accueil — retour explicite du
// client : la grille groupée façon Réglages (KpiGrid, réutilisée sur
// Statistiques/Commercial pour des listes plus denses) rendait "trois cases
// plates" sur la toute première page de l'app, pas assez premium pour cet
// emplacement précis. Ici chaque indicateur a sa propre carte teintée avec
// respiration, façon widget Apple Météo/Santé, plutôt qu'une colonne
// partagée dans une carte unique.
function HeroKpiRow({ tiles, tones }: { tiles: KpiTile[]; tones: Record<DashboardSectionTone, { fg: string; bg: string }> }) {
  const { colors, spacing, radius, type } = useTheme();
  const { width } = useResponsive();
  // Sur téléphone, deux cartes par ligne au plus : à trois ou quatre de front,
  // chaque carte faisait 75 px de large et les libellés se coupaient en plein
  // mot (« Chantie / rs », « Employ / és »). Une carte seule en fin de grille
  // prend toute la largeur, en ligne, plutôt que de laisser une demi-ligne vide.
  const perRow = tiles.length <= 2 || width >= 600 ? tiles.length : 2;
  const rows: KpiTile[][] = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((row) => (
        <View key={row.map((t) => t.key).join("-")} style={{ flexDirection: "row", gap: spacing.sm }}>
          {row.map((tile) => {
            const tone = tones[tile.tone];
            const wide = row.length === 1 && tiles.length > 1;
            return (
              <View
                key={tile.key}
                style={{
                  flex: 1,
                  backgroundColor: tone.bg,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                  flexDirection: wide ? "row" : "column",
                  alignItems: wide ? "center" : "stretch",
                }}
              >
                {!!tile.icon && (
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radius.sm,
                      backgroundColor: tone.fg + "26",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: wide ? 0 : spacing.sm,
                      marginRight: wide ? spacing.sm : 0,
                    }}
                  >
                    <Ionicons name={tile.icon} size={15} color={tone.fg} />
                  </View>
                )}
                <Text style={[type.title2, { color: tone.fg }]} numberOfLines={1}>
                  {tile.value}
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: colors.inkSecondary },
                    wide ? { marginLeft: spacing.sm, flex: 1 } : { marginTop: 2 },
                  ]}
                  numberOfLines={2}
                >
                  {tile.label}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function HomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data, state, offlineCachedAt, reload } = useDashboardData(user);
  const onboardingScrollProps = useOnboardingScrollProps("Home");

  const tones: Record<DashboardSectionTone, { fg: string; bg: string }> = {
    accent: { fg: colors.accent, bg: colors.accentSoft },
    info: { fg: colors.info, bg: colors.infoSoft },
    purple: { fg: colors.purple, bg: colors.purpleSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    success: { fg: colors.success, bg: colors.successSoft },
    neutral: { fg: colors.neutral, bg: colors.neutralSoft },
  };

  if (!user) return null;

  const sections = DASHBOARD_SECTIONS[user.role];

  const tabNavigation = navigation.getParent<NavigationProp<AppTabsParamList>>();

  // La grille de la semaine est un aperçu : on saute vers l'onglet Planning
  // complet (pagination, actions) plutôt que de dupliquer ces écrans ici —
  // en ouvrant directement le jour cliqué, pas le dernier jour déjà
  // sélectionné dans cet onglet (bug corrigé : `day` était ignoré).
  function goToPlanning(day?: Date) {
    tabNavigation?.navigate("Planning", {
      screen: "PlanningHome",
      params: day ? { day: toLocalDateKey(day) } : undefined,
    });
  }

  // Même cible que dans le centre de notifications : l'écran concerné, ouvert
  // sur la pile Messagerie (une mission garde son onglet Missions).
  async function openRecentActivity(notif: (typeof data.recentActivity)[number]) {
    try {
      if (opensPlanningTab(notif)) {
        tabNavigation?.navigate("Planning");
        return;
      }
      const target = await resolveNotificationTarget(notif);
      if (target?.tab) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tabNavigation?.navigate(target.tab, { screen: target.screen, params: target.params } as any);
      } else if (target?.screen === "MissionDetail") {
        tabNavigation?.navigate("Missions", { screen: "MissionDetail", params: target.params });
      } else if (target) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tabNavigation?.navigate("Messagerie", { screen: target.screen, params: target.params } as any);
      } else {
        tabNavigation?.navigate("Messagerie");
      }
    } catch (err) {
      Alert.alert("Impossible d'ouvrir", extractErrorMessage(err));
    }
  }

  function openSection(section: (typeof sections)[number]) {
    if (section.tab) tabNavigation?.navigate(section.tab);
    // Nom d'écran dynamique (union de plusieurs routes sans paramètres
    // obligatoires) : React Navigation ne peut pas résoudre la bonne
    // surcharge à la compilation, d'où ce cast ciblé plutôt qu'un `any` large.
    else if (section.screen) navigation.navigate(section.screen as never);
  }

  const unread = useUnreadInboxCount();

  return (
    <ScreenContainer noHeader style={{ paddingHorizontal: 0 }}>
      <ScrollView
        {...onboardingScrollProps}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={state === "loading" && data.kpis.length > 0} onRefresh={reload} tintColor={colors.accent} />}
      >
        {/* Bandeau photo — voir assets/photos/README.md (placeholder libre de
            droits, à remplacer par une vraie photo de l'entreprise). */}
        <ImageBackground source={homeBanner} style={styles.banner} imageStyle={{ opacity: 0.9 }}>
          <LinearGradient
            colors={["rgba(11,59,73,0.55)", "rgba(16,19,34,0.55)", "rgba(16,19,34,0.92)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.bannerRow, { paddingHorizontal: spacing.lg }]}>
            <BrandLockup height={28} variant="white" />
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <PressableScale
                onPress={() => tabNavigation?.navigate("Messagerie")}
                style={[styles.bannerIconButton, { marginRight: spacing.sm }]}
              >
                <Ionicons name="notifications-outline" size={17} color="#FFFFFF" />
                {unread > 0 && (
                  <View style={styles.bannerBadge}>
                    <Text style={styles.bannerBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                  </View>
                )}
              </PressableScale>
              <PressableScale
                onPress={() =>
                  // `initial: false` : sans ça, quand l'onglet Menu n'a pas
                  // encore été ouvert dans la session, Profil devenait l'UNIQUE
                  // écran de sa pile (racine) — aucune flèche retour possible,
                  // navigation "bloquée" sur le profil (bug remonté par le
                  // client). Ainsi Profil est toujours empilé par-dessus
                  // MenuHome, retour garanti quel que soit l'état de l'onglet.
                  tabNavigation?.navigate("Menu", { screen: "Profile", initial: false })
                }
              >
                {user.hasAvatar ? (
                  <AuthenticatedImage uri={avatarUrl(user.id)} style={styles.bannerAvatar} />
                ) : (
                  <View style={[styles.bannerAvatar, styles.bannerAvatarFallback]}>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
                      {`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()}
                    </Text>
                  </View>
                )}
              </PressableScale>
            </View>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            <Text style={[type.largeTitle, { color: "#FFFFFF" }]}>
              {greeting()}, {user.firstName}
            </Text>
            <Text style={[type.subhead, { color: "rgba(255,255,255,0.85)", marginTop: spacing.xxs }]}>
              Voici votre programme du jour.
            </Text>
          </View>
        </ImageBackground>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        {!!offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}
        {state === "error" && (
          <View style={{ marginTop: spacing.lg }}>
            <StateView kind="error" onRetry={reload} />
          </View>
        )}

        {/* Pointage : l'action la plus fréquente de l'app, pour tout le monde —
            jamais à plus d'un geste de l'accueil, indépendamment du reste du
            tableau de bord. */}
        <OnboardingTarget id="home.clock" style={{ marginTop: spacing.lg }}>
          <TimesheetWidget
            onOpenHistory={() => navigation.navigate("Timesheet")}
            onOpenRetroactive={() => navigation.navigate("TimesheetRetroactive")}
          />
        </OnboardingTarget>

        {/* "Où je dois aller, quand" doit être visible sans avoir à cliquer
            (cahier des charges §13/§16) — mission en cours en priorité, sinon
            la prochaine à venir. Seul l'employé reçoit ces champs (voir
            useDashboardData.ts), donc ce bloc ne s'affiche que pour lui. */}
        {(data.currentMission || data.overdueMission || data.nextMission) && (
          <View style={{ marginTop: spacing.lg }}>
            {(() => {
              // Priorité d'affichage : ce qui se passe maintenant, puis ce qui
              // aurait dû être fait, puis ce qui vient. Une mission non
              // démarrée dont l'horaire est passé mérite d'être signalée comme
              // telle — annoncée comme "prochaine", elle envoyait l'employé sur
              // un chantier dont l'intervention était terminée depuis des heures.
              const highlighted = data.currentMission ?? data.overdueMission ?? data.nextMission!;
              const isOverdue = !data.currentMission && !!data.overdueMission;
              return (
                <>
                  <Text
                    style={[
                      type.overline,
                      { color: isOverdue ? colors.warning : colors.inkTertiary, marginBottom: spacing.sm },
                    ]}
                  >
                    {data.currentMission ? "MISSION EN COURS" : isOverdue ? "MISSION NON DÉMARRÉE" : "PROCHAINE MISSION"}
                  </Text>
                  <MissionCard
                    mission={highlighted}
                    onPress={() =>
                      tabNavigation?.navigate("Missions", {
                        screen: "MissionDetail",
                        params: { missionId: highlighted.id },
                      })
                    }
                  />
                  {!!isOverdue && (
                    <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xs }]}>
                      L'horaire est passé et la mission n'a pas été démarrée. Prévenez votre chef d'équipe si
                      elle n'a pas eu lieu.
                    </Text>
                  )}
                </>
              );
            })()}
          </View>
        )}

        {state !== "error" && (
          <>
            {/* KPI — l'essentiel visible dès l'arrivée, sans avoir à cliquer.
                Un titre de section comme les autres blocs ci-dessous (retour
                explicite du client : la grille flottait seule, sans contexte,
                ce qui la faisait paraître "à part" plutôt qu'intégrée). */}
            {(state === "loading" && data.kpis.length === 0) || data.kpis.length > 0 ? (
              <>
                <SectionTitle>EN UN COUP D'ŒIL</SectionTitle>
                {data.kpis.length > 0 ? <HeroKpiRow tiles={data.kpis} tones={tones} /> : <Card style={{ height: 108 }} />}
              </>
            ) : null}

            {/* Dernière actualité (RH/Superviseur/Direction/Admin) — visible dès
                l'accueil comme la mission en cours ci-dessus, en plus de son
                écran dédié "Actualités" (cahier des charges §13 : "informations
                importantes" visibles sans avoir à cliquer). */}
            {!!data.latestAnnouncement && (
              <>
                <SectionTitle
                  action={
                    <PressableScale onPress={() => navigation.navigate("AnnouncementsList")}>
                      <Text style={[type.caption, { color: colors.accent, fontWeight: "700" }]}>Voir tout</Text>
                    </PressableScale>
                  }
                >
                  ACTUALITÉS DE L'ENTREPRISE
                </SectionTitle>
                <PressableScale
                  onPress={() =>
                    navigation.navigate("AnnouncementDetail", { announcementId: data.latestAnnouncement!.id })
                  }
                >
                  <Card padded={false}>
                    {!!data.latestAnnouncement.hasCoverPhoto && (
                      <AuthenticatedImage
                        uri={announcementCoverPhotoUrl(data.latestAnnouncement.id)}
                        style={{ width: "100%", height: 140, backgroundColor: colors.surfaceAlt }}
                      />
                    )}
                    <View style={{ padding: spacing.lg }}>
                      <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                        {data.latestAnnouncement.title}
                      </Text>
                      <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]} numberOfLines={2}>
                        {data.latestAnnouncement.body}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.sm }]}>
                        {data.latestAnnouncement.author.firstName} {data.latestAnnouncement.author.lastName} ·{" "}
                        {timeAgo(data.latestAnnouncement.createdAt)}
                      </Text>
                    </View>
                  </Card>
                </PressableScale>
              </>
            )}

            {data.weekMissions.length > 0 && (
              <>
                <SectionTitle
                  action={
                    <PressableScale onPress={() => goToPlanning()}>
                      <Text style={[type.caption, { color: colors.accent, fontWeight: "700" }]}>Voir tout</Text>
                    </PressableScale>
                  }
                >
                  PLANNING — SEMAINE DU {formatWeekRange(data.weekStart, addDays(data.weekStart, 6)).toUpperCase()}
                </SectionTitle>
                <WeekMiniGrid weekStart={data.weekStart} missions={data.weekMissions} onPressDay={(day) => goToPlanning(day)} />
              </>
            )}

            {data.recentActivity.length > 0 && (
              <>
                <SectionTitle>ACTIVITÉ RÉCENTE</SectionTitle>
                <Card padded={false}>
                  {data.recentActivity.map((notif, index) => (
                    <PressableScale key={notif.id} onPress={() => openRecentActivity(notif)}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.lg,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: radius.md,
                            backgroundColor: colors.accentSoft,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: spacing.sm,
                          }}
                        >
                          <Ionicons name={NOTIFICATION_TYPE_ICON[notif.type]} size={15} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {!notif.isRead && <PulsingDot color={colors.accent} style={{ marginRight: 5 }} />}
                            <Text style={[type.callout, { color: colors.ink, fontWeight: "600", flexShrink: 1 }]} numberOfLines={1}>
                              {notif.title}
                            </Text>
                          </View>
                          <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]} numberOfLines={1}>
                            {notif.body}
                          </Text>
                        </View>
                        <Text style={[type.caption, { color: colors.inkTertiary, marginLeft: spacing.sm }]}>
                          {timeAgo(notif.createdAt)}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        <SectionTitle>ACCÈS RAPIDE</SectionTitle>
        <OnboardingTarget id="home.quickAccess">
        <Card padded={false}>
          {sections.map((section, index) => {
            const tone = tones[section.tone ?? "accent"];
            return (
              <PressableScale key={section.label} onPress={() => openSection(section)}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.lg,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.md,
                      backgroundColor: tone.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={section.icon} size={18} color={tone.fg} />
                  </View>
                  <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.md, flex: 1 }]}>
                    {section.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
                </View>
              </PressableScale>
            );
          })}
        </Card>
        </OnboardingTarget>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // `height` fixe (pas juste `minHeight`) + `overflow: "hidden"` : la photo
  // de fond reste bornée à ce bandeau du haut, jamais un fond qui pourrait
  // déborder sur le reste de la page (retour explicite du client).
  banner: { width: "100%", height: 200, overflow: "hidden", justifyContent: "flex-end" },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingBottom: 18,
  },
  bannerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(16,19,34,0.5)",
  },
  bannerBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  bannerAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  bannerAvatarFallback: { backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});
