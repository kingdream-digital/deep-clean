import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { MissionCard } from "../../components/MissionCard";
import { OfflineBanner } from "../../components/OfflineBanner";
import { PressableScale } from "../../components/PressableScale";
import { SegmentedControl } from "../../components/SegmentedControl";
import { AssigneeAvatar } from "../../components/AssigneeAvatar";
import { useTheme } from "../../theme/ThemeProvider";
import { fontFamily } from "../../theme/typography";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../auth/AuthContext";
import { listMissions, listMissionsToReassign } from "../../api/missions.api";
import type { Mission, MissionAssignee } from "../../api/missions.api";
import { listUsers } from "../../api/users.api";
import { listAbsences } from "../../api/absences.api";
import type { PlanningStackParamList } from "../../navigation/PlanningStack";

type Route = RouteProp<PlanningStackParamList, "PlanningHome">;
import {
  WEEKDAY_LABELS,
  addDays,
  dateKey,
  formatMissionDay,
  formatMissionTimeRange,
  formatWeekRange,
  isMissionOverdue,
  isSameLocalDay,
  mondayOf,
  toLocalDateKey,
} from "../../utils/missionFormat";
import { readCache, writeCache } from "../../offline/cache";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

// Créer une mission est réservé aux rôles qui gèrent le planning — même
// règle que dans MissionsListScreen (le chef d'équipe n'en fait plus partie,
// retour explicite du client) ; on l'ajoute ici en plus sur le Planning
// lui-même, pour créer directement sur le jour affiché.
const CAN_MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

