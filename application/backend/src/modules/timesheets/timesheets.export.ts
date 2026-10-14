import ExcelJS from "exceljs";
import { companyDateLabel, companyDayStart, companyTimeKey } from "../../utils/companyTime";
import PDFDocument from "pdfkit";
import { prisma } from "../../db/prisma";
import { logActivity } from "../../utils/activityLog";
import { buildTimeEntriesWhere, exceptionalEntryIds, timeEntrySelect, type Actor, type ListFilters } from "./timesheets.service";
import { computePayBreakdown } from "../payroll/workHours";
import type { PayBreakdown } from "../payroll/workHours";
import { BRAND, CONTENT_WIDTH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, drawBrandHeader, drawKpiCards, drawSectionTitle, drawTableHeaderBar, finalizePagination, generatedAtLabel } from "../../utils/pdfBrand";

const STATUS_LABEL_FR: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validé",
  REJECTED: "Refusé",
};

// Heures de Paris, quel que soit le fuseau du serveur.
const dateFmt = (d: Date) => companyDateLabel(d);
const timeFmt = (d: Date) => companyTimeKey(d);

function durationHours(clockIn: Date, clockOut: Date | null): number {
  if (!clockOut) return 0;
  return (clockOut.getTime() - clockIn.getTime()) / 3_600_000;
}

function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

async function fetchExportEntries(actor: Actor, filters: ListFilters) {
  const where = await buildTimeEntriesWhere(actor, filters);
  return prisma.timeEntry.findMany({
    where,
    select: timeEntrySelect,
    orderBy: [{ user: { lastName: "asc" } }, { clockIn: "asc" }],
  });
}

type ExportEntry = Awaited<ReturnType<typeof fetchExportEntries>>[number];

/**
 * Majorations de chaque pointage compté (clôturé, non refusé) : nuit,
 * dimanche, jour férié — voir payroll/payRules.ts pour les taux.
 */
async function payBreakdowns(entries: ExportEntry[]): Promise<Map<string, PayBreakdown>> {
  const exceptional = await exceptionalEntryIds(entries);
  const result = new Map<string, PayBreakdown>();
  for (const entry of entries) {
    if (!entry.clockOut || entry.status === "REJECTED") continue;
    result.set(entry.id, computePayBreakdown([{ clockIn: entry.clockIn, clockOut: entry.clockOut, exceptional: exceptional.has(entry.id) }]));
  }
  return result;
}

const toHours = (minutes: number) => Number((minutes / 60).toFixed(2));

/**
 * Export Excel (.xlsx) des pointages — même portée d'accès que l'export CSV
 * existant (voir `exportTimeEntriesCsv`), mais un vrai classeur mis en forme
 * plutôt qu'un texte brut : une feuille "Détail" ligne par pointage, une
 * feuille "Récapitulatif" avec le total d'heures validées par employé,
 * directement exploitable pour la paie sans retraitement.
 */
