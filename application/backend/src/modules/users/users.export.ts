import PDFDocument from "pdfkit";
import { calendarDay, calendarDayEnd, companyDateLabel, companyDayEnd, companyDayStart, companyTimeKey } from "../../utils/companyTime";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { BRAND, CONTENT_WIDTH, PAGE_LEFT, drawBrandHeader, drawKpiCards, drawSectionTitle, drawTableHeaderBar, ensureSpace, finalizePagination, generatedAtLabel } from "../../utils/pdfBrand";
import { countWorkableDays } from "../../utils/frenchCalendar";
import { DOSSIER_VIEW_ROLES, getUserById } from "./users.service";

interface Actor {
  userId: string;
  role: Role;
}

interface ExportFilters {
  from: string;
  to: string;
}

const ROLE_LABEL_FR: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "RH",
  DIRECTOR: "Directeur",
  ADMIN: "Admin",
  ACCOUNTANT: "Comptable",
};

const TIME_STATUS_LABEL_FR: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validé",
  REJECTED: "Refusé",
};

const ABSENCE_STATUS_LABEL_FR: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
};

const ABSENCE_TYPE_LABEL_FR: Record<string, string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Arrêt maladie",
  UNPAID_LEAVE: "Congé sans solde",
  WORK_ACCIDENT: "Accident du travail",
  PARENTAL_LEAVE: "Congé parental",
  COMPENSATORY_REST: "Repos compensateur",
  OTHER: "Autre",
};

