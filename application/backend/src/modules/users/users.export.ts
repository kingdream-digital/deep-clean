import PDFDocument from "pdfkit";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { BRAND, CONTENT_WIDTH, PAGE_LEFT, drawHeader, ensureSpace, finalizePagination } from "../../utils/pdfBrand";
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
  OTHER: "Autre",
};

const pad = (n: number) => String(n).padStart(2, "0");
const dateFmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const timeFmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

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
  doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(9);
  doc.text("DATE", TIME_COL.date + 8, y + 6, { width: TIME_COL_WIDTHS.date });
  doc.text("ARRIVÉE", TIME_COL.in, y + 6, { width: TIME_COL_WIDTHS.time });
  doc.text("DÉPART", TIME_COL.out, y + 6, { width: TIME_COL_WIDTHS.time });
  doc.text("DURÉE", TIME_COL.duration, y + 6, { width: TIME_COL_WIDTHS.time + 15 });
  doc.text("STATUT", TIME_COL.status, y + 6, { width: TIME_COL_WIDTHS.status });
}

function drawAbsenceTableHeader(doc: PDFKit.PDFDocument, y: number): void {
  doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(9);
  doc.text("TYPE", ABS_COL.type + 8, y + 6, { width: ABS_COL_WIDTHS.type });
  doc.text("PÉRIODE", ABS_COL.period, y + 6, { width: ABS_COL_WIDTHS.period });
  doc.text("JOURS", ABS_COL.days, y + 6, { width: ABS_COL_WIDTHS.days, align: "right" });
  doc.text("STATUT", ABS_COL.status, y + 6, { width: ABS_COL_WIDTHS.status });
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

  const dayStart = new Date(`${filters.from}T00:00:00`);
  const dayEnd = new Date(`${filters.to}T23:59:59`);

  const [entries, absences] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: targetId, clockIn: { gte: dayStart, lte: dayEnd } },
      orderBy: { clockIn: "asc" },
      select: { id: true, clockIn: true, clockOut: true, status: true, isRetroactive: true },
    }),
    prisma.absence.findMany({
      where: { userId: targetId, startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
      orderBy: { startDate: "asc" },
      select: { id: true, type: true, startDate: true, endDate: true, status: true },
    }),
  ]);

  const periodLabel = `Dossier employé · ${dateFmt(dayStart)} au ${dateFmt(dayEnd)}`;

  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.on("pageAdded", () => drawHeader(doc, "Deep Clean", periodLabel));
  drawHeader(doc, "Deep Clean", periodLabel);

  // Identité de l'employé
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(13).text(`${user.firstName} ${user.lastName}`, PAGE_LEFT, doc.y);
  doc
    .fillColor(BRAND.inkSecondary)
    .font("Helvetica")
    .fontSize(9.5)
    .text(`${ROLE_LABEL_FR[user.role]} · ${user.username}`, PAGE_LEFT, doc.y + 2);
  doc.y += 24;

  // --- Pointages ---
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(11).text("PONCTAGES", PAGE_LEFT, doc.y);
  doc.y += 16;
  let timeHeaderY = doc.y;
  drawTimeTableHeader(doc, timeHeaderY);
  doc.y = timeHeaderY + 20;

  let validatedMinutes = 0;
  let pendingMinutes = 0;
  let rejectedMinutes = 0;

  if (entries.length === 0) {
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(9.5).text("Aucun pointage sur cette période.", PAGE_LEFT + 8, doc.y + 4);
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
      doc.text(dateFmt(entry.clockIn) + (entry.isRetroactive ? " · différé" : ""), TIME_COL.date + 8, y + 4, {
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
    doc.moveTo(PAGE_LEFT, doc.y + 2).lineTo(PAGE_LEFT + CONTENT_WIDTH, doc.y + 2).strokeColor(BRAND.accentDeep).lineWidth(1).stroke();
    doc.y += 8;
    doc
      .fillColor(BRAND.ink)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(
        `Validées : ${formatMinutes(validatedMinutes)}   ·   En attente : ${formatMinutes(pendingMinutes)}   ·   Refusées : ${formatMinutes(rejectedMinutes)}`,
        PAGE_LEFT,
        doc.y
      );
    doc.y += 22;
  }

  // --- Absences ---
  ensureSpace(doc, 60, () => {});
  doc.y += 12;
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(11).text("ABSENCES SUR LA PÉRIODE", PAGE_LEFT, doc.y);
  doc.y += 16;
  let absHeaderY = doc.y;
  drawAbsenceTableHeader(doc, absHeaderY);
  doc.y = absHeaderY + 20;

  let totalApprovedDays = 0;

  if (absences.length === 0) {
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(9.5).text("Aucune absence sur cette période.", PAGE_LEFT + 8, doc.y + 4);
    doc.y += 20;
  } else {
    absences.forEach((absence, index) => {
      ensureSpace(doc, 18, () => {
        absHeaderY = doc.y;
        drawAbsenceTableHeader(doc, absHeaderY);
        doc.y = absHeaderY + 20;
      });

      const days = Math.round((absence.endDate.getTime() - absence.startDate.getTime()) / 86_400_000);
      if (absence.status === "APPROVED") totalApprovedDays += days;

      const y = doc.y;
      if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 18).fill(BRAND.rowAlt);
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
      doc.text(ABSENCE_TYPE_LABEL_FR[absence.type] ?? absence.type, ABS_COL.type + 8, y + 4, { width: ABS_COL_WIDTHS.type });
      doc.text(`${dateFmt(absence.startDate)} – ${dateFmt(absence.endDate)}`, ABS_COL.period, y + 4, { width: ABS_COL_WIDTHS.period });
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
    doc.moveTo(PAGE_LEFT, doc.y + 2).lineTo(PAGE_LEFT + CONTENT_WIDTH, doc.y + 2).strokeColor(BRAND.accentDeep).lineWidth(1).stroke();
    const totalY = doc.y + 8;
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9.5).text("TOTAL JOURS APPROUVÉS", ABS_COL.type + 8, totalY, {
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
