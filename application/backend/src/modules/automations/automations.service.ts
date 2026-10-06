import { AbsenceStatus, InvoiceStatus, MissionStatus, Prisma, QuoteStatus, Role, TimeEntryStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../config/logger";
import { addDaysToKey, calendarDay, companyDateKey, companyDayStart, companyLongDayLabel, companyTimeKey } from "../../utils/companyTime";
import { createNotification } from "../notifications/notifications.service";
import type { NotificationEntityType } from "../notifications/notifications.service";

// Automatisations du quotidien (retour explicite du client : « on pousse le
// système d'automatisation en profondeur »). Chaque rappel a une clé unique
// enregistrée en base (AutomationEvent) : il part une seule fois, même si la
// tâche tourne plusieurs fois ou si le serveur redémarre. Destinataires
// toujours choisis selon le lien réel avec l'élément (affecté, responsable,
// rôle de validation), jamais selon qui a fait l'action.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Réglages (valeurs proposées au client). */
export const AUTOMATION_SETTINGS = {
  clockInReminderMinutes: 15, // pointage d'arrivée oublié
  clockOutReminderMinutes: 30, // sortie oubliée après la fin de la mission
  openEntryWithoutMissionHours: 10, // pointage ouvert sans mission
  missionNoShowMinutes: 30, // personne n'a pointé sur la mission
  quoteReminderEveryDays: 2, // devis en brouillon / validé non envoyé
  quoteFollowUpAfterDays: 7, // devis envoyé sans réponse
  maxReminders: 3,
  absencePendingHours: 48,
} as const;

/** Réserve la clé ; faux si ce rappel est déjà parti. */
async function once(key: string): Promise<boolean> {
  try {
    await prisma.automationEvent.create({ data: { key } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

async function remind(key: string, userIds: Iterable<string>, title: string, body: string, entityType: NotificationEntityType, entityId: string): Promise<number> {
  let sent = 0;
  for (const userId of new Set(userIds)) {
    if (!(await once(`${key}:${userId}`))) continue;
    await createNotification({ userId, type: "REMINDER", title, body, relatedEntityType: entityType, relatedEntityId: entityId });
    sent++;
  }
  return sent;
}

async function activeUsers(roles: Role[]): Promise<string[]> {
  return (await prisma.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } })).map((u) => u.id);
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

// ---------------------------------------------------------------------------
// Pointages et missions (toutes les 5 minutes)
// ---------------------------------------------------------------------------

export async function runFieldReminders(now = new Date()): Promise<number> {
  const s = AUTOMATION_SETTINGS;
  let sent = 0;

  // Missions commencées depuis 15 min à 3 h.
  const started = await prisma.mission.findMany({
    where: {
      status: { in: [MissionStatus.SCHEDULED, MissionStatus.IN_PROGRESS] },
      startTime: { lte: new Date(now.getTime() - s.clockInReminderMinutes * 60_000), gte: new Date(now.getTime() - 3 * HOUR) },
      endTime: { gt: now },
    },
    select: {
      id: true, title: true, date: true, startTime: true,
      site: { select: { name: true, managerId: true } },
      assignments: { select: { userId: true, user: { select: { isActive: true } } } },
    },
  });
  for (const mission of started) {
    const assigned = mission.assignments.filter((a) => a.user.isActive).map((a) => a.userId);
    if (assigned.length === 0) continue;
    const [entries, absences] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId: { in: assigned }, clockIn: { gte: new Date(mission.startTime.getTime() - 2 * HOUR), lte: now }, status: { not: TimeEntryStatus.REJECTED } },
        select: { userId: true },
      }),
      prisma.absence.findMany({
        where: { userId: { in: assigned }, status: AbsenceStatus.APPROVED, startDate: { lte: mission.date }, endDate: { gte: mission.date } },
        select: { userId: true },
      }),
    ]);
    const clocked = new Set(entries.map((e) => e.userId));
    const absent = new Set(absences.map((a) => a.userId));
    const missing = assigned.filter((u) => !clocked.has(u) && !absent.has(u));
    const at = companyTimeKey(mission.startTime);
    for (const userId of missing) {
      sent += await remind(`clockin:${mission.id}`, [userId], "Pointage d'arrivée oublié ?", `Votre mission « ${mission.title} » (${mission.site.name}) a commencé à ${at}. Pensez à pointer votre arrivée.`, "Mission", mission.id);
    }
    // Personne n'a pointé 30 min après le début : l'encadrement est prévenu.
    const present = assigned.filter((u) => !absent.has(u));
    if (present.length > 0 && present.every((u) => !clocked.has(u)) && now.getTime() - mission.startTime.getTime() >= s.missionNoShowMinutes * 60_000) {
      const supervisors = await activeUsers([Role.SUPERVISOR]);
      sent += await remind(
        `noshow:${mission.id}`,
        [...supervisors, ...(mission.site.managerId ? [mission.site.managerId] : [])],
        "Personne n'a pointé",
        `Mission « ${mission.title} » (${mission.site.name}), début ${at} : aucun pointage d'arrivée pour l'instant.`,
        "Mission",
        mission.id
      );
    }
  }

  // Sorties oubliées : pointage encore ouvert après la fin de la mission.
  const open = await prisma.timeEntry.findMany({
    where: { clockOut: null, clockIn: { lte: new Date(now.getTime() - 30 * 60_000) } },
    select: { id: true, userId: true, clockIn: true },
  });
  for (const entry of open) {
    const mission = await prisma.mission.findFirst({
      where: { status: { not: MissionStatus.CANCELLED }, assignments: { some: { userId: entry.userId } }, startTime: { lte: new Date(entry.clockIn.getTime() + 2 * HOUR) }, endTime: { gte: entry.clockIn } },
      orderBy: { endTime: "desc" },
      select: { title: true, endTime: true },
    });
    const late = mission
      ? now.getTime() - mission.endTime.getTime() >= s.clockOutReminderMinutes * 60_000
      : now.getTime() - entry.clockIn.getTime() >= s.openEntryWithoutMissionHours * HOUR;
    if (!late) continue;
    sent += await remind(
      `clockout:${entry.id}`,
      [entry.userId],
      "Sortie oubliée ?",
      mission
        ? `Votre mission « ${mission.title} » devait se terminer à ${companyTimeKey(mission.endTime)} et vous êtes toujours pointé. Pensez à pointer votre sortie.`
        : `Vous êtes pointé depuis ${companyTimeKey(entry.clockIn)}. Pensez à pointer votre sortie.`,
      "TimeEntry",
      entry.id
    );
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Rappel de la veille (18 h)
// ---------------------------------------------------------------------------

export async function runEveReminders(now = new Date()): Promise<number> {
  const tomorrow = addDaysToKey(companyDateKey(now), 1);
  const missions = await prisma.mission.findMany({
    where: { date: calendarDay(tomorrow), status: { not: MissionStatus.CANCELLED } },
    select: { id: true, title: true, startTime: true, site: { select: { name: true } }, assignments: { select: { userId: true, user: { select: { isActive: true } } } } },
    orderBy: { startTime: "asc" },
  });
  const byUser = new Map<string, typeof missions>();
  for (const m of missions) for (const a of m.assignments) if (a.user.isActive) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), m]);
  let sent = 0;
  for (const [userId, list] of byUser) {
    const first = list[0]!;
    sent += await remind(
      `eve:${tomorrow}`,
      [userId],
      list.length > 1 ? `Demain : ${plural(list.length, "mission")}` : "Votre mission de demain",
      `${companyLongDayLabel(first.startTime).replace(/^./, (c) => c.toUpperCase())}, première à ${companyTimeKey(first.startTime)} : « ${first.title} » — ${first.site.name}.`,
      "Mission",
      first.id
    );
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Récapitulatif du matin (8 h) et demandes d'absence en attente
// ---------------------------------------------------------------------------

export async function runMorningDigest(now = new Date()): Promise<number> {
  const today = companyDateKey(now);
  let sent = 0;
  const [pendingEntries, pendingAbsences] = await Promise.all([
    prisma.timeEntry.count({ where: { status: TimeEntryStatus.PENDING, clockOut: { not: null } } }),
    prisma.absence.count({ where: { status: AbsenceStatus.PENDING } }),
  ]);
  if (pendingEntries + pendingAbsences > 0) {
    const parts = [pendingEntries > 0 ? `${plural(pendingEntries, "pointage")} à valider` : null, pendingAbsences > 0 ? `${plural(pendingAbsences, "demande")} d'absence à décider` : null].filter(Boolean);
    const recipients = await activeUsers([Role.SUPERVISOR, Role.HR]);
    sent += await remind(`digest:${today}`, recipients, "À traiter aujourd'hui", `${parts.join(" et ")}.`, pendingEntries > 0 ? "TimesheetValidation" : "AbsencesManagement", today);
  }

  // Demande d'absence sans réponse depuis 48 h : relance unique.
  const stale = await prisma.absence.findMany({
    where: { status: AbsenceStatus.PENDING, createdAt: { lte: new Date(now.getTime() - AUTOMATION_SETTINGS.absencePendingHours * HOUR) } },
    select: { id: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (stale.length > 0) {
    const managers = await activeUsers([Role.HR, Role.DIRECTOR, Role.SUPERVISOR]);
    for (const absence of stale) {
      sent += await remind(`absence-stale:${absence.id}`, managers, "Demande d'absence en attente", `La demande de ${absence.user.firstName} ${absence.user.lastName} attend une réponse depuis plus de 48 h.`, "Absence", absence.id);
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Devis (9 h) : à terminer, à valider, à envoyer, à relancer
// ---------------------------------------------------------------------------

export async function runQuoteReminders(now = new Date()): Promise<number> {
  const s = AUTOMATION_SETTINGS;
  const quotes = await prisma.quote.findMany({
    where: { status: { in: [QuoteStatus.DRAFT, QuoteStatus.TO_VALIDATE, QuoteStatus.VALIDATED, QuoteStatus.SENT, QuoteStatus.FOLLOW_UP] } },
    select: {
      id: true, quoteNumber: true, status: true, updatedAt: true, nextFollowUpAt: true, assignedUserId: true, createdById: true,
      client: { select: { companyName: true } },
      createdBy: { select: { role: true, isActive: true } },
      events: { select: { action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const validators = await activeUsers([Role.DIRECTOR, Role.HR]);
  let sent = 0;
  for (const q of quotes) {
    const owner = q.assignedUserId ?? q.createdById;
    const label = `${q.quoteNumber} — ${q.client.companyName}`;
    const since = q.events[0]?.createdAt ?? q.updatedAt;
    const age = now.getTime() - Math.max(since.getTime(), q.updatedAt.getTime());

    // Rappel tous les 2 jours, au plus 3 fois, une fois passé 24 h.
    const bucket = (stepDays: number) => Math.floor((age - DAY) / (stepDays * DAY));
    const due = (stepDays: number) => age >= DAY && bucket(stepDays) < s.maxReminders;

    if (q.status === QuoteStatus.DRAFT && due(s.quoteReminderEveryDays)) {
      const toSubmit = q.createdBy.role === Role.SUPERVISOR;
      sent += await remind(`quote-draft:${q.id}:${bucket(s.quoteReminderEveryDays)}`, [owner], "Devis à terminer", `Le devis ${label} est encore en brouillon. ${toSubmit ? "Terminez-le et soumettez-le à validation" : "Terminez-le, validez-le et envoyez-le au client"}.`, "Quote", q.id);
    } else if (q.status === QuoteStatus.TO_VALIDATE && due(s.quoteReminderEveryDays)) {
      sent += await remind(`quote-validate:${q.id}:${bucket(s.quoteReminderEveryDays)}`, validators, "Devis en attente de validation", `Le devis ${label} attend votre validation.`, "Quote", q.id);
    } else if (q.status === QuoteStatus.VALIDATED && due(s.quoteReminderEveryDays)) {
      sent += await remind(`quote-send:${q.id}:${bucket(s.quoteReminderEveryDays)}`, [owner], "Devis à envoyer", `Le devis ${label} est validé mais pas encore envoyé au client.`, "Quote", q.id);
    } else if (q.status === QuoteStatus.SENT || q.status === QuoteStatus.FOLLOW_UP) {
      if (q.nextFollowUpAt && q.nextFollowUpAt <= now) {
        sent += await remind(`quote-followup-date:${q.id}:${companyDateKey(q.nextFollowUpAt)}`, [owner], "Relance client prévue", `Relance prévue pour le devis ${label}.`, "Quote", q.id);
      } else if (!q.nextFollowUpAt) {
        const step = s.quoteFollowUpAfterDays;
        const n = Math.floor(age / (step * DAY));
        if (n >= 1 && n <= s.maxReminders) {
          sent += await remind(`quote-followup:${q.id}:${n}`, [owner], "Devis sans réponse", `Pas de réponse au devis ${label} depuis ${n * step} jours : pensez à relancer le client.`, "Quote", q.id);
        }
      }
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Facturation du mois (le 1er à 8 h)
// ---------------------------------------------------------------------------

export async function runMonthlyBillingReminder(now = new Date()): Promise<number> {
  const thisMonth = companyDateKey(now).slice(0, 7);
  const period = addDaysToKey(`${thisMonth}-01`, -1).slice(0, 7);
  const targets = await prisma.siteTarget.findMany({ where: { period }, select: { siteId: true } });
  if (targets.length === 0) return 0;
  const invoiced = await prisma.invoice.findMany({ where: { period, status: { not: InvoiceStatus.CANCELLED }, siteId: { in: targets.map((t) => t.siteId) } }, select: { siteId: true } });
  const done = new Set(invoiced.map((i) => i.siteId));
  const toBill = targets.filter((t) => !done.has(t.siteId)).length;
  if (toBill === 0) return 0;
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(companyDayStart(`${period}-15`));
  return remind(`billing:${period}`, await activeUsers([Role.HR, Role.DIRECTOR]), "Factures du mois à préparer", `${plural(toBill, "chantier")} à facturer pour ${monthLabel}.`, "InvoicesList", period);
}

/** Lance une tâche en journalisant le résultat, sans jamais faire tomber le serveur. */
export async function runAutomation(name: string, job: () => Promise<number>): Promise<void> {
  try {
    const sent = await job();
    if (sent > 0) logger.info({ automation: name, sent }, "Rappels automatiques envoyés");
  } catch (err) {
    logger.error({ err, automation: name }, "Échec d'une automatisation");
  }
}

/** Ménage : les clés de plus de 6 mois ne servent plus. */
export async function pruneAutomationEvents(now = new Date()): Promise<void> {
  await prisma.automationEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * DAY) } } });
}