const pad = (n: number) => String(n).padStart(2, "0");
// Instants (pointages) lus en heure de Paris ; jours calendaires (absences,
// bornes de période) lus tels qu'enregistrés, à minuit UTC.
const dateFmt = (d: Date) => companyDateLabel(d);
const timeFmt = (d: Date) => companyTimeKey(d);
const calendarDateFmt = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h} h ${pad(m)}`;
}

const TIME_COL = { date: PAGE_LEFT, in: 130, out: 195, duration: 260, status: 340 };
const TIME_COL_WIDTHS = { date: 80, time: 55, status: 130 };

const ABS_COL = { type: PAGE_LEFT, period: 190, days: 370, status: 430 };
const ABS_COL_WIDTHS = { type: 140, period: 170, days: 50, status: 120 };

function drawTimeTableHeader(doc: PDFKit.PDFDocument, y: number): void {
  drawTableHeaderBar(
    doc,
    y,
    [
      { label: "DATE", x: TIME_COL.date + 10, width: TIME_COL_WIDTHS.date },
      { label: "ARRIVÉE", x: TIME_COL.in, width: TIME_COL_WIDTHS.time },
      { label: "DÉPART", x: TIME_COL.out, width: TIME_COL_WIDTHS.time },
      { label: "DURÉE", x: TIME_COL.duration, width: TIME_COL_WIDTHS.time + 15 },
      { label: "STATUT", x: TIME_COL.status, width: TIME_COL_WIDTHS.status },
    ],
    20
  );
}

function drawAbsenceTableHeader(doc: PDFKit.PDFDocument, y: number): void {
  drawTableHeaderBar(
    doc,
    y,
    [
      { label: "TYPE", x: ABS_COL.type + 10, width: ABS_COL_WIDTHS.type },
      { label: "PÉRIODE", x: ABS_COL.period, width: ABS_COL_WIDTHS.period },
      { label: "JOURS OUVR.", x: ABS_COL.days - 20, width: ABS_COL_WIDTHS.days + 20, align: "right" },
      { label: "STATUT", x: ABS_COL.status, width: ABS_COL_WIDTHS.status },
    ],
    20
  );
}

/**
 * Dossier employé complet en PDF — pointages détaillés jour par jour et
 * absences de la période, plus un résumé chiffré. Pensé pour l'archivage RH
 * et la préparation de la fiche de paye (semaine ou mois, selon les bornes
 * `from`/`to` fournies par l'appelant) : contrairement au récapitulatif
 * multi-employés de timesheets.export.ts (une ligne par personne), ce
 * document porte sur UNE SEULE personne avec le détail de chaque pointage.
 * Même charte graphique que l'export des heures (voir utils/pdfBrand.ts) —
 * jamais deux styles de PDF différents dans l'application.
 */
export async function exportEmployeeDossierPdf(actor: Actor, targetId: string, filters: ExportFilters): Promise<Buffer> {
  if (!DOSSIER_VIEW_ROLES.includes(actor.role)) throw ApiError.forbidden();

  const user = await getUserById(targetId);

  const dayStart = companyDayStart(filters.from);
  const dayEnd = companyDayEnd(filters.to);
  const periodStart = calendarDay(filters.from);
  const periodEnd = calendarDayEnd(filters.to);

  const [entries, absences] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: targetId, clockIn: { gte: dayStart, lte: dayEnd } },
      orderBy: { clockIn: "asc" },
      select: { id: true, clockIn: true, clockOut: true, status: true, isRetroactive: true },
    }),
    prisma.absence.findMany({
      where: { userId: targetId, startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
      orderBy: { startDate: "asc" },
      select: { id: true, type: true, startDate: true, endDate: true, status: true },
    }),
  ]);

  const periodLabel = `Du ${calendarDateFmt(periodStart)} au ${calendarDateFmt(periodEnd)}`;
  const editedAt = generatedAtLabel();

  // Jours ouvrables (lundi–samedi hors fériés) de chaque absence, dernier
  // jour inclus et limités à la période : même décompte que le dossier de
  // paie du comptable (l'ancien calcul oubliait le dernier jour).
  const lastDay = calendarDay(filters.to);
  const absenceDays = (a: { startDate: Date; endDate: Date }) => {
    const from = a.startDate < periodStart ? periodStart : a.startDate;
    const to = a.endDate > lastDay ? lastDay : a.endDate;
    return to < from ? 0 : countWorkableDays(from, to);
  };
  const workedMinutes = (status: string) =>
    entries.filter((e) => e.clockOut && e.status === status).reduce((n, e) => n + (e.clockOut!.getTime() - e.clockIn.getTime()) / 60000, 0);

  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.on("pageAdded", () => drawBrandHeader(doc, "DOSSIER SALARIÉ", periodLabel, editedAt));
  drawBrandHeader(doc, "DOSSIER SALARIÉ", periodLabel, editedAt);

  // Carte d'identité du salarié, initiales dans une pastille aux couleurs du logo.
  const cardTop = doc.y;
  doc.roundedRect(PAGE_LEFT, cardTop, CONTENT_WIDTH, 52, 8).fill(BRAND.rowAlt);
  doc.rect(PAGE_LEFT, cardTop + 12, 3, 28).fill(BRAND.accent);
  doc.circle(PAGE_LEFT + 34, cardTop + 26, 16).fill(BRAND.accentDeep);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(11).text(initials, PAGE_LEFT + 18, cardTop + 21, { width: 32, align: "center", lineBreak: false });
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(13).text(`${user.firstName} ${user.lastName}`, PAGE_LEFT + 60, cardTop + 12, { width: CONTENT_WIDTH - 70, lineBreak: false });
  doc
    .fillColor(BRAND.inkSecondary)
    .font("Helvetica")
    .fontSize(9)
    .text([ROLE_LABEL_FR[user.role], `identifiant ${user.username}`, user.email].filter(Boolean).join("  ·  "), PAGE_LEFT + 60, cardTop + 30, { width: CONTENT_WIDTH - 70, lineBreak: false });
  doc.y = cardTop + 52 + 16;

  const approvedDays = absences.filter((a) => a.status === "APPROVED").reduce((n, a) => n + absenceDays(a), 0);
  const pendingTotal = workedMinutes("PENDING");
  const rejectedTotal = workedMinutes("REJECTED");
  drawKpiCards(doc, [
    { label: "Validées", value: formatMinutes(workedMinutes("VALIDATED")) },
    { label: "En attente", value: formatMinutes(pendingTotal), tone: pendingTotal > 0 ? undefined : "muted" },
    { label: "Refusées", value: formatMinutes(rejectedTotal), tone: rejectedTotal > 0 ? "danger" : "muted" },
    { label: entries.length > 1 ? "Pointages" : "Pointage", value: String(entries.length) },
    { label: "Absences", value: `${approvedDays} j`, tone: approvedDays > 0 ? undefined : "muted" },
  ]);

  // --- Pointages ---
  drawSectionTitle(doc, "Pointages");
  let timeHeaderY = doc.y;
  drawTimeTableHeader(doc, timeHeaderY);
  doc.y = timeHeaderY + 20;

  let validatedMinutes = 0;
  let pendingMinutes = 0;
  let rejectedMinutes = 0;

  if (entries.length === 0) {
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(9.5).text("Aucun pointage sur cette période.", PAGE_LEFT + 10, doc.y + 6);
    doc.y += 20;
  } else {
    entries.forEach((entry, index) => {
      ensureSpace(doc, 18, () => {
        timeHeaderY = doc.y;
        drawTimeTableHeader(doc, timeHeaderY);
        doc.y = timeHeaderY + 20;
      });

      const minutes = entry.clockOut ? (entry.clockOut.getTime() - entry.clockIn.getTime()) / 60000 : 0;
      if (entry.clockOut) {
        if (entry.status === "VALIDATED") validatedMinutes += minutes;
        else if (entry.status === "PENDING") pendingMinutes += minutes;
        else rejectedMinutes += minutes;
      }

      const y = doc.y;
      if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 18).fill(BRAND.rowAlt);
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
      doc.text(dateFmt(entry.clockIn) + (entry.isRetroactive ? " · différé" : ""), TIME_COL.date + 10, y + 4, {
        width: TIME_COL_WIDTHS.date,
      });
      doc.text(timeFmt(entry.clockIn), TIME_COL.in, y + 4, { width: TIME_COL_WIDTHS.time });
      doc.text(entry.clockOut ? timeFmt(entry.clockOut) : "en cours", TIME_COL.out, y + 4, { width: TIME_COL_WIDTHS.time });
      doc.text(entry.clockOut ? formatMinutes(minutes) : "—", TIME_COL.duration, y + 4, { width: TIME_COL_WIDTHS.time + 15 });
      const statusColor =
        entry.status === "VALIDATED" ? BRAND.accentDeep : entry.status === "REJECTED" ? BRAND.danger : BRAND.inkTertiary;
      doc.fillColor(statusColor).text(TIME_STATUS_LABEL_FR[entry.status] ?? entry.status, TIME_COL.status, y + 4, {
        width: TIME_COL_WIDTHS.status,
      });
      doc.y = y + 18;
    });

    ensureSpace(doc, 30, () => {
      timeHeaderY = doc.y;
      drawTimeTableHeader(doc, timeHeaderY);
      doc.y = timeHeaderY + 20;
    });
    doc.roundedRect(PAGE_LEFT, doc.y + 4, CONTENT_WIDTH, 22, 6).fill(BRAND.accentSoft);
    doc
      .fillColor(BRAND.accentDeep)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        `Validées : ${formatMinutes(validatedMinutes)}   ·   En attente : ${formatMinutes(pendingMinutes)}   ·   Refusées : ${formatMinutes(rejectedMinutes)}`,
        PAGE_LEFT + 10,
        doc.y + 11,
        { lineBreak: false }
      );
    doc.y += 34;
  }

  // --- Absences ---
  ensureSpace(doc, 70, () => {});
  doc.y += 14;
  drawSectionTitle(doc, "Absences sur la période");
  let absHeaderY = doc.y;
  drawAbsenceTableHeader(doc, absHeaderY);
  doc.y = absHeaderY + 20;

  let totalApprovedDays = 0;

  if (absences.length === 0) {
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(9.5).text("Aucune absence sur cette période.", PAGE_LEFT + 10, doc.y + 6);
    doc.y += 20;
  } else {
    absences.forEach((absence, index) => {
      ensureSpace(doc, 18, () => {
        absHeaderY = doc.y;
        drawAbsenceTableHeader(doc, absHeaderY);
        doc.y = absHeaderY + 20;
      });

      const days = absenceDays(absence);
      if (absence.status === "APPROVED") totalApprovedDays += days;

      const y = doc.y;
      if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 18).fill(BRAND.rowAlt);
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
      doc.text(ABSENCE_TYPE_LABEL_FR[absence.type] ?? absence.type, ABS_COL.type + 10, y + 4, { width: ABS_COL_WIDTHS.type });
      doc.text(`${calendarDateFmt(absence.startDate)} – ${calendarDateFmt(absence.endDate)}`, ABS_COL.period, y + 4, { width: ABS_COL_WIDTHS.period });
      doc.text(String(days), ABS_COL.days, y + 4, { width: ABS_COL_WIDTHS.days, align: "right" });
      const statusColor =
        absence.status === "APPROVED" ? BRAND.accentDeep : absence.status === "REJECTED" ? BRAND.danger : BRAND.inkTertiary;
      doc.fillColor(statusColor).text(ABSENCE_STATUS_LABEL_FR[absence.status] ?? absence.status, ABS_COL.status, y + 4, {
        width: ABS_COL_WIDTHS.status,
      });
      doc.y = y + 18;
    });

    ensureSpace(doc, 20, () => {
      absHeaderY = doc.y;
      drawAbsenceTableHeader(doc, absHeaderY);
      doc.y = absHeaderY + 20;
    });
    doc.roundedRect(PAGE_LEFT, doc.y + 4, CONTENT_WIDTH, 22, 6).fill(BRAND.accentSoft);
    const totalY = doc.y + 11;
    doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(9).text("TOTAL JOURS APPROUVÉS", ABS_COL.type + 10, totalY, {
      width: ABS_COL_WIDTHS.type + ABS_COL_WIDTHS.period,
    });
    doc.fillColor(BRAND.accentDeep).text(String(totalApprovedDays), ABS_COL.days, totalY, { width: ABS_COL_WIDTHS.days, align: "right" });
    doc.y = totalY + 18;
  }

  await logActivity({
    userId: actor.userId,
    action: "EMPLOYEE_DOSSIER_EXPORTED",
    entityType: "User",
    entityId: targetId,
    metadata: { from: filters.from, to: filters.to, format: "pdf" },
  });

  finalizePagination(doc);

  doc.end();
  return done;
}
