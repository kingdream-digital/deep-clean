import { useCallback, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type { Ionicons } from "@expo/vector-icons";
import { listMissions } from "../../api/missions.api";
import type { Mission } from "../../api/missions.api";
import { listProblems } from "../../api/problems.api";
import { listUsers } from "../../api/users.api";
import { listSites } from "../../api/sites.api";
import { getStatsOverview } from "../../api/stats.api";
import { listTimeEntries } from "../../api/timesheets.api";
import type { StatsOverview } from "../../api/stats.api";
import { listNotifications } from "../../api/notifications.api";
import type { AppNotification } from "../../api/notifications.api";
import { listAnnouncements } from "../../api/announcements.api";
import type { Announcement } from "../../api/announcements.api";
import type { AuthUser } from "../../api/auth.api";
import { addDays, isMissionOverdue, mondayOf, toLocalDateKey } from "../../utils/missionFormat";
import { readCache, writeCache } from "../../offline/cache";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  tone: "accent" | "info" | "purple" | "warning" | "success" | "danger" | "neutral";
  // Facultative (rétrocompatible) — une puce icône au-dessus du chiffre,
  // façon Apple Santé, plutôt qu'un chiffre coloré nu (voir KpiGrid.tsx).
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface DashboardData {
  kpis: KpiTile[];
  weekMissions: Mission[];
  weekStart: Date;
  recentActivity: AppNotification[];
  // Mission en cours (statut IN_PROGRESS) et prochaine mission programmée —
  // pour que l'employé sache "où je dois aller, quand" dès l'ouverture de
  // l'appli, sans avoir à taper jusqu'au Planning (cahier des charges §13/§16).
  currentMission: Mission | null;
  nextMission: Mission | null;
  /** Mission planifiée dont l'heure de fin est déjà passée, jamais démarrée. */
  overdueMission: Mission | null;
  // Dernière actualité publiée (RH/Superviseur/Direction/Admin) — même
  // logique que "mission en cours" ci-dessus : visible dès l'accueil, sans
  // avoir à aller jusqu'à l'écran "Actualités" dédié.
  latestAnnouncement: Announcement | null;
}

const EMPTY: DashboardData = {
  kpis: [],
  weekMissions: [],
  weekStart: new Date(),
  recentActivity: [],
  currentMission: null,
  nextMission: null,
  overdueMission: null,
  latestAnnouncement: null,
};

function findCurrentAndNextMission(missions: Mission[]): {
  currentMission: Mission | null;
  nextMission: Mission | null;
  overdueMission: Mission | null;
} {
  const sorted = [...missions].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const now = Date.now();
  const scheduled = sorted.filter((m) => m.status === "SCHEDULED");

  // Une mission planifiée dont l'heure de fin est passée sans que personne ne
  // l'ait démarrée n'est pas "la prochaine" : elle était présentée comme telle
  // à 14h alors qu'elle se terminait à 9h le matin même, laissant croire à
  // l'employé qu'il devait encore s'y rendre. On la signale pour ce qu'elle
  // est — une mission non démarrée — et "la prochaine" devient la première
  // qui est réellement encore à venir.
  return {
    currentMission: sorted.find((m) => m.status === "IN_PROGRESS") ?? null,
    nextMission: scheduled.find((m) => !isMissionOverdue(m, now)) ?? null,
    overdueMission: scheduled.find((m) => isMissionOverdue(m, now)) ?? null,
  };
}

// Deux appels légers (pageSize:1) juste pour lire les totaux exposés par
// l'API de listing — jamais de second endpoint dédié aux compteurs.
async function countOpenProblems(params: { missionId?: string } = {}): Promise<number> {
  const [nw, inProgress] = await Promise.all([
    listProblems({ ...params, status: "NEW" }),
    listProblems({ ...params, status: "IN_PROGRESS" }),
  ]);
  return nw.total + inProgress.total;
}

async function loadForRole(user: AuthUser): Promise<DashboardData> {
  const weekStart = mondayOf(new Date());
  const weekEnd = addDays(weekStart, 6);
  // « Activité récente » = l'activité de l'entreprise (missions, pointages,
  // signalements, validations, congés). Les notifications de nouveaux messages
  // en sont écartées : elles occupaient les cinq lignes du bloc, ne laissant
  // rien voir du métier, alors qu'elles ont déjà leur onglet dédié et son badge.
  const notifPromise = listNotifications(1, 5, { excludeMessages: true });
  const announcementPromise = listAnnouncements(1, 1);

  if (user.role === "HR") {
    // La RH crée et gère le planning au même titre que la direction — vue
    // hebdomadaire globale (tous chantiers), plus ses indicateurs de gestion
    // des comptes.
    const [total, active, openProblems, weekRes, notifRes, announcementRes] = await Promise.all([
      listUsers(),
      listUsers({ isActive: true }),
      countOpenProblems(),
      listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) }),
      notifPromise,
      announcementPromise,
    ]);
    const today = toLocalDateKey(new Date());
    const todayCount = weekRes.items.filter((m) => m.date.slice(0, 10) === today).length;
    return {
      weekMissions: weekRes.items,
      weekStart,
      recentActivity: notifRes.items,
      currentMission: null,
      nextMission: null,
      overdueMission: null,
      latestAnnouncement: announcementRes.items[0] ?? null,
      kpis: [
        { key: "today", label: "Missions aujourd'hui", value: String(todayCount), tone: "accent", icon: "today-outline" },
        { key: "active", label: `Comptes actifs sur ${total.total}`, value: String(active.total), tone: "info", icon: "people-outline" },
        { key: "problems", label: "Signalements ouverts", value: String(openProblems), tone: "danger", icon: "warning-outline" },
      ],
    };
  }

  if (user.role === "DIRECTOR" || user.role === "ADMIN") {
    const [overview, weekRes, notifRes, announcementRes] = await Promise.all([
      getStatsOverview(),
      listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) }),
      notifPromise,
      announcementPromise,
    ]);
    return {
      weekMissions: weekRes.items,
      weekStart,
      recentActivity: notifRes.items,
      currentMission: null,
      nextMission: null,
      overdueMission: null,
      latestAnnouncement: announcementRes.items[0] ?? null,
      kpis: statsToKpis(overview),
    };
  }

  if (user.role === "SITE_MANAGER") {
    const [weekRes, sitesRes, openProblems, notifRes, announcementRes] = await Promise.all([
      listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) }),
      listSites({ isActive: true }),
      countOpenProblems(),
      notifPromise,
      announcementPromise,
    ]);
    const today = toLocalDateKey(new Date());
    const todayCount = weekRes.items.filter((m) => m.date.slice(0, 10) === today).length;
    const teamSize = new Set(weekRes.items.flatMap((m) => m.assignments.map((a) => a.userId))).size;
    return {
      weekMissions: weekRes.items,
      weekStart,
      recentActivity: notifRes.items,
      currentMission: null,
      nextMission: null,
      overdueMission: null,
      latestAnnouncement: announcementRes.items[0] ?? null,
      kpis: [
        { key: "today", label: "Missions aujourd'hui", value: String(todayCount), tone: "accent", icon: "today-outline" },
        { key: "team", label: "Employés mobilisés", value: String(teamSize), tone: "info", icon: "people-outline" },
        { key: "sites", label: "Chantiers gérés", value: String(sitesRes.total), tone: "purple", icon: "business-outline" },
        { key: "problems", label: "Signalements ouverts", value: String(openProblems), tone: "danger", icon: "warning-outline" },
      ],
    };
  }

  if (user.role === "SUPERVISOR") {
    // Le superviseur pilote le planning et valide les heures : ses indicateurs
    // sont ceux de l'équipe, pas ceux d'un employé. Il tombait jusqu'ici dans
    // la branche employé ci-dessous — « Mes signalements ouverts » comptait en
    // réalité ceux de toute l'entreprise, et une mission dont il n'était pas
    // membre lui était présentée comme « sa » mission non démarrée, avec le
    // conseil « Prévenez votre chef d'équipe ».
    const [weekRes, openProblems, pendingRes, notifRes, announcementRes] = await Promise.all([
      listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) }),
      countOpenProblems(),
      listTimeEntries({ status: "PENDING", pageSize: 1 }),
      notifPromise,
      announcementPromise,
    ]);
    const today = toLocalDateKey(new Date());
    const todayCount = weekRes.items.filter((m) => m.date.slice(0, 10) === today).length;
    const overdueCount = weekRes.items.filter((m) => isMissionOverdue(m)).length;
    return {
      weekMissions: weekRes.items,
      weekStart,
      recentActivity: notifRes.items,
      currentMission: null,
      nextMission: null,
      overdueMission: null,
      latestAnnouncement: announcementRes.items[0] ?? null,
      kpis: [
        { key: "today", label: "Missions aujourd'hui", value: String(todayCount), tone: "accent", icon: "today-outline" },
        { key: "overdue", label: "Non démarrées cette semaine", value: String(overdueCount), tone: "warning", icon: "alert-circle-outline" },
        { key: "timesheets", label: "Pointages à valider", value: String(pendingRes.total), tone: "success", icon: "checkmark-done-outline" },
        { key: "problems", label: "Signalements ouverts", value: String(openProblems), tone: "danger", icon: "warning-outline" },
      ],
    };
  }

  // EMPLOYEE
  const [weekRes, upcomingRes, openProblems, notifRes, announcementRes] = await Promise.all([
    listMissions({ from: toLocalDateKey(weekStart), to: toLocalDateKey(weekEnd) }),
    // Depuis la veille : une mission de nuit commencée hier reste la mission actuelle.
    listMissions({ from: toLocalDateKey(addDays(new Date(), -1)), to: toLocalDateKey(addDays(new Date(), 7)) }),
    countOpenProblems(),
    notifPromise,
    announcementPromise,
  ]);
  const today = toLocalDateKey(new Date());
  const todayCount = weekRes.items.filter((m) => m.date.slice(0, 10) === today).length;
  const { currentMission, nextMission, overdueMission } = findCurrentAndNextMission(upcomingRes.items);
  return {
    weekMissions: weekRes.items,
    weekStart,
    recentActivity: notifRes.items,
    currentMission,
    nextMission,
    overdueMission,
    latestAnnouncement: announcementRes.items[0] ?? null,
    kpis: [
      { key: "today", label: "Missions aujourd'hui", value: String(todayCount), tone: "accent", icon: "today-outline" },
      { key: "upcoming", label: "À venir (7 jours)", value: String(upcomingRes.items.filter((m) => m.date.slice(0, 10) >= today).length), tone: "info", icon: "time-outline" },
      { key: "problems", label: "Signalements ouverts", value: String(openProblems), tone: "danger", icon: "warning-outline" },
    ],
  };
}

