import { apiClient } from "./client";
import type { InvoiceStatus } from "./invoices.api";

// Espace Super PDP (facture électronique, réforme 2026) — réservé à
// RH/Direction/Admin comme le reste de la facturation. Tout vient du
// serveur : état réel de la connexion, contrôles et statuts officiels.

export type EinvoiceView = "toSend" | "inProgress" | "attention" | "done";

export interface EinvoicingOverview {
  connection: { configured: boolean; host: string };
  // `missing` : ce qui manque à l'identité légale de l'entreprise (COMPANY_*).
  company: { name: string; missing: string[] };
  counts: Record<EinvoiceView, number>;
  lastSyncAt: string | null;
  // Échéances légales (AAAA-MM-JJ) : réception, puis émission pour les PME.
  deadlines: { reception: string; emission: string };
}

export interface EinvoiceRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  totalTtc: number;
  clientName: string;
  pdpStatus: string | null;
  pdpStatusLabel: string | null;
  pdpError: string | null;
  pdpSentAt: string | null;
  pdpUpdatedAt: string | null;
  // Seulement pour « à transmettre » : ce qui empêche encore l'envoi.
  blockers: string[];
}

export interface EinvoiceSyncResult {
  checked: number;
  changed: number;
  failed: number;
}

export async function getEinvoicingOverview(): Promise<EinvoicingOverview> {
  const { data } = await apiClient.get<{ overview: EinvoicingOverview }>("/einvoicing/overview");
  return data.overview;
}

export async function listEinvoices(view: EinvoiceView): Promise<{ items: EinvoiceRow[]; total: number }> {
  const { data } = await apiClient.get<{ items: EinvoiceRow[]; total: number }>("/einvoicing/invoices", { params: { view } });
  return data;
}

export async function syncEinvoices(): Promise<EinvoiceSyncResult> {
  const { data } = await apiClient.post<{ result: EinvoiceSyncResult }>("/einvoicing/sync");
  return data.result;
}

export async function testEinvoicingConnection(): Promise<{ ok: boolean; host: string; checkedAt: string }> {
  const { data } = await apiClient.post<{ result: { ok: boolean; host: string; checkedAt: string } }>("/einvoicing/test-connection");
  return data.result;
}

/** Jours restants avant une échéance (AAAA-MM-JJ) ; négatif si dépassée. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y!, m! - 1, d!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