// Vue "planning" : la semaine en cours (lundi → dimanche) s'affiche directement
// à l'ouverture de l'app — tâches et lieu du jour en un coup d'œil, conforme
// au cahier des charges ("où dois-je aller, quand, que dois-je faire ?").
// Le périmètre exact (personnel / chantiers gérés / vue globale) est déterminé
// côté serveur selon le rôle — aucune logique de portée n'est dupliquée ici.
//
// Mode hors connexion : sert les dernières missions connues de la semaine
// depuis le cache local si le réseau est indisponible (lecture seule).
export function PlanningScreen() {
  const { colors, spacing, radius, type, isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanningStackParamList>>();
  const route = useRoute<Route>();
  const { isDesktopWeb } = useResponsive();
  const { user } = useAuth();
  // Superviseur, RH et Direction pilotent l'équipe au global : ils ont besoin
  // de voir qui travaille sur quoi chaque jour, pas seulement ce qui se passe
  // par chantier — demande explicite du client (voir TeamWeekGrid ci-dessous).
  // Le chef d'équipe garde la grille par jour : il ne suit que ses propres
  // chantiers, l'organisation par personnel n'y ajoute rien.
  const managesTeam = !!user && ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"].includes(user.role);
  const showTeamGrid = isDesktopWeb && managesTeam;
  // Sur téléphone, même logique « par personne » que la grille ordinateur,
  // pour le jour sélectionné (retour explicite du client : ajouter une
  // mission à quelqu'un d'un geste, aussi depuis le téléphone).
  const [phoneView, setPhoneView] = useState<"missions" | "team">("missions");
  const canManagePlanning = !!user && CAN_MANAGE_ROLES.includes(user.role);

  const today = useMemo(() => new Date(), []);
  // Jour ciblé explicitement (ex. depuis le mini-calendrier du tableau de
  // bord) : détermine la semaine ET le jour sélectionné à l'ouverture,
  // plutôt que de rester sur le dernier jour déjà sélectionné dans cet onglet.
  const targetDay = useMemo(() => (route.params?.day ? new Date(`${route.params.day}T00:00:00`) : null), [route.params?.day]);

  function weekOffsetFor(day: Date): number {
    const diffDays = Math.round((mondayOf(day).getTime() - mondayOf(today).getTime()) / (24 * 60 * 60 * 1000));
    return Math.round(diffDays / 7);
  }

  const [weekOffset, setWeekOffset] = useState(() => (targetDay ? weekOffsetFor(targetDay) : 0));
  const weekStart = useMemo(() => addDays(mondayOf(today), weekOffset * 7), [today, weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [selectedDay, setSelectedDay] = useState<Date>(targetDay ?? today);
  // Repère le dernier `day` ciblé déjà appliqué, pour ne réagir qu'aux VRAIS
  // changements (ex. un nouveau tap sur le mini-calendrier du tableau de
  // bord alors que Planning est déjà monté) — jamais à un remount normal.
  const lastAppliedTargetKey = useRef<string | undefined>(route.params?.day);
  // Le tout premier passage de l'effet "changement de semaine" ne doit rien
  // réinitialiser (l'état initial est déjà correct via les useState
  // ci-dessus) ; pareil juste après avoir appliqué un nouveau `day` ciblé,
  // qui a déjà positionné `selectedDay` lui-même.
  const isFirstWeekEffect = useRef(true);
  const justAppliedTarget = useRef(false);

  // Un nouveau `day` ciblé : repositionne à la fois la semaine et le jour
  // sélectionné sur ce jour précis, plutôt que de rester sur le dernier jour
  // déjà affiché dans cet onglet.
  useEffect(() => {
    if (targetDay && route.params?.day !== lastAppliedTargetKey.current) {
      setWeekOffset(weekOffsetFor(targetDay));
      setSelectedDay(targetDay);
      lastAppliedTargetKey.current = route.params?.day;
      justAppliedTarget.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.day]);

  // Changement de semaine par la flèche précédente/suivante : on retombe sur
  // aujourd'hui si elle en fait partie, sinon lundi.
  useEffect(() => {
    if (isFirstWeekEffect.current) {
      isFirstWeekEffect.current = false;
      return;
    }
    if (justAppliedTarget.current) {
      justAppliedTarget.current = false;
      return;
    }
    const containsToday = days.some((d) => isSameLocalDay(d, today));
    setSelectedDay(containsToday ? today : days[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);

  const cacheKey = `planning.week.${toLocalDateKey(weekStart)}`;

  // Grille par personne : TOUTE l'équipe active (pas seulement ceux qui ont
  // déjà une mission cette semaine), pour pouvoir cliquer sur une case vide
  // et lui ajouter une mission — retour explicite du client. Les absences
  // approuvées de la semaine sont affichées dans les cases concernées.
  const [staff, setStaff] = useState<MissionAssignee["user"][]>([]);
  // Clé « userId|AAAA-MM-JJ » → motif affiché (« En congé », « Arrêt maladie »…).
  const [absentKeys, setAbsentKeys] = useState<Map<string, string>>(new Map());
  const loadTeam = useCallback(async () => {
    if (!managesTeam) return;
    const from = toLocalDateKey(weekStart);
    const to = toLocalDateKey(weekEnd);
    const [employees, leads, absences] = await Promise.all([
      listUsers({ role: "EMPLOYEE", isActive: true }).catch(() => null),
      listUsers({ role: "SITE_MANAGER", isActive: true }).catch(() => null),
      listAbsences({ status: "APPROVED", from, to }).catch(() => null),
    ]);
    setStaff(
      [...(employees?.items ?? []), ...(leads?.items ?? [])].map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        hasAvatar: u.hasAvatar,
        isActive: u.isActive,
        weeklyHours: u.weeklyHours ?? null,
      }))
    );
    const keys = new Map<string, string>();
    const ABSENCE_LABELS: Record<string, string> = {
      PAID_LEAVE: "En congé",
      SICK_LEAVE: "Arrêt maladie",
      UNPAID_LEAVE: "Congé sans solde",
      WORK_ACCIDENT: "Accident du travail",
      PARENTAL_LEAVE: "Congé maternité / paternité",
      OTHER: "Absent",
    };
    for (const absence of absences?.items ?? []) {
      // Jours calendaires stockés à minuit UTC : lus en UTC, comme partout.
      const cursor = new Date(absence.startDate);
      const end = new Date(absence.endDate);
      while (cursor.getTime() <= end.getTime()) {
        keys.set(`${absence.userId}|${cursor.toISOString().slice(0, 10)}`, ABSENCE_LABELS[absence.type] ?? "Absent");
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    setAbsentKeys(keys);
  }, [managesTeam, weekStart, weekEnd]);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const res = await listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) });
      setMissions(res.items);
      setOfflineCachedAt(null);
      setState("ready");
      void writeCache(cacheKey, res.items);
    } catch {
      const net = await NetInfo.fetch();
      const cached = net.isConnected === false ? await readCache<Mission[]>(cacheKey) : null;
      if (cached) {
        setMissions(cached.data);
        setOfflineCachedAt(cached.cachedAt);
        setState("ready");
      } else {
        if (!silent) setState("error");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Missions prévues avec une personne qui sera absente : bandeau d'alerte
  // vers l'écran de réaffectation (superviseur, RH, direction, admin).
  const [toReassignCount, setToReassignCount] = useState(0);
  const loadToReassign = useCallback(async () => {
    if (!managesTeam) return;
    try {
      setToReassignCount((await listMissionsToReassign()).length);
    } catch {
      setToReassignCount(0);
    }
  }, [managesTeam]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
      void loadTeam();
      void loadToReassign();
    }, [load, loadTeam, loadToReassign])
  );

  const reassignBanner = toReassignCount > 0 && (
    <PressableScale onPress={() => navigation.navigate("ReassignMissions")} accessibilityRole="button">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.dangerSoft,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        }}
      >
        <Ionicons name="medkit-outline" size={18} color={colors.danger} />
        <Text style={[type.callout, { color: colors.danger, fontWeight: "700", marginLeft: 8, flex: 1 }]}>
          {toReassignCount} mission{toReassignCount > 1 ? "s" : ""} à réaffecter (absences)
        </Text>
        <Text style={[type.footnote, { color: colors.danger }]}>Voir</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.danger} />
      </View>
    </PressableScale>
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const missionsByDay = useMemo(() => {
    const map = new Map<string, Mission[]>();
    for (const mission of missions) {
      const key = dateKey(mission.date);
      const list = map.get(key) ?? [];
      list.push(mission);
      map.set(key, list);
    }
    return map;
  }, [missions]);

  // Personnel apparaissant au moins une fois cette semaine, dédupliqué —
  // et missions de chaque employé réparties par jour, pour TeamWeekGrid.
  // Dérivé de `missions` déjà chargé : aucun appel réseau supplémentaire.
  const teamMembers = useMemo(() => {
    const map = new Map<string, MissionAssignee["user"]>();
    for (const member of staff) map.set(member.id, member);
    for (const mission of missions) {
      for (const assignment of mission.assignments) {
        if (!map.has(assignment.userId)) map.set(assignment.userId, assignment.user);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
    );
  }, [missions, staff]);

  // Heures planifiées sur la semaine affichée, par personne (missions non
  // annulées) : comparées aux heures du contrat pour savoir ce qu'il reste.
  const weeklyMinutesByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const mission of missions) {
      if (mission.status === "CANCELLED") continue;
      const minutes = Math.max(0, (new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime()) / 60000);
      for (const assignment of mission.assignments) {
        map.set(assignment.userId, (map.get(assignment.userId) ?? 0) + minutes);
      }
    }
    return map;
  }, [missions]);
  // RH, direction, superviseur, admin : enregistrent une absence pour
  // quelqu'un directement depuis le planning (ex. arrêt maladie par téléphone).
  const canDeclareAbsence = managesTeam;
  const declareAbsence = (member: MissionAssignee["user"], day: Date) =>
    navigation.navigate("AbsenceForm", {
      userId: member.id,
      fullName: `${member.firstName} ${member.lastName}`,
      initialDate: toLocalDateKey(day),
    });

  const missionsByUserAndDay = useMemo(() => {
    const map = new Map<string, Map<string, Mission[]>>();
    for (const mission of missions) {
      const key = dateKey(mission.date);
      for (const assignment of mission.assignments) {
        let userMap = map.get(assignment.userId);
        if (!userMap) {
          userMap = new Map();
          map.set(assignment.userId, userMap);
        }
        const list = userMap.get(key) ?? [];
        list.push(mission);
        userMap.set(key, list);
      }
    }
    return map;
  }, [missions]);

  const selectedDayMissions = missionsByDay.get(toLocalDateKey(selectedDay)) ?? [];
  const isCurrentWeek = weekOffset === 0;
  const selectedIndex = days.findIndex((d) => isSameLocalDay(d, selectedDay));

  // Pastille d'arrière-plan qui glisse sous le jour sélectionné plutôt que de
  // réapparaître brutalement à chaque tap — le sélecteur de jour est l'élément
  // le plus manipulé de l'écran d'atterrissage de l'app, il mérite ce soin.
  const [rowWidth, setRowWidth] = useState(0);
  const slotWidth = rowWidth / 7;
  const pillX = useSharedValue(0);
  // Le tout premier positionnement doit être instantané (pas de ressort) :
  // animer depuis 0 dès la toute première mesure de largeur peut, sur web,
  // se figer visuellement à mi-course selon le timing de la mise en page —
  // seuls les changements de sélection ULTÉRIEURS doivent glisser.
  const hasPositionedOnce = useRef(false);

  useEffect(() => {
    if (slotWidth > 0 && selectedIndex >= 0) {
      const target = selectedIndex * slotWidth;
      if (!hasPositionedOnce.current) {
        pillX.value = target;
        hasPositionedOnce.current = true;
      } else {
        pillX.value = withSpring(target, { damping: 18, stiffness: 220 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, slotWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: slotWidth,
  }));

  function handleRowLayout(e: LayoutChangeEvent) {
    setRowWidth(e.nativeEvent.layout.width);
  }

  return (
    // fullBleed : la grille (7 jours, +1 colonne personnel sur desktop) a
    // besoin de toute la largeur disponible — le plafond par défaut de
    // ScreenContainer (pensé pour du texte/formulaire) la rendait cramée,
    // avec une grosse bande vide à droite sur un écran large.
    <ScreenContainer fullBleed>
      {/* Même fond que l'en-tête de navigation juste au-dessus : la bande
          prolonge l'en-tête en un seul bloc, arrondi des deux côtés. L'ancien
          dégradé partait de la couleur du fond de page en haut à gauche — le
          coin gauche se fondait dans la page et seul le coin droit restait
          visible, comme une carte mal coupée. */}
      <View style={[styles.heroBleed, { marginHorizontal: -spacing.lg, backgroundColor: colors.backgroundElevated }]}>
        <OnboardingTarget
          id="planning.week"
          style={{ paddingTop: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <PressableScale pressedScale={0.85} hitSlop={10} onPress={() => setWeekOffset((w) => w - 1)}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </PressableScale>
            <PressableScale pressedScale={0.96} onPress={() => setWeekOffset(0)} disabled={isCurrentWeek}>
              <Text style={[type.headline, { color: colors.ink }]}>Semaine du {formatWeekRange(weekStart, weekEnd)}</Text>
              {!isCurrentWeek && (
                <Text style={[type.caption, { color: colors.accent, textAlign: "center", marginTop: 2 }]}>
                  Revenir à aujourd'hui
                </Text>
              )}
            </PressableScale>
            <PressableScale pressedScale={0.85} hitSlop={10} onPress={() => setWeekOffset((w) => w + 1)}>
              <Ionicons name="chevron-forward" size={22} color={colors.ink} />
            </PressableScale>
          </View>

          {/* Créer une mission directement depuis le Planning, pré-remplie sur le
              jour actuellement affiché — desktop uniquement ici, le mobile a son
              propre FAB flottant plus bas (cohérent avec MissionsListScreen). */}
          {isDesktopWeb && canManagePlanning && (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.md }}>
              <OnboardingTarget id="planning.create">
              <PressableScale onPress={() => navigation.navigate("MissionForm", { initialDate: toLocalDateKey(selectedDay) })}>
                <View style={[styles.desktopCreateBtn, { backgroundColor: colors.accentFill, borderRadius: radius.md }]}>
                  <Ionicons name="add" size={18} color={colors.onAccent} />
                  <Text style={{ color: colors.onAccent, fontWeight: "600", marginLeft: 6, fontSize: 15 }}>
                    Nouvelle mission
                  </Text>
                </View>
              </PressableScale>
              </OnboardingTarget>
            </View>
          )}

          {/* Sélecteur d'un seul jour : inutile sur desktop web, où la grille
              ci-dessous montre déjà les 7 jours de la semaine côte à côte. */}
          {!isDesktopWeb && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: "row" }} onLayout={handleRowLayout}>
              {rowWidth > 0 && (
                // Conteneur externe : porte le glow (l'overflow hidden du dégradé
                // interne couperait l'ombre s'il était sur la même vue).
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      // zIndex explicite : sur web, les chips voisins (position: relative,
                      // z-index: 0 par défaut via react-native-web) peignent après cette
                      // pastille dans l'ordre du DOM et la recouvriraient sans ce réglage.
                      zIndex: -1,
                      marginHorizontal: 2,
                      borderRadius: radius.md,
                      // Halo atténué en mode sombre (retour explicite du client).
                      shadowColor: colors.accentBright,
                      shadowOpacity: isDark ? 0.2 : 0.45,
                      shadowRadius: isDark ? 8 : 12,
                      shadowOffset: { width: 0, height: isDark ? 2 : 4 },
                      elevation: isDark ? 3 : 6,
                    },
                    pillStyle,
                  ]}
                >
                  <LinearGradient
                    colors={colors.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
                  />
                </Animated.View>
              )}
              {days.map((day, index) => {
                const key = toLocalDateKey(day);
                const isSelected = index === selectedIndex;
                const isToday = isSameLocalDay(day, today);
                const count = missionsByDay.get(key)?.length ?? 0;
                return (
                  <PressableScale
                    key={key}
                    pressedScale={0.94}
                    onPress={() => setSelectedDay(day)}
                    style={{ flex: 1, paddingVertical: spacing.xs, alignItems: "center" }}
                  >
                    <Text
                      style={[
                        type.caption,
                        {
                          color: isSelected ? colors.onAccent : colors.inkTertiary,
                          fontFamily: fontFamily.semibold,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {WEEKDAY_LABELS[index]}
                    </Text>
                    <Text
                      style={[
                        type.headline,
                        { color: isSelected ? colors.onAccent : isToday ? colors.accent : colors.ink, marginTop: 2 },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        marginTop: 4,
                        backgroundColor: count > 0 ? (isSelected ? colors.onAccent : colors.accent) : "transparent",
                      }}
                    />
                  </PressableScale>
                );
              })}
            </View>
          </View>
          )}
        </OnboardingTarget>
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}

      {state === "ready" && isDesktopWeb && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        >
          {/* Plafond généreux plutôt qu'un fullBleed strict : la grille profite du
              gain de largeur (fullBleed sur ScreenContainer ci-dessus) sans
              s'étirer jusqu'à devenir illisible sur un très grand écran. */}
          <View style={{ maxWidth: 1680, width: "100%", alignSelf: "center" }}>
            {!!offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}
            {reassignBanner}
            {showTeamGrid ? (
              <TeamWeekGrid
                days={days}
                teamMembers={teamMembers}
                missionsByUserAndDay={missionsByUserAndDay}
                absentKeys={absentKeys}
                weeklyMinutesByUser={weeklyMinutesByUser}
                onDeclareAbsence={canDeclareAbsence ? (member) => declareAbsence(member, isCurrentWeek ? today : days[0]!) : undefined}
                today={today}
                onPressMission={(mission) => navigation.navigate("MissionDetail", { missionId: mission.id })}
                onAddMission={
                  canManagePlanning
                    ? (member, day) =>
                        navigation.navigate("MissionForm", { initialDate: toLocalDateKey(day), initialAssigneeId: member.id })
                    : undefined
                }
              />
            ) : (
              <DesktopWeekGrid
                days={days}
                missionsByDay={missionsByDay}
                today={today}
                onPressMission={(mission) => navigation.navigate("MissionDetail", { missionId: mission.id })}
              />
            )}
          </View>
        </ScrollView>
      )}

      {state === "ready" && !isDesktopWeb && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        >
          {!!offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}
          {reassignBanner}

          {managesTeam && (
            <View style={{ marginBottom: spacing.md }}>
              <SegmentedControl
                value={phoneView}
                onChange={setPhoneView}
                options={[
                  { label: "Missions du jour", value: "missions" },
                  { label: "Par personne", value: "team" },
                ]}
              />
            </View>
          )}

          <Text
            style={[
              type.subhead,
              { color: colors.inkSecondary, marginBottom: spacing.md, fontFamily: fontFamily.semibold, fontWeight: "600" },
            ]}
          >
            {formatMissionDay(selectedDay.toISOString())}
          </Text>

          {managesTeam && phoneView === "team" ? (
            <TeamDayList
              day={selectedDay}
              today={today}
              teamMembers={teamMembers}
              missionsByUserAndDay={missionsByUserAndDay}
              absentKeys={absentKeys}
              weeklyMinutesByUser={weeklyMinutesByUser}
              onDeclareAbsence={canDeclareAbsence ? (member) => declareAbsence(member, selectedDay) : undefined}
              onPressMission={(mission) => navigation.navigate("MissionDetail", { missionId: mission.id })}
              onAddMission={
                canManagePlanning
                  ? (member) =>
                      navigation.navigate("MissionForm", { initialDate: toLocalDateKey(selectedDay), initialAssigneeId: member.id })
                  : undefined
              }
            />
          ) : selectedDayMissions.length === 0 ? (
            <StateView kind="empty" icon="calendar-outline" message="Aucune mission ce jour-là." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {selectedDayMissions.map((mission, index) => (
                <Animated.View key={mission.id} entering={FadeInUp.delay(index * 50).duration(300)}>
                  <MissionCard
                    mission={mission}
                    onPress={() => navigation.navigate("MissionDetail", { missionId: mission.id })}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {!isDesktopWeb && canManagePlanning && (
        <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
          <OnboardingTarget id="planning.create">
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.navigate("MissionForm", { initialDate: toLocalDateKey(selectedDay) })}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle mission"
            style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
          </OnboardingTarget>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

const MISSION_DOT_COLOR: Record<Mission["status"], (c: ReturnType<typeof useTheme>["colors"]) => string> = {
  SCHEDULED: (c) => c.accent,
  IN_PROGRESS: (c) => c.warning,
  COMPLETED: (c) => c.success,
  CANCELLED: (c) => c.danger,
};

// Puces "pastel" (fond teinté + texte de la même teinte) pour TeamWeekGrid —
// plus coloré/premium que le simple point + carte neutre de DesktopWeekGrid,
// et le statut reste lisible sans avoir à décoder une couleur de pastille.
const MISSION_SOFT_BG: Record<Mission["status"], (c: ReturnType<typeof useTheme>["colors"]) => string> = {
  SCHEDULED: (c) => c.accentSoft,
  IN_PROGRESS: (c) => c.warningSoft,
  COMPLETED: (c) => c.successSoft,
  CANCELLED: (c) => c.dangerSoft,
};
const MISSION_SOFT_TEXT: Record<Mission["status"], (c: ReturnType<typeof useTheme>["colors"]) => string> = {
  SCHEDULED: (c) => c.accentText,
  IN_PROGRESS: (c) => c.warning,
  COMPLETED: (c) => c.success,
  CANCELLED: (c) => c.danger,
};

// Vue "semaine complète" du planning, desktop web uniquement : les 7 jours
// côte à côte au lieu d'un seul jour à la fois — c'est l'écran où l'écart
// entre une app mobile étirée et un vrai outil de bureau se voyait le plus.
// Réutilise `missionsByDay`, déjà calculé par PlanningScreen — aucun appel
// réseau supplémentaire.
function DesktopWeekGrid({
  days,
  missionsByDay,
  today,
  onPressMission,
}: {
  days: Date[];
  missionsByDay: Map<string, Mission[]>;
  today: Date;
  onPressMission: (mission: Mission) => void;
}) {
  const { colors, spacing, radius, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {days.map((day, index) => {
        const key = toLocalDateKey(day);
        const dayMissions = missionsByDay.get(key) ?? [];
        const isToday = isSameLocalDay(day, today);

        return (
          <View key={key} style={{ flex: 1, minWidth: 0, paddingHorizontal: spacing.xxs }}>
            <View
              style={{
                alignItems: "center",
                paddingVertical: spacing.xs,
                marginBottom: spacing.sm,
                borderRadius: radius.sm,
                backgroundColor: isToday ? colors.accentSoft : "transparent",
              }}
            >
              <Text style={[type.caption, { color: isToday ? colors.accentText : colors.inkTertiary, fontWeight: "700" }]}>
                {WEEKDAY_LABELS[index]}
              </Text>
              <Text style={[type.headline, { color: isToday ? colors.accentText : colors.ink, marginTop: 1 }]}>
                {day.getDate()}
              </Text>
            </View>

            <View style={{ gap: spacing.xxs }}>
              {dayMissions.map((mission) => (
                <PressableScale key={mission.id} onPress={() => onPressMission(mission)}>
                  <View
                    style={{
                      backgroundColor: colors.backgroundElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      padding: spacing.xs,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {/* Même signal que sur téléphone : une mission dont
                          l'horaire est passé sans démarrage n'a pas la couleur
                          d'une mission « planifiée ». */}
                      {isMissionOverdue(mission) ? (
                        <Ionicons name="alert-circle" size={12} color={colors.warning} style={{ marginRight: 4 }} />
                      ) : (
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            marginRight: 5,
                            backgroundColor: MISSION_DOT_COLOR[mission.status](colors),
                          }}
                        />
                      )}
                      <Text style={[type.caption, { color: colors.ink, fontWeight: "700", flex: 1 }]} numberOfLines={1}>
                        {mission.site.name}
                      </Text>
                    </View>
                    <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                      {formatMissionTimeRange(mission.startTime, mission.endTime)}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// Vue "personnel × semaine" du planning, réservée au Superviseur, à la RH et
// à la Direction (demande explicite du client) : chaque ligne est un membre
// de l'équipe (photo, nom, statut) avec ses missions de la semaine alignées
// en face des jours correspondants — le chef d'équipe garde DesktopWeekGrid
// ci-dessus, organisée par jour, puisqu'il ne suit que ses propres chantiers.
// « 28 h / 35 h · reste 7 h » : heures planifiées cette semaine face aux
// heures du contrat (si la RH les a renseignées).
function WeekHoursLine({ member, plannedMinutes }: { member: MissionAssignee["user"]; plannedMinutes: number }) {
  const { colors, type } = useTheme();
  const planned = formatHoursShort(plannedMinutes);
  if (member.weeklyHours == null) {
    return <Text style={[type.caption, { color: colors.inkTertiary }]}>{planned} planifiées cette semaine</Text>;
  }
  const remaining = member.weeklyHours * 60 - plannedMinutes;
  const tone = remaining < 0 ? colors.danger : remaining === 0 ? colors.success : colors.accentText;
  return (
    <Text style={[type.caption, { color: colors.inkTertiary }]}>
      {planned} / {formatHoursShort(member.weeklyHours * 60)}
      <Text style={{ color: tone, fontWeight: "700" }}>
        {remaining > 0 ? ` · reste ${formatHoursShort(remaining)}` : remaining === 0 ? " · complet" : ` · +${formatHoursShort(-remaining)}`}
      </Text>
    </Text>
  );
}

function formatHoursShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

function TeamWeekGrid({
  days,
  teamMembers,
  missionsByUserAndDay,
  absentKeys,
  weeklyMinutesByUser,
  onDeclareAbsence,
  today,
  onPressMission,
  onAddMission,
}: {
  days: Date[];
  teamMembers: MissionAssignee["user"][];
  missionsByUserAndDay: Map<string, Map<string, Mission[]>>;
  absentKeys: Map<string, string>;
  weeklyMinutesByUser: Map<string, number>;
  onDeclareAbsence?: (member: MissionAssignee["user"]) => void;
  today: Date;
  onPressMission: (mission: Mission) => void;
  // Clic sur une case : nouvelle mission ce jour-là, pour cette personne.
  onAddMission?: (member: MissionAssignee["user"], day: Date) => void;
}) {
  const { colors, spacing, radius, type, isDark } = useTheme();
  const NAME_COL_WIDTH = 210;

  if (teamMembers.length === 0) {
    return <StateView kind="empty" icon="people-outline" message="Aucun membre de l'équipe à afficher." />;
  }

  return (
    // Rendu "bento" plutôt qu'un simple quadrillage de tableur : chaque
    // employé est une carte flottante à part entière, et la case du jour
    // courant devient une zone arrondie mise en évidence (au lieu d'une
    // simple teinte de fond) — on la repère d'un coup d'œil en descendant le
    // regard le long de la semaine, sans que ça ressemble à un tableau Excel.
    <View>
      <View style={{ flexDirection: "row", marginBottom: spacing.sm }}>
        <View style={{ width: NAME_COL_WIDTH }} />
        {days.map((day, index) => {
          const isToday = isSameLocalDay(day, today);
          return (
            <View key={toLocalDateKey(day)} style={{ flex: 1, minWidth: 0, alignItems: "center", marginHorizontal: spacing.xxs }}>
              {isToday ? (
                <LinearGradient
                  colors={colors.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    minWidth: 44,
                    alignItems: "center",
                    borderRadius: radius.md,
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.sm,
                    // Halo atténué en mode sombre (retour explicite du client).
                    shadowColor: colors.accentBright,
                    shadowOpacity: isDark ? 0.16 : 0.35,
                    shadowRadius: isDark ? 6 : 10,
                    shadowOffset: { width: 0, height: isDark ? 2 : 4 },
                    elevation: isDark ? 2 : 4,
                  }}
                >
                  <Text style={[type.caption, { color: colors.onAccent, fontWeight: "700" }]}>{WEEKDAY_LABELS[index]}</Text>
                  <Text style={[type.headline, { color: colors.onAccent, marginTop: 1 }]}>{day.getDate()}</Text>
                </LinearGradient>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: spacing.xs }}>
                  <Text style={[type.caption, { color: colors.inkTertiary, fontWeight: "700" }]}>{WEEKDAY_LABELS[index]}</Text>
                  <Text style={[type.headline, { color: colors.ink, marginTop: 1 }]}>{day.getDate()}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={{ gap: spacing.sm }}>
        {teamMembers.map((member) => {
          const userMissions = missionsByUserAndDay.get(member.id);
          const isActive = member.isActive !== false;

          return (
            <View
              key={member.id}
              style={{
                flexDirection: "row",
                alignItems: "stretch",
                backgroundColor: colors.backgroundElevated,
                borderRadius: radius.lg,
                padding: spacing.sm,
                shadowColor: colors.shadow,
                shadowOpacity: 0.5,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 1,
              }}
            >
              <View style={{ width: NAME_COL_WIDTH, flexDirection: "row", alignItems: "center", paddingRight: spacing.sm }}>
                <AssigneeAvatar assignee={{ userId: member.id, isLead: false, user: member }} size={36} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                    {member.firstName} {member.lastName}
                  </Text>
                  {isActive ? (
                    <View style={{ marginTop: 2 }}>
                      <WeekHoursLine member={member} plannedMinutes={weeklyMinutesByUser.get(member.id) ?? 0} />
                    </View>
                  ) : (
                    <Text style={[type.caption, { color: colors.neutral, marginTop: 2 }]}>Compte désactivé</Text>
                  )}
                  {!!onDeclareAbsence && isActive && (
                    <PressableScale
                      onPress={() => onDeclareAbsence(member)}
                      accessibilityRole="button"
                      accessibilityLabel={`Enregistrer une absence pour ${member.firstName} ${member.lastName}`}
                      style={{ marginTop: 3, alignSelf: "flex-start" }}
                    >
                      <Text style={[type.caption, { color: colors.accentText, fontWeight: "600" }]}>+ Absence</Text>
                    </PressableScale>
                  )}
                </View>
              </View>

              {days.map((day, index) => {
                const key = toLocalDateKey(day);
                const dayMissions = userMissions?.get(key) ?? [];
                const isToday = isSameLocalDay(day, today);
                const absenceLabel = absentKeys.get(`${member.id}|${key}`);
                const isAbsent = !!absenceLabel;
                const isPast = key < toLocalDateKey(today);
                const canAdd = !!onAddMission && isActive && !isAbsent && !isPast;
                return (
                  <View
                    key={key}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 52,
                      marginHorizontal: spacing.xxs,
                      padding: spacing.xxs,
                      gap: spacing.xxs,
                      justifyContent: "center",
                      borderRadius: radius.md,
                      // Séparation discrète entre les jours d'une même ligne — sans
                      // elle, les cases voisines se confondaient visuellement dès
                      // qu'aucune n'était teintée (aujourd'hui) ou remplie.
                      borderLeftWidth: index > 0 ? 1 : 0,
                      borderLeftColor: colors.border,
                      // Accent (pas gris neutre) : même famille de couleur que le
                      // badge dégradé de l'en-tête — une case vide se lit comme
                      // "c'est aujourd'hui" plutôt que comme un bloc oublié/cassé.
                      backgroundColor: isToday ? colors.accentSoft : "transparent",
                    }}
                  >
                    {dayMissions.map((mission) => {
                      const overdue = isMissionOverdue(mission);
                      const fg = overdue ? colors.warning : MISSION_SOFT_TEXT[mission.status](colors);
                      return (
                        <PressableScale key={mission.id} onPress={() => onPressMission(mission)}>
                          <View
                            accessibilityLabel={overdue ? `${mission.site.name}, non démarrée` : undefined}
                            style={{
                              backgroundColor: overdue ? colors.warningSoft : MISSION_SOFT_BG[mission.status](colors),
                              borderRadius: radius.sm,
                              paddingVertical: 5,
                              paddingHorizontal: 7,
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              {!!overdue && <Ionicons name="alert-circle" size={12} color={fg} style={{ marginRight: 3 }} />}
                              <Text style={[type.caption, { color: fg, fontWeight: "700", flex: 1 }]} numberOfLines={1}>
                                {mission.site.name}
                              </Text>
                            </View>
                            <Text style={[type.caption, { color: fg, opacity: 0.8, marginTop: 1 }]} numberOfLines={1}>
                              {formatMissionTimeRange(mission.startTime, mission.endTime)}
                            </Text>
                          </View>
                        </PressableScale>
                      );
                    })}
                    {!!isAbsent && (
                      <View style={{ backgroundColor: colors.neutralSoft, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 7 }}>
                        <Text style={[type.caption, { color: colors.neutral, fontWeight: "700" }]} numberOfLines={1}>
                          {absenceLabel}
                        </Text>
                      </View>
                    )}
                    {!!canAdd && (
                      <PressableScale
                        onPress={() => onAddMission!(member, day)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ajouter une mission à ${member.firstName} ${member.lastName} le ${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`}
                      >
                        <View
                          style={{
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: dayMissions.length === 0 ? 40 : 24,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderStyle: "dashed",
                            borderColor: colors.border,
                          }}
                        >
                          <Ionicons name="add" size={16} color={colors.inkTertiary} />
                        </View>
                      </PressableScale>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Version téléphone de la grille par personne : l'équipe pour le jour
// sélectionné, les missions de chacun, son absence éventuelle, et un « + »
// qui ouvre une nouvelle mission avec la personne et le jour déjà remplis.
function TeamDayList({
  day,
  today,
  teamMembers,
  missionsByUserAndDay,
  absentKeys,
  weeklyMinutesByUser,
  onDeclareAbsence,
  onPressMission,
  onAddMission,
}: {
  day: Date;
  today: Date;
  teamMembers: MissionAssignee["user"][];
  missionsByUserAndDay: Map<string, Map<string, Mission[]>>;
  absentKeys: Map<string, string>;
  weeklyMinutesByUser: Map<string, number>;
  onDeclareAbsence?: (member: MissionAssignee["user"]) => void;
  onPressMission: (mission: Mission) => void;
  onAddMission?: (member: MissionAssignee["user"]) => void;
}) {
  const { colors, spacing, radius, type } = useTheme();
  const key = toLocalDateKey(day);
  const isPast = key < toLocalDateKey(today);

  if (teamMembers.length === 0) {
    return <StateView kind="empty" icon="people-outline" message="Aucun membre de l'équipe à afficher." />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {teamMembers.map((member) => {
        const dayMissions = missionsByUserAndDay.get(member.id)?.get(key) ?? [];
        const absenceLabel = absentKeys.get(`${member.id}|${key}`);
        const isAbsent = !!absenceLabel;
        const isActive = member.isActive !== false;
        const canAdd = !!onAddMission && isActive && !isAbsent && !isPast;
        return (
          <View
            key={member.id}
            style={{
              backgroundColor: colors.backgroundElevated,
              borderRadius: radius.lg,
              padding: spacing.md,
              shadowColor: colors.shadow,
              shadowOpacity: 0.5,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <AssigneeAvatar assignee={{ userId: member.id, isLead: false, user: member }} size={36} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                  {member.firstName} {member.lastName}
                </Text>
                <Text style={[type.caption, { color: isAbsent ? colors.neutral : colors.inkTertiary, marginTop: 1 }]}>
                  {isAbsent
                    ? `${absenceLabel} ce jour-là`
                    : dayMissions.length === 0
                      ? "Disponible"
                      : `${dayMissions.length} mission${dayMissions.length > 1 ? "s" : ""}`}
                </Text>
                {isActive && <WeekHoursLine member={member} plannedMinutes={weeklyMinutesByUser.get(member.id) ?? 0} />}
              </View>
              {!!onDeclareAbsence && isActive && !isAbsent && (
                <PressableScale
                  onPress={() => onDeclareAbsence(member)}
                  accessibilityRole="button"
                  accessibilityLabel={`Enregistrer une absence pour ${member.firstName} ${member.lastName}`}
                  style={{ marginRight: spacing.xs }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.neutralSoft,
                    }}
                  >
                    <Ionicons name="medkit-outline" size={18} color={colors.neutral} />
                  </View>
                </PressableScale>
              )}
              {!!canAdd && (
                <PressableScale
                  onPress={() => onAddMission!(member)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter une mission à ${member.firstName} ${member.lastName}`}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.accentSoft,
                    }}
                  >
                    <Ionicons name="add" size={20} color={colors.accent} />
                  </View>
                </PressableScale>
              )}
            </View>
            {dayMissions.length > 0 && (
              <View style={{ marginTop: spacing.sm, gap: spacing.xxs }}>
                {dayMissions.map((mission) => {
                  const overdue = isMissionOverdue(mission);
                  const fg = overdue ? colors.warning : MISSION_SOFT_TEXT[mission.status](colors);
                  return (
                    <PressableScale key={mission.id} onPress={() => onPressMission(mission)}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: overdue ? colors.warningSoft : MISSION_SOFT_BG[mission.status](colors),
                          borderRadius: radius.sm,
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text style={[type.caption, { color: fg, fontWeight: "700" }]}>
                          {formatMissionTimeRange(mission.startTime, mission.endTime)}
                        </Text>
                        <Text style={[type.caption, { color: fg, marginLeft: 6, flex: 1 }]} numberOfLines={1}>
                          {mission.site.name}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bande "hero" en plein-bord : la ScreenContainer applique un padding
  // horizontal uniforme à tout l'écran, on le neutralise ici pour créer une
  // rupture visuelle nette avec la liste de missions en dessous.
  heroBleed: {
    overflow: "hidden",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  desktopCreateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, paddingHorizontal: 16 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
  },
  fabInner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