function statsToKpis(overview: StatsOverview): KpiTile[] {
  return [
    {
      key: "upcoming",
      label: "Missions à venir (7j)",
      value: String(overview.missions.upcoming7Days),
      tone: "accent",
      icon: "calendar-outline",
    },
    { key: "inProgress", label: "Missions en cours", value: String(overview.missions.inProgress), tone: "success", icon: "play" },
    {
      key: "employees",
      label: `Employés actifs sur ${overview.employees.total}`,
      value: String(overview.employees.active),
      tone: "info",
      icon: "people-outline",
    },
    {
      key: "sites",
      label: `Chantiers actifs sur ${overview.sites.total}`,
      value: String(overview.sites.active),
      tone: "purple",
      icon: "business-outline",
    },
  ];
}

// Charge le nécessaire pour le tableau de bord "sans clic" — un seul aller-retour
// réseau par focus d'écran, uniquement avec des endpoints déjà autorisés pour le
// rôle courant côté serveur (aucune nouvelle route, aucune donnée inventée).
export function useDashboardData(user: AuthUser | null) {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    if (!user) return;
    // Clé propre à la personne : le cache est vidé à chaque fin de session
    // (voir offline/cache.ts), mais on ne mélange jamais deux comptes.
    const cacheKey = `dashboard.${user.id}`;
    try {
      if (!silent) setState("loading");
      const result = await loadForRole(user);
      setData(result);
      setOfflineCachedAt(null);
      setState("ready");
      void writeCache(cacheKey, result);
    } catch {
      // Hors connexion : on ressert le dernier tableau de bord connu, avec le
      // bandeau « Hors connexion » (comme le Planning), plutôt qu'un « Un
      // problème est survenu » affiché au-dessus de ces mêmes données.
      const net = await NetInfo.fetch();
      const cached = net.isConnected === false ? await readCache<DashboardData>(cacheKey) : null;
      if (cached) {
        setData({ ...cached.data, weekStart: new Date(cached.data.weekStart) });
        setOfflineCachedAt(cached.cachedAt);
        setState("ready");
      } else {
        if (!silent) setState("error");
      }
    }
  }, [user]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { data, state, offlineCachedAt, reload: load };
}
