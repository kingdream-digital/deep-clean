import { MissionStatus, ProblemStatus, ProblemType, Role, ValidationType } from "@prisma/client";
import { prisma } from "../../db/prisma";

export async function getOverview() {
  const now = new Date();
  // `Mission.date` est toujours stocké à minuit local (voir `combineDateTime`
  // dans missions.service.ts) — comparer avec `now` (un instant en cours de
  // journée) excluait à tort les missions du jour même dès que l'heure
  // dépassait minuit. On compare avec le début de la journée locale.
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalSites,
    activeSites,
    totalEmployees,
    activeEmployees,
    missionsScheduled,
    missionsInProgress,
    missionsCompleted,
    missionsCancelled,
    upcomingMissions7Days,
    openProblems,
    resolvedProblems,
    validatedProblems,
    missingMaterialProblems,
    validatedMissions,
  ] = await Promise.all([
    prisma.site.count(),
    prisma.site.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: Role.EMPLOYEE } }),
    prisma.user.count({ where: { role: Role.EMPLOYEE, isActive: true } }),
    prisma.mission.count({ where: { status: MissionStatus.SCHEDULED } }),
    prisma.mission.count({ where: { status: MissionStatus.IN_PROGRESS } }),
    prisma.mission.count({ where: { status: MissionStatus.COMPLETED } }),
    prisma.mission.count({ where: { status: MissionStatus.CANCELLED } }),
    prisma.mission.count({
      where: {
        status: { in: [MissionStatus.SCHEDULED, MissionStatus.IN_PROGRESS] },
        date: { gte: todayStart, lte: in7Days },
      },
    }),
    prisma.problem.count({ where: { status: { in: [ProblemStatus.NEW, ProblemStatus.IN_PROGRESS] } } }),
    prisma.problem.count({ where: { status: ProblemStatus.RESOLVED } }),
    prisma.problem.count({ where: { status: ProblemStatus.VALIDATED } }),
    prisma.problem.count({ where: { type: ProblemType.MISSING_MATERIAL } }),
    prisma.validation.count({ where: { type: ValidationType.MISSION_COMPLETION } }),
  ]);

  const validationRate = missionsCompleted > 0 ? Math.round((validatedMissions / missionsCompleted) * 100) : 0;

  return {
    generatedAt: now.toISOString(),
    sites: { total: totalSites, active: activeSites },
    employees: { total: totalEmployees, active: activeEmployees },
    missions: {
      scheduled: missionsScheduled,
      inProgress: missionsInProgress,
      completed: missionsCompleted,
      cancelled: missionsCancelled,
      upcoming7Days: upcomingMissions7Days,
    },
    problems: {
      open: openProblems,
      resolved: resolvedProblems,
      validated: validatedProblems,
      missingMaterial: missingMaterialProblems,
    },
    validations: {
      validatedMissions,
      completedMissions: missionsCompleted,
      validationRatePercent: validationRate,
    },
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const TREND_WEEKS = 8;
const LOAD_WINDOW_DAYS = 30;
const TOP_SITES_LIMIT = 5;

function toWeekStartString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Statistiques de tendance pour le tableau de bord Direction (au-delà des
 * simples compteurs bruts de `getOverview`) : évolution hebdomadaire des
 * missions terminées/annulées et du taux de validation sur les 8 dernières
 * semaines, chantiers qui concentrent le plus de signalements, et charge de
 * travail par employé — de quoi repérer une tendance ou un déséquilibre
 * plutôt qu'une seule photo instantanée.
 */
export async function getTrends() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const trendRangeStart = new Date(todayStart.getTime() - (TREND_WEEKS - 1) * MS_PER_WEEK);
  const loadRangeStart = new Date(todayStart.getTime() - LOAD_WINDOW_DAYS * MS_PER_DAY);

  const [missionsInRange, problemsInRange, completedAssignmentsInRange] = await Promise.all([
    prisma.mission.findMany({
      where: {
        date: { gte: trendRangeStart },
        status: { in: [MissionStatus.COMPLETED, MissionStatus.CANCELLED] },
      },
      select: { date: true, status: true, validations: { select: { type: true } } },
    }),
    prisma.problem.findMany({
      where: { createdAt: { gte: loadRangeStart } },
      select: { siteId: true, site: { select: { name: true } } },
    }),
    prisma.missionAssignment.findMany({
      where: { mission: { status: MissionStatus.COMPLETED, date: { gte: loadRangeStart } } },
      select: { userId: true, user: { select: { firstName: true, lastName: true, avatarKey: true } } },
    }),
  ]);

  // Regroupement hebdomadaire (semaines glissantes de `trendRangeStart` à
  // aujourd'hui, jamais des semaines calendaires) : simple et robuste, sans
  // dépendre du dialecte SQL pour un tronquage de date.
  const weekBuckets = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const weekStart = new Date(trendRangeStart.getTime() + i * MS_PER_WEEK);
    return { weekStart, completed: 0, cancelled: 0, validated: 0 };
  });
  for (const mission of missionsInRange) {
    const weekIndex = Math.min(
      TREND_WEEKS - 1,
      Math.max(0, Math.floor((mission.date.getTime() - trendRangeStart.getTime()) / MS_PER_WEEK))
    );
    const bucket = weekBuckets[weekIndex];
    if (!bucket) continue;
    if (mission.status === MissionStatus.COMPLETED) {
      bucket.completed += 1;
      if (mission.validations.some((v) => v.type === ValidationType.MISSION_COMPLETION)) bucket.validated += 1;
    } else {
      bucket.cancelled += 1;
    }
  }
  const weeklyMissionTrends = weekBuckets.map((b) => ({
    weekStart: toWeekStartString(b.weekStart),
    completed: b.completed,
    cancelled: b.cancelled,
    validated: b.validated,
    validationRatePercent: b.completed > 0 ? Math.round((b.validated / b.completed) * 100) : 0,
  }));

  const problemsBySite = new Map<string, { siteName: string; count: number }>();
  for (const p of problemsInRange) {
    const entry = problemsBySite.get(p.siteId) ?? { siteName: p.site.name, count: 0 };
    entry.count += 1;
    problemsBySite.set(p.siteId, entry);
  }
  const topProblemSites = [...problemsBySite.entries()]
    .map(([siteId, v]) => ({ siteId, siteName: v.siteName, problemCount: v.count }))
    .sort((a, b) => b.problemCount - a.problemCount)
    .slice(0, TOP_SITES_LIMIT);

  // Prénom/nom séparés et `hasAvatar` (jamais la clé de stockage) : l'app
  // affiche la photo de chaque personne, comme dans le reste des listes.
  const loadByEmployee = new Map<string, { name: string; firstName: string; lastName: string; hasAvatar: boolean; count: number }>();
  for (const a of completedAssignmentsInRange) {
    const entry = loadByEmployee.get(a.userId) ?? {
      name: `${a.user.firstName} ${a.user.lastName}`,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      hasAvatar: Boolean(a.user.avatarKey),
      count: 0,
    };
    entry.count += 1;
    loadByEmployee.set(a.userId, entry);
  }
  const employeeLoad = [...loadByEmployee.entries()]
    .map(([userId, v]) => ({
      userId,
      name: v.name,
      firstName: v.firstName,
      lastName: v.lastName,
      hasAvatar: v.hasAvatar,
      completedMissions: v.count,
    }))
    .sort((a, b) => b.completedMissions - a.completedMissions);

  return {
    generatedAt: now.toISOString(),
    weeklyMissionTrends,
    topProblemSites,
    employeeLoad: { windowDays: LOAD_WINDOW_DAYS, items: employeeLoad },
  };
}