export async function exportTimeEntriesExcel(actor: Actor, filters: ListFilters): Promise<Buffer> {
  const entries = await fetchExportEntries(actor, filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Deep Clean";
  workbook.created = new Date();

  const detail = workbook.addWorksheet("Détail");
  detail.columns = [
    { header: "Employé", key: "employee", width: 24 },
    { header: "Date", key: "date", width: 12 },
    { header: "Arrivée", key: "clockIn", width: 10 },
    { header: "Départ", key: "clockOut", width: 10 },
    { header: "Durée (h)", key: "duration", width: 10 },
    { header: "Dont nuit (h)", key: "night", width: 13 },
    { header: "Dont dimanche (h)", key: "sunday", width: 17 },
    { header: "Dont férié (h)", key: "holiday", width: 14 },
    { header: "Majoration (h)", key: "premium", width: 14 },
    { header: "Statut", key: "status", width: 12 },
    { header: "Différé", key: "retroactive", width: 10 },
    { header: "Commentaire", key: "comment", width: 30 },
  ];
  detail.getRow(1).font = { bold: true };
  detail.autoFilter = { from: "A1", to: "L1" };
  const breakdowns = await payBreakdowns(entries);

  for (const entry of entries) {
    const hours = durationHours(entry.clockIn, entry.clockOut);
    const b = breakdowns.get(entry.id);
    detail.addRow({
      night: b ? toHours(b.minutesByCategory.night) : "",
      sunday: b ? toHours(b.minutesByCategory.sunday) : "",
      holiday: b ? toHours(b.minutesByCategory.holiday) : "",
      premium: b ? toHours(b.premiumMinutes) : "",
      employee: `${entry.user.firstName} ${entry.user.lastName}`,
      date: dateFmt(entry.clockIn),
      clockIn: timeFmt(entry.clockIn),
      clockOut: entry.clockOut ? timeFmt(entry.clockOut) : "",
      duration: entry.clockOut ? Number(hours.toFixed(2)) : "",
      status: STATUS_LABEL_FR[entry.status] ?? entry.status,
      retroactive: entry.isRetroactive ? "Oui" : "",
      // Un commentaire commençant par =/+/-/@ serait interprété comme une
      // formule par Excel à l'ouverture (même risque que pour le CSV) —
      // même neutralisation par préfixe apostrophe.
      comment: /^[=+\-@]/.test(entry.comment ?? "") ? `'${entry.comment}` : entry.comment ?? "",
    });
  }

  const byEmployee = new Map<string, { name: string; validated: number; pending: number; night: number; sunday: number; holiday: number; premium: number }>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const hours = durationHours(entry.clockIn, entry.clockOut);
    const key = entry.userId;
    const bucket = byEmployee.get(key) ?? { name: `${entry.user.firstName} ${entry.user.lastName}`, validated: 0, pending: 0, night: 0, sunday: 0, holiday: 0, premium: 0 };
    if (entry.status === "VALIDATED") bucket.validated += hours;
    else if (entry.status === "PENDING") bucket.pending += hours;
    const b = breakdowns.get(entry.id);
    if (b) {
      bucket.night += b.minutesByCategory.night;
      bucket.sunday += b.minutesByCategory.sunday;
      bucket.holiday += b.minutesByCategory.holiday;
      bucket.premium += b.premiumMinutes;
    }
    byEmployee.set(key, bucket);
  }

  const summary = workbook.addWorksheet("Récapitulatif");
  summary.columns = [
    { header: "Employé", key: "employee", width: 24 },
    { header: "Heures validées", key: "validated", width: 16 },
    { header: "Heures en attente", key: "pending", width: 18 },
    { header: "Total", key: "total", width: 12 },
    { header: "Dont nuit (h)", key: "night", width: 13 },
    { header: "Dont dimanche (h)", key: "sunday", width: 17 },
    { header: "Dont férié (h)", key: "holiday", width: 14 },
    { header: "Majoration (h)", key: "premium", width: 14 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const [, v] of [...byEmployee.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    summary.addRow({
      employee: v.name,
      validated: Number(v.validated.toFixed(2)),
      pending: Number(v.pending.toFixed(2)),
      total: Number(v.validated.toFixed(2)) + Number(v.pending.toFixed(2)),
      night: toHours(v.night),
      sunday: toHours(v.sunday),
      holiday: toHours(v.holiday),
      premium: toHours(v.premium),
    });
  }

  await logActivity({
    userId: actor.userId,
    action: "TIME_ENTRIES_EXPORTED",
    entityType: "TimeEntry",
    metadata: { ...filters, rowCount: entries.length, format: "xlsx" },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Colonnes avec marge de respiration avant le bord droit (545, pas 555) :
// un intitulé en gras ("REFUSÉES") à fontSize 9.5 touchait quasiment le bord
// du tableau avec un bord droit calé exactement sur PAGE_RIGHT.
const COL = { name: PAGE_LEFT, validated: 290, pending: 385, rejected: 475 };
const COL_WIDTHS = { name: 230, num: 70 };
const PCOL = { name: PAGE_LEFT, night: 230, sunday: 305, holiday: 380, premium: 475 };

function drawTableHeaderRow(doc: PDFKit.PDFDocument, y: number): void {
  drawTableHeaderBar(doc, y, [
    { label: "SALARIÉ", x: COL.name + 10, width: COL_WIDTHS.name },
    { label: "VALIDÉES", x: COL.validated, width: COL_WIDTHS.num, align: "right" },
    { label: "EN ATTENTE", x: COL.pending, width: COL_WIDTHS.num, align: "right" },
    { label: "REFUSÉES", x: COL.rejected, width: COL_WIDTHS.num, align: "right" },
  ]);
}

/**
 * Export PDF des pointages — document de synthèse pour transmission à la
 * paie ou archivage RH : un récapitulatif par employé (total d'heures
 * validées/en attente), pas le détail pointage par pointage (voir l'export
 * Excel pour le détail exploitable). Mise en page soignée (logo, palette de
 * la marque, tableau zébré, pagination) mais volontairement sans image lourde
 * ni police embarquée supplémentaire : le PDF reste de quelques dizaines de
 * Ko, jamais plusieurs Mo pour un simple récapitulatif.
 */
export async function exportTimeEntriesPdf(actor: Actor, filters: ListFilters): Promise<Buffer> {
  const entries = await fetchExportEntries(actor, filters);

  const breakdowns = await payBreakdowns(entries);
  const byEmployee = new Map<string, { name: string; validated: number; pending: number; rejected: number; night: number; sunday: number; holiday: number; premium: number }>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const hours = durationHours(entry.clockIn, entry.clockOut);
    const key = entry.userId;
    const bucket = byEmployee.get(key) ?? { name: `${entry.user.firstName} ${entry.user.lastName}`, validated: 0, pending: 0, rejected: 0, night: 0, sunday: 0, holiday: 0, premium: 0 };
    if (entry.status === "VALIDATED") bucket.validated += hours;
    else if (entry.status === "PENDING") bucket.pending += hours;
    else bucket.rejected += hours;
    const b = breakdowns.get(entry.id);
    if (b) {
      bucket.night += b.minutesByCategory.night / 60;
      bucket.sunday += b.minutesByCategory.sunday / 60;
      bucket.holiday += b.minutesByCategory.holiday / 60;
      bucket.premium += b.premiumMinutes / 60;
    }
    byEmployee.set(key, bucket);
  }
  const rows = [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name));

  const periodLabel =
    filters.from || filters.to
      ? `Du ${filters.from ? companyDateLabel(companyDayStart(filters.from)) : "…"} au ${filters.to ? companyDateLabel(companyDayStart(filters.to)) : "…"}`
      : "Toutes dates confondues";
  const editedAt = generatedAtLabel();

  // `bufferPages: true` : le document entier est gardé en mémoire (nombre de
  // pages typique ici : quelques unités à quelques dizaines) pour pouvoir
  // revenir numéroter chaque page une fois le total de pages connu — sinon
  // impossible de savoir "Page X sur Y" avant d'avoir écrit tout le contenu.
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Redessine l'en-tête sur CHAQUE page (y compris les suivantes générées
  // automatiquement par un tableau qui déborde) — sans ça, seule la première
  // page portait le logo/la marque, les suivantes commençaient nues.
  doc.on("pageAdded", () => drawBrandHeader(doc, "RELEVÉ D'HEURES", periodLabel, editedAt));
  drawBrandHeader(doc, "RELEVÉ D'HEURES", periodLabel, editedAt); // la première page existe déjà à la construction du document, avant qu'un listener ne puisse s'y accrocher

  // Chiffres clés de la période, lisibles d'un coup d'œil.
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const pendingTotal = sum((r) => r.pending);
  const rejectedTotal = sum((r) => r.rejected);
  drawKpiCards(doc, [
    { label: "Validées", value: formatHours(sum((r) => r.validated)) },
    { label: "En attente", value: formatHours(pendingTotal), tone: pendingTotal > 0 ? undefined : "muted" },
    { label: "Refusées", value: formatHours(rejectedTotal), tone: rejectedTotal > 0 ? "danger" : "muted" },
    { label: "Majorations", value: `+ ${formatHours(sum((r) => r.premium))}` },
    { label: rows.length > 1 ? "Salariés" : "Salarié", value: String(rows.length) },
  ]);
  drawSectionTitle(doc, "Synthèse par salarié");

  let headerY = doc.y;
  drawTableHeaderRow(doc, headerY);
  doc.y = headerY + 22;

  let totalValidated = 0;
  let totalPending = 0;
  let totalRejected = 0;
  rows.forEach((row, index) => {
    totalValidated += row.validated;
    totalPending += row.pending;
    totalRejected += row.rejected;

    // Nouvelle page si la ligne ne tient plus au-dessus du pied de page —
    // réaffiche l'en-tête de tableau (pas seulement l'en-tête de marque, géré
    // par 'pageAdded') pour que la page suivante reste lisible seule.
    if (doc.y + 20 > FOOTER_Y) {
      doc.addPage();
      headerY = doc.y;
      drawTableHeaderRow(doc, headerY);
      doc.y = headerY + 22;
    }

    const y = doc.y;
    if (index % 2 === 1) {
      doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.rowAlt);
    }
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9.5);
    doc.text(row.name, COL.name + 10, y + 5, { width: COL_WIDTHS.name });
    doc.fillColor(BRAND.accentDeep).text(formatHours(row.validated), COL.validated, y + 5, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(BRAND.inkSecondary).text(formatHours(row.pending), COL.pending, y + 5, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(row.rejected > 0 ? "#B42318" : BRAND.inkTertiary).text(formatHours(row.rejected), COL.rejected, y + 5, {
      width: COL_WIDTHS.num,
      align: "right",
    });
    doc.y = y + 20;
  });

  if (rows.length === 0) {
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(10).text("Aucun pointage sur cette période.", PAGE_LEFT, doc.y + 10);
  } else {
    doc.roundedRect(PAGE_LEFT, doc.y + 4, CONTENT_WIDTH, 24, 6).fill(BRAND.accentSoft);
    const totalY = doc.y + 11;
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10);
    doc.text("TOTAL", COL.name + 10, totalY, { width: COL_WIDTHS.name });
    doc.fillColor(BRAND.accentDeep).text(formatHours(totalValidated), COL.validated, totalY, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(BRAND.inkSecondary).text(formatHours(totalPending), COL.pending, totalY, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(totalRejected > 0 ? "#B42318" : BRAND.inkTertiary).text(formatHours(totalRejected), COL.rejected, totalY, {
      width: COL_WIDTHS.num,
      align: "right",
    });
  }

  // Second tableau : heures majorées (nuit, dimanche, férié) et majoration
  // totale, pour la fiche de paie (heures validées et en attente).
  if (rows.some((r) => r.night + r.sunday + r.holiday > 0)) {
    doc.y += 36;
    if (doc.y + 80 > FOOTER_Y) doc.addPage();
    drawSectionTitle(doc, "Heures majorées", "Nuit 21 h – 6 h, dimanche, jour férié : la majoration la plus favorable s'applique, sans cumul (convention collective de la propreté).");
    const drawPremiumHeader = (y: number) =>
      drawTableHeaderBar(doc, y, [
        { label: "SALARIÉ", x: PCOL.name + 10, width: 170 },
        { label: "NUIT", x: PCOL.night, width: 66, align: "right" },
        { label: "DIMANCHE", x: PCOL.sunday, width: 66, align: "right" },
        { label: "FÉRIÉ", x: PCOL.holiday, width: 66, align: "right" },
        { label: "MAJORATION", x: PCOL.premium, width: 70, align: "right" },
      ]);
    let py = doc.y;
    drawPremiumHeader(py);
    doc.y = py + 22;
    rows.forEach((row, index) => {
      if (doc.y + 20 > FOOTER_Y) {
        doc.addPage();
        py = doc.y;
        drawPremiumHeader(py);
        doc.y = py + 22;
      }
      const y = doc.y;
      if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.rowAlt);
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9.5);
      doc.text(row.name, PCOL.name + 10, y + 5, { width: 170 });
      doc.text(formatHours(row.night), PCOL.night, y + 5, { width: 66, align: "right" });
      doc.text(formatHours(row.sunday), PCOL.sunday, y + 5, { width: 66, align: "right" });
      doc.text(formatHours(row.holiday), PCOL.holiday, y + 5, { width: 66, align: "right" });
      doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").text(`+ ${formatHours(row.premium)}`, PCOL.premium, y + 5, { width: 70, align: "right" });
      doc.y = y + 20;
    });
  }

  await logActivity({
    userId: actor.userId,
    action: "TIME_ENTRIES_EXPORTED",
    entityType: "TimeEntry",
    metadata: { ...filters, rowCount: entries.length, format: "pdf" },
  });

  finalizePagination(doc);

  doc.end();
  return done;
}
