import { z } from "zod";
import {
  formatEuro,
  UNITS,
  VAT_RATES_BPS,
  type DocumentLineInput,
  type InvoiceSummaryDto,
  type MissionDto,
  type QuoteSummaryDto,
  MISSION_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  formatDayShort,
} from "@aussitot/shared";
import { AppError } from "../../../lib/errors.ts";
import { getOrgBasics } from "../../../lib/orgCache.ts";
import type { Ctx } from "../../../lib/context.ts";

/** Montants : l'assistant manipule des euros, l'application des centimes. */
export const eurosSchema = z.number().min(0).max(1_000_000);
export const toCents = (euros: number) => Math.round(euros * 100);
export const euros = (cents: number) => formatEuro(cents, { plain: true });

export const lineSchema = z.object({
  description: z.string().min(1).max(500).describe("Désignation de la prestation, telle qu'elle apparaîtra sur le document."),
  quantity: z.number().positive().max(99_999).describe("Quantité (heures, passages, m², forfaits…)."),
  unit: z
    .enum(UNITS)
    .describe("Unité : HOUR (heure), DAY (jour), UNIT (unité), SQM (m²), FLAT (forfait), MONTH (mois), VISIT (passage), KM (kilomètre)."),
  unit_price_eur: eurosSchema.describe("Prix unitaire HORS TAXES en euros."),
  vat_rate_percent: z
    .number()
    .optional()
    .describe("Taux de TVA en pourcentage (20, 10, 5.5, 2.1 ou 0). Par défaut : le taux habituel de l'entreprise."),
  discount_percent: z.number().min(0).max(100).optional().describe("Remise en pourcentage sur cette ligne."),
  catalog_item_id: z.uuid().optional().describe("Identifiant de la prestation du catalogue si elle en provient."),
});
export type AssistantLine = z.output<typeof lineSchema>;

export async function toDocumentLines(ctx: Ctx, lines: AssistantLine[]): Promise<DocumentLineInput[]> {
  const org = await getOrgBasics(ctx.orgId);
  return lines.map((line) => {
    const vatRateBps = line.vat_rate_percent === undefined ? org.defaultVatRateBps : Math.round(line.vat_rate_percent * 100);
    if (!(VAT_RATES_BPS as readonly number[]).includes(vatRateBps)) {
      throw AppError.badRequest(`Taux de TVA ${line.vat_rate_percent} % non autorisé (20, 10, 5,5, 2,1 ou 0).`);
    }
    return {
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: toCents(line.unit_price_eur),
      vatRateBps,
      discountBps: line.discount_percent ? Math.round(line.discount_percent * 100) : 0,
      catalogItemId: line.catalog_item_id ?? null,
    };
  });
}

export function quoteForModel(q: QuoteSummaryDto) {
  return {
    id: q.id,
    numero: q.number,
    statut: QUOTE_STATUS_LABELS[q.status],
    client: q.clientName,
    client_id: q.clientId,
    titre: q.title,
    date: q.issueDate,
    valable_jusqu_au: q.validUntil,
    total_ht: euros(q.subtotalCents),
    total_ttc: euros(q.totalCents),
  };
}

export function invoiceForModel(i: InvoiceSummaryDto) {
  return {
    id: i.id,
    type: i.kind === "CREDIT_NOTE" ? "avoir" : "facture",
    numero: i.number ?? "(brouillon, sans numéro)",
    statut: i.isOverdue ? "En retard de paiement" : INVOICE_STATUS_LABELS[i.status],
    client: i.clientName,
    client_id: i.clientId,
    titre: i.title,
    emise_le: i.issueDate,
    echeance: i.dueDate,
    total_ttc: euros(i.totalCents),
    deja_paye: euros(i.amountPaidCents),
    reste_a_payer: euros(i.totalCents - i.amountPaidCents),
  };
}

export function missionForModel(m: MissionDto) {
  return {
    id: m.id,
    titre: m.title,
    statut: MISSION_STATUS_LABELS[m.status],
    date: m.date,
    horaire: `${m.startTime}–${m.endTime}`,
    lieu: m.site ? `${m.site.name}${m.site.address ? `, ${m.site.address}` : ""}` : null,
    client: m.client?.name ?? null,
    equipe: m.assignees.map((a) => `${a.firstName} ${a.lastName}`),
    chef_equipe: m.teamLead ? `${m.teamLead.firstName} ${m.teamLead.lastName}` : null,
    consigne: m.instructions,
  };
}

export function missionListItem(m: MissionDto) {
  return {
    id: m.id,
    title: m.title,
    subtitle: `${formatDayShort(m.date, { year: false })} · ${m.startTime}–${m.endTime}${m.site ? ` · ${m.site.name}` : ""}`,
    trailing: MISSION_STATUS_LABELS[m.status],
    link: `/planning/${m.id}`,
  };
}
