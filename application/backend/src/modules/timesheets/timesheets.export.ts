import ExcelJS from "exceljs";
import { companyDateLabel, companyDayStart, companyTimeKey } from "../../utils/companyTime";
import PDFDocument from "pdfkit";
import { prisma } from "../../db/prisma";
import { logActivity } from "../../utils/activityLog";
import { buildTimeEntriesWhere, timeEntrySelect, type Actor, type ListFilters } from "./timesheets.service";
import { BRAND, CONTENT_WIDTH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, drawHeader, finalizePagination } from "../../utils/pdfBrand";

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
    { header: "Statut", key: "status", width: 12 },
    { header: "Différé", key: "retroactive", width: 10 },
    { header: "Commentaire", key: "comment", width: 30 },
  ];
  detail.getRow(1).font = { bold: true };
  detail.autoFilter = { from: "A1", to: "H1" };

  for (const entry of entries) {
    const hours = durationHours(entry.clockIn, entry.clockOut);
    detail.addRow({
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

  const byEmployee = new Map<string, { name: string; validated: number; pending: number }>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const hours = durationHours(entry.clockIn, entry.clockOut);
    const key = entry.userId;
    const bucket = byEmployee.get(key) ?? { name: `${entry.user.firstName} ${entry.user.lastName}`, validated: 0, pending: 0 };
    if (entry.status === "VALIDATED") bucket.validated += hours;
    else if (entry.status === "PENDING") bucket.pending += hours;
    byEmployee.set(key, bucket);
  }

  const summary = workbook.addWorksheet("Récapitulatif");
  summary.columns = [
    { header: "Employé", key: "employee", width: 24 },
    { header: "Heures validées", key: "validated", width: 16 },
    { header: "Heures en attente", key: "pending", width: 18 },
    { header: "Total", key: "total", width: 12 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const [, v] of [...byEmployee.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    summary.addRow({
      employee: v.name,
      validated: Number(v.validated.toFixed(2)),
      pending: Number(v.pending.toFixed(2)),
      total: Number((v.validated + v.pending).toFixed(2)),
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

function drawTableHeaderRow(doc: PDFKit.PDFDocument, y: number): void {
  doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 22).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(9.5);
  doc.text("EMPLOYÉ", COL.name + 10, y + 7, { width: COL_WIDTHS.name });
  doc.text("VALIDÉES", COL.validated, y + 7, { width: COL_WIDTHS.num, align: "right" });
  doc.text("EN ATTENTE", COL.pending, y + 7, { width: COL_WIDTHS.num, align: "right" });
  doc.text("REFUSÉES", COL.rejected, y + 7, { width: COL_WIDTHS.num, align: "right" });
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

  const byEmployee = new Map<string, { name: string; validated: number; pending: number; rejected: number }>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const hours = durationHours(entry.clockIn, entry.clockOut);
    const key = entry.userId;
    const bucket = byEmployee.get(key) ?? { name: `${entry.user.firstName} ${entry.user.lastName}`, validated: 0, pending: 0, rejected: 0 };
    if (entry.status === "VALIDATED") bucket.validated += hours;
    else if (entry.status === "PENDING") bucket.pending += hours;
    else bucket.rejected += hours;
    byEmployee.set(key, bucket);
  }
  const rows = [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name));

  const periodLabel =
    filters.from || filters.to
      ? `Récapitulatif des heures · ${filters.from ? companyDateLabel(companyDayStart(filters.from)) : "…"} au ${
          filters.to ? companyDateLabel(companyDayStart(filters.to)) : "…"
        }`
      : "Récapitulatif des heures · toutes dates confondues";

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
  doc.on("pageAdded", () => drawHeader(doc, "Deep Clean", periodLabel));
  drawHeader(doc, "Deep Clean", periodLabel); // la première page existe déjà à la construction du document, avant qu'un listener ne puisse s'y accrocher

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
    doc.moveTo(PAGE_LEFT, doc.y + 2).lineTo(PAGE_RIGHT, doc.y + 2).strokeColor(BRAND.accentDeep).lineWidth(1.5).stroke();
    const totalY = doc.y + 10;
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10);
    doc.text("TOTAL", COL.name + 10, totalY, { width: COL_WIDTHS.name });
    doc.fillColor(BRAND.accentDeep).text(formatHours(totalValidated), COL.validated, totalY, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(BRAND.inkSecondary).text(formatHours(totalPending), COL.pending, totalY, { width: COL_WIDTHS.num, align: "right" });
    doc.fillColor(totalRejected > 0 ? "#B42318" : BRAND.inkTertiary).text(formatHours(totalRejected), COL.rejected, totalY, {
      width: COL_WIDTHS.num,
      align: "right",
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
