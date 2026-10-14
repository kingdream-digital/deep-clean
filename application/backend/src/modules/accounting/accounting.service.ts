import ExcelJS from "exceljs";
import { AbsenceStatus, AbsenceType, Role, TimeEntryStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { calendarDay, companyDayStart } from "../../utils/companyTime";
import { countWorkableDays } from "../../utils/frenchCalendar";
import { getPaySummary } from "../payroll/paySummary.service";
import { getLeaveBalance } from "../leave/leave.service";

// Espace comptable (retour explicite du client) : tout ce dont le cabinet a
// besoin pour faire les fiches de paie du mois, en un écran et un fichier.
// Accessible au comptable, et à la RH / direction / admin qui préparent le
// même dossier.

interface Actor {
  userId: string;
  role: Role;
}

export const ACCOUNTING_ROLES: Role[] = [Role.ACCOUNTANT, Role.HR, Role.DIRECTOR, Role.ADMIN];

// Salariés concernés par la paie : tous les comptes actifs, sauf l'admin
// technique et le comptable (cabinet externe).
const NON_PAYROLL_ROLES: Role[] = [Role.ADMIN, Role.ACCOUNTANT];

export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Arrêt maladie",
  UNPAID_LEAVE: "Congé sans solde",
  WORK_ACCIDENT: "Accident du travail",
  PARENTAL_LEAVE: "Congé maternité / paternité",
  COMPENSATORY_REST: "Repos compensateur",
  OTHER: "Autre absence",
};

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "RH",
  DIRECTOR: "Direction",
  ADMIN: "Admin",
  ACCOUNTANT: "Comptable",
};

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest("Mois invalide (format AAAA-MM).");
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    // Pointages : instants, bornés en heure de Paris.
    start: companyDayStart(`${month}-01`),
    end: companyDayStart(`${next}-01`),
    // Absences : jours calendaires (minuit UTC).
    firstDay: calendarDay(`${month}-01`),
    lastDay: calendarDay(`${month}-${String(lastDay).padStart(2, "0")}`),
  };
}

const round2 = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

async function payrollStaff() {
  return prisma.user.findMany({
    where: { isActive: true, role: { notIn: NON_PAYROLL_ROLES } },
    select: { id: true, firstName: true, lastName: true, role: true, hireDate: true, weeklyHours: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

async function monthAbsences(month: string) {
  const { firstDay, lastDay } = monthBounds(month);
  return prisma.absence.findMany({
    where: { status: AbsenceStatus.APPROVED, startDate: { lte: lastDay }, endDate: { gte: firstDay } },
    select: { userId: true, type: true, startDate: true, endDate: true, reason: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: [{ startDate: "asc" }],
  });
}

/** Jours ouvrables (lundi au samedi, hors fériés) d'une absence tombant dans le mois. */
function workableDaysInMonth(a: { startDate: Date; endDate: Date }, month: string): number {
  const { firstDay, lastDay } = monthBounds(month);
  const from = a.startDate > firstDay ? a.startDate : firstDay;
  const to = a.endDate < lastDay ? a.endDate : lastDay;
  return to < from ? 0 : countWorkableDays(from, to);
}

export interface AccountingOverview {
  month: string;
  staffCount: number;
  validatedHours: number;
  pendingHours: number;
  pendingEntries: number;
  absenceCount: number;
  absenceDaysByType: { type: AbsenceType; label: string; days: number }[];
  documentsThisMonth: number;
}

// Vue d'ensemble du mois pour l'écran d'accueil du comptable. Les pointages
// encore « en attente » sont mis en avant : ils ne doivent pas partir en paie
// avant validation par l'encadrement.
export async function getAccountingOverview(actor: Actor, month: string): Promise<AccountingOverview> {
  if (!ACCOUNTING_ROLES.includes(actor.role)) throw ApiError.forbidden();
  assertMonth(month);
  const { start, end } = monthBounds(month);
  const staff = await payrollStaff();
  const staffIds = staff.map((s) => s.id);

  const [entries, absences, documentsThisMonth] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: { in: staffIds }, clockIn: { gte: start, lt: end }, clockOut: { not: null }, status: { not: TimeEntryStatus.REJECTED } },
      select: { clockIn: true, clockOut: true, status: true },
    }),
    monthAbsences(month),
    prisma.employeeDocument.count({ where: { createdAt: { gte: start, lt: end } } }),
  ]);

  let validated = 0;
  let pending = 0;
  let pendingEntries = 0;
  for (const e of entries) {
    const minutes = (e.clockOut!.getTime() - e.clockIn.getTime()) / 60_000;
    if (e.status === TimeEntryStatus.PENDING) {
      pending += minutes;
      pendingEntries++;
    } else validated += minutes;
  }

  const byType = new Map<AbsenceType, number>();
  for (const a of absences) byType.set(a.type, (byType.get(a.type) ?? 0) + workableDaysInMonth(a, month));

  return {
    month,
    staffCount: staff.length,
    validatedHours: round2(validated),
    pendingHours: round2(pending),
    pendingEntries,
    absenceCount: absences.length,
    absenceDaysByType: [...byType.entries()].map(([type, days]) => ({ type, label: ABSENCE_LABELS[type], days })),
    documentsThisMonth,
  };
}

