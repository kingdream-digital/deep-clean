import { MissionStatus, ProblemStatus, Role, ValidationType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { calendarDay, companyDateKey } from "../../utils/companyTime";

// Suivi des chantiers du superviseur (retour explicite du client) : sur un
// seul écran, tous les chantiers dont il est responsable, ce qui a été fait
// dans le mois, et surtout ce qui ne va pas — repérable au premier coup
// d'œil, chantiers à problème en tête.

interface Actor {
  userId: string;
  role: Role;
}

const OVERVIEW_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

export type SiteHealth = "alert" | "attention" | "ok";

export interface SupervisionAlert {
  kind: "missed" | "problem" | "toValidate" | "toSchedule";
  count: number;
  label: string;
}

export interface SupervisionSite {
  id: string;
  name: string;
  address: string;
  supervisor: { id: string; firstName: string; lastName: string } | null;
  target: number | null;
  scheduled: number;
  completed: number;
  completionRate: number | null;
  missed: number;
  toValidate: number;
  openProblems: number;
  oldestProblemDays: number | null;
  toSchedule: number;
  health: SiteHealth;
  alerts: SupervisionAlert[];
}

export interface Supervision {
  period: string;
  totals: {
    sites: number;
    sitesOk: number;
    sitesWithAlert: number;
    target: number;
    scheduled: number;
    completed: number;
    completionRate: number | null;
    previousCompleted: number;
    missed: number;
    openProblems: number;
    toValidate: number;
  };
  sites: SupervisionSite[];
}

function bounds(period: string) {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { start: calendarDay(`${period}-01`), end: calendarDay(`${next}-01`), prevStart: calendarDay(`${prev}-01`) };
}

function sameDayPreviousMonthEnd(period: string, prevStart: Date, start: Date, now: Date): Date {
  const today = companyDateKey(now);
  if (today.slice(0, 7) !== period) return start;
  const day = Number(today.slice(8, 10));
  const cut = new Date(prevStart.getTime() + day * 86_400_000);
  return cut < start ? cut : start;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export async function getSupervision(actor: Actor, period: string, now = new Date()): Promise<Supervision> {
  if (actor.role !== Role.SUPERVISOR && !OVERVIEW_ROLES.includes(actor.role)) throw ApiError.forbidden();
  const { start, end, prevStart } = bounds(period);

  // Superviseur : ses chantiers. RH / direction / admin : tous.
  const sites = await prisma.site.findMany({
    where: { isActive: true, ...(actor.role === Role.SUPERVISOR ? { supervisorId: actor.userId } : {}) },
    select: { id: true, name: true, address: true, supervisor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { name: "asc" },
  });
  const ids = sites.map((s) => s.id);
  if (ids.length === 0) {
    return {
      period,
      totals: { sites: 0, sitesOk: 0, sitesWithAlert: 0, target: 0, scheduled: 0, completed: 0, completionRate: null, previousCompleted: 0, missed: 0, openProblems: 0, toValidate: 0 },
      sites: [],
    };
  }

  const [targets, missions, previousCompleted, problems] = await Promise.all([
    prisma.siteTarget.findMany({ where: { siteId: { in: ids }, period }, select: { siteId: true, plannedVisits: true } }),
    prisma.mission.findMany({
      where: { siteId: { in: ids }, date: { gte: start, lt: end } },
      select: { siteId: true, status: true, endTime: true, validations: { where: { type: ValidationType.MISSION_COMPLETION }, select: { id: true } } },
    }),
    // Mois en cours : comparé au mois précédent à la même date (le 10 contre
    // le 10), pour une comparaison juste, jamais un mois entamé contre un
    // mois complet.
    prisma.mission.count({ where: { siteId: { in: ids }, date: { gte: prevStart, lt: sameDayPreviousMonthEnd(period, prevStart, start, now) }, status: MissionStatus.COMPLETED } }),
    // Problèmes encore ouverts, quel que soit le mois de signalement.
    prisma.problem.findMany({
      where: { siteId: { in: ids }, status: { in: [ProblemStatus.NEW, ProblemStatus.IN_PROGRESS] } },
      select: { siteId: true, createdAt: true },
    }),
  ]);
  const targetBySite = new Map(targets.map((t) => [t.siteId, t.plannedVisits]));

  const rows: SupervisionSite[] = sites.map((site) => {
    const mine = missions.filter((m) => m.siteId === site.id);
    const active = mine.filter((m) => m.status !== MissionStatus.CANCELLED);
    const completed = mine.filter((m) => m.status === MissionStatus.COMPLETED).length;
    // Prévue, heure de fin passée, jamais démarrée : à traiter tout de suite.
    const missed = mine.filter((m) => m.status === MissionStatus.SCHEDULED && m.endTime < now).length;
    const toValidate = mine.filter((m) => m.status === MissionStatus.COMPLETED && m.validations.length === 0).length;
    const siteProblems = problems.filter((p) => p.siteId === site.id);
    const oldest = siteProblems.reduce<Date | null>((min, p) => (!min || p.createdAt < min ? p.createdAt : min), null);
    const oldestProblemDays = oldest ? Math.floor((now.getTime() - oldest.getTime()) / 86_400_000) : null;
    const target = targetBySite.get(site.id) ?? null;
    const toSchedule = target != null ? Math.max(0, target - active.length) : 0;
    const completionRate = target ? Math.min(100, Math.round((completed / target) * 100)) : active.length ? Math.round((completed / active.length) * 100) : null;

    const alerts: SupervisionAlert[] = [];
    if (missed > 0) alerts.push({ kind: "missed", count: missed, label: `${plural(missed, "intervention prévue non réalisée", "interventions prévues non réalisées")}` });
    if (siteProblems.length > 0)
      alerts.push({
        kind: "problem",
        count: siteProblems.length,
        label: `${plural(siteProblems.length, "problème ouvert", "problèmes ouverts")}${oldestProblemDays && oldestProblemDays >= 2 ? ` (depuis ${oldestProblemDays} j)` : ""}`,
      });
    if (toValidate > 0) alerts.push({ kind: "toValidate", count: toValidate, label: `${plural(toValidate, "mission terminée à valider", "missions terminées à valider")}` });
    if (toSchedule > 0) alerts.push({ kind: "toSchedule", count: toSchedule, label: `${plural(toSchedule, "intervention à programmer", "interventions à programmer")}` });

    // Rouge : une intervention ratée, ou un problème qui traîne depuis plus de 2 jours.
    const health: SiteHealth = missed > 0 || (oldestProblemDays ?? 0) >= 2 ? "alert" : alerts.length > 0 ? "attention" : "ok";
    return {
      id: site.id,
      name: site.name,
      address: site.address,
      supervisor: site.supervisor,
      target,
      scheduled: active.length,
      completed,
      completionRate,
      missed,
      toValidate,
      openProblems: siteProblems.length,
      oldestProblemDays,
      toSchedule,
      health,
      alerts,
    };
  });

  // Les chantiers qui demandent une action d'abord.
  const rank: Record<SiteHealth, number> = { alert: 0, attention: 1, ok: 2 };
  rows.sort((a, b) => rank[a.health] - rank[b.health] || b.alerts.length - a.alerts.length || a.name.localeCompare(b.name, "fr"));

  const sum = (f: (s: SupervisionSite) => number) => rows.reduce((n, s) => n + f(s), 0);
  const target = sum((s) => s.target ?? 0);
  const completed = sum((s) => s.completed);
  const scheduled = sum((s) => s.scheduled);
  return {
    period,
    totals: {
      sites: rows.length,
      sitesOk: rows.filter((s) => s.health === "ok").length,
      sitesWithAlert: rows.filter((s) => s.health === "alert").length,
      target,
      scheduled,
      completed,
      completionRate: target ? Math.min(100, Math.round((completed / target) * 100)) : scheduled ? Math.round((completed / scheduled) * 100) : null,
      previousCompleted,
      missed: sum((s) => s.missed),
      openProblems: sum((s) => s.openProblems),
      toValidate: sum((s) => s.toValidate),
    },
    sites: rows,
  };
}