const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function header(sheet: ExcelJS.Worksheet, columns: { header: string; key: string; width: number }[]) {
  sheet.columns = columns;
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2D69" } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 32;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// Neutralise un texte qui serait lu comme une formule par Excel.
const safe = (v: string | null | undefined) => (v && /^[=+\-@]/.test(v) ? `'${v}` : v ?? "");

/**
 * Dossier de paie du mois, en un fichier Excel :
 * - « Synthèse paie » : une ligne par salarié — heures du mois ventilées
 *   (normales, nuit, dimanche, férié), heures majorées, heures non encore
 *   validées, travailleur de nuit, repos compensateur, absences et congés ;
 * - « Absences » : le détail des absences validées du mois ;
 * - « Congés » : le solde de congés payés de chacun.
 */
export async function buildPayrollPack(actor: Actor, month: string): Promise<Buffer> {
  if (!ACCOUNTING_ROLES.includes(actor.role)) throw ApiError.forbidden();
  assertMonth(month);
  const staff = await payrollStaff();
  const absences = await monthAbsences(month);
  const year = Number(month.slice(0, 4));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Deep Clean";
  wb.created = new Date();
  const monthLabel = MONTH_FMT.format(calendarDay(`${month}-15`));

  const synth = wb.addWorksheet("Synthèse paie");
  header(synth, [
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Prénom", key: "firstName", width: 16 },
    { header: "Poste", key: "role", width: 14 },
    { header: "Date d'arrivée", key: "hireDate", width: 13 },
    { header: "Contrat (h/sem.)", key: "weeklyHours", width: 11 },
    { header: "Heures du mois", key: "total", width: 11 },
    { header: "dont normales", key: "normal", width: 11 },
    { header: "dont nuit (21h-6h)", key: "night", width: 11 },
    { header: "dont dimanche", key: "sunday", width: 11 },
    { header: "dont férié", key: "holiday", width: 10 },
    { header: "Heures majorées", key: "premium", width: 11 },
    { header: "Non validées", key: "pending", width: 11 },
    { header: "Travailleur de nuit", key: "nightWorker", width: 11 },
    { header: "Repos compensateur acquis (h)", key: "restAcquired", width: 13 },
    { header: "Repos compensateur solde (h)", key: "restBalance", width: 13 },
    { header: "Congés payés pris (j)", key: "paidLeave", width: 11 },
    { header: "Maladie (j)", key: "sick", width: 9 },
    { header: "Accident du travail (j)", key: "accident", width: 11 },
    { header: "Sans solde (j)", key: "unpaid", width: 9 },
    { header: "Autres absences (j)", key: "otherAbs", width: 11 },
  ]);

  const leave = wb.addWorksheet("Congés");
  header(leave, [
    { header: "Nom", key: "name", width: 26 },
    { header: "Congés N-1 restants (j)", key: "prev", width: 14 },
    { header: "à prendre avant le", key: "deadline", width: 14 },
    { header: "Congés N acquis (j)", key: "currAcq", width: 12 },
    { header: "Congés N restants (j)", key: "curr", width: 12 },
    { header: "Solde total (j)", key: "total", width: 11 },
    { header: "Demandes en attente (j)", key: "pending", width: 12 },
  ]);

  for (const u of staff) {
    const summary = await getPaySummary(actor, u.id, month);
    const t = summary.totals;
    const mine = absences.filter((a) => a.userId === u.id);
    const daysOf = (types: AbsenceType[]) => mine.filter((a) => types.includes(a.type)).reduce((n, a) => n + workableDaysInMonth(a, month), 0);
    synth.addRow({
      lastName: safe(u.lastName),
      firstName: safe(u.firstName),
      role: ROLE_LABELS[u.role],
      hireDate: DAY_FMT.format(u.hireDate),
      weeklyHours: u.weeklyHours ?? "",
      total: round2(t.countedMinutes),
      normal: round2(t.minutesByCategory.normal),
      night: round2(t.minutesByCategory.night),
      sunday: round2(t.minutesByCategory.sunday),
      holiday: round2(t.minutesByCategory.holiday),
      premium: round2(t.premiumMinutes),
      pending: round2(t.pendingMinutes),
      nightWorker: summary.nightWorker.isNightWorker ? "Oui" : "Non",
      restAcquired: round2(summary.compensatoryRest.monthAcquiredMinutes),
      restBalance: round2(summary.compensatoryRest.balanceMinutes),
      paidLeave: daysOf([AbsenceType.PAID_LEAVE]),
      sick: daysOf([AbsenceType.SICK_LEAVE]),
      accident: daysOf([AbsenceType.WORK_ACCIDENT]),
      unpaid: daysOf([AbsenceType.UNPAID_LEAVE]),
      otherAbs: daysOf([AbsenceType.PARENTAL_LEAVE, AbsenceType.COMPENSATORY_REST, AbsenceType.OTHER]),
    });

    const b = await getLeaveBalance(actor, u.id, year);
    leave.addRow({
      name: safe(`${u.lastName} ${u.firstName}`),
      prev: b.previousYear.remaining,
      deadline: b.previousYear.deadline ? DAY_FMT.format(new Date(b.previousYear.deadline)) : "",
      currAcq: b.currentYear.acquired,
      curr: b.currentYear.remaining,
      total: b.remaining,
      pending: b.pending,
    });
  }
  // Ligne de total des heures.
  const last = synth.rowCount;
  if (last > 1) {
    const total = synth.addRow({ lastName: "TOTAL" });
    for (const col of ["F", "G", "H", "I", "J", "K", "L", "N", "P", "Q", "R", "S", "T"]) {
      total.getCell(col).value = { formula: `SUM(${col}2:${col}${last})` };
    }
    total.font = { bold: true };
  }

  const abs = wb.addWorksheet("Absences");
  header(abs, [
    { header: "Nom", key: "name", width: 26 },
    { header: "Type", key: "type", width: 24 },
    { header: "Du", key: "from", width: 12 },
    { header: "Au", key: "to", width: 12 },
    { header: "Jours ouvrables dans le mois", key: "days", width: 14 },
    { header: "Motif", key: "reason", width: 34 },
  ]);
  for (const a of absences) {
    abs.addRow({
      name: safe(`${a.user.lastName} ${a.user.firstName}`),
      type: ABSENCE_LABELS[a.type],
      from: DAY_FMT.format(a.startDate),
      to: DAY_FMT.format(a.endDate),
      days: workableDaysInMonth(a, month),
      reason: safe(a.reason),
    });
  }

  const info = wb.addWorksheet("À lire");
  info.getColumn(1).width = 110;
  [
    `Dossier de paie — ${monthLabel}`,
    "",
    "Synthèse paie : heures pointées du mois par salarié (pointages validés et en attente ; les pointages refusés sont exclus).",
    "« Non validées » : heures encore en attente de validation par l'encadrement à la date de l'export — à vérifier avant la paie.",
    "Nuit : 21 h – 6 h ; dimanche et jours fériés selon la convention collective de la propreté (IDCC 3043). « Heures majorées » : heures ouvrant droit à une majoration.",
    "Absences : absences validées, comptées en jours ouvrables (lundi au samedi, hors jours fériés, comme les congés payés) pour la part tombant dans le mois.",
    "Congés : soldes de congés payés à la date de l'export (période de référence du 1er juin au 31 mai).",
    "Le détail pointage par pointage est disponible dans l'application : Heures → Exporter (Excel ou PDF).",
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
