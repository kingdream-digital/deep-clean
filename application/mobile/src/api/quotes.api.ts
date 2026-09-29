import { apiClient } from "./client";
import type { DirectoryUser } from "./users.api";

// Cahier des charges "Module commercial" — un devis accepté ne crée JAMAIS
// automatiquement de chantier, de mission ni d'événement de planning (§25,
// §40) : toute suite reste une action humaine, déclenchée depuis un bouton
// explicite (phase 8-10).
export type QuoteStatus = "DRAFT" | "TO_VALIDATE" | "VALIDATED" | "SENT" | "FOLLOW_UP" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Brouillon",
  TO_VALIDATE: "À valider",
  VALIDATED: "Validé",
  SENT: "Envoyé",
  FOLLOW_UP: "Relance en cours",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
};

export type QuoteItemUnit = "HOUR" | "DAY" | "INTERVENTION" | "SQUARE_METER" | "FLAT_RATE" | "MONTH" | "OTHER";

export const QUOTE_ITEM_UNIT_LABELS: Record<QuoteItemUnit, string> = {
  HOUR: "Heure",
  DAY: "Jour",
  INTERVENTION: "Intervention",
  SQUARE_METER: "m²",
  FLAT_RATE: "Forfait",
  MONTH: "Mois",
  OTHER: "Autre",
};

export type QuoteItemFrequency = "ONE_TIME" | "DAILY" | "MULTIPLE_PER_WEEK" | "WEEKLY" | "MULTIPLE_PER_MONTH" | "MONTHLY" | "CUSTOM";

export const QUOTE_ITEM_FREQUENCY_LABELS: Record<QuoteItemFrequency, string> = {
  ONE_TIME: "Ponctuelle",
  DAILY: "Quotidienne",
  MULTIPLE_PER_WEEK: "Plusieurs fois par semaine",
  WEEKLY: "Hebdomadaire",
  MULTIPLE_PER_MONTH: "Plusieurs fois par mois",
  MONTHLY: "Mensuelle",
  CUSTOM: "Personnalisée",
};

export type QuoteFollowUpMethod = "EMAIL" | "PHONE" | "SMS" | "MEETING" | "OTHER";

export const QUOTE_FOLLOW_UP_METHOD_LABELS: Record<QuoteFollowUpMethod, string> = {
  EMAIL: "Email",
  PHONE: "Téléphone",
  SMS: "SMS",
  MEETING: "Rendez-vous",
  OTHER: "Autre",
};

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  discount: number;
  totalHt: number;
  frequency: QuoteItemFrequency;
  occurrencesPerMonth: number | null;
  monthlyAmountHt: number;
  estimatedHours: number | null;
  estimatedEmployees: number | null;
  sortOrder: number;
}

export interface QuoteItemInput {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  discount?: number;
  frequency?: QuoteItemFrequency;
  occurrencesPerMonth?: number;
  estimatedHours?: number;
  estimatedEmployees?: number;
}

type PersonSummary = Pick<DirectoryUser, "id" | "firstName" | "lastName" | "email">;

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  client: { id: string; companyName: string; contactFirstName: string | null; contactLastName: string | null; email: string | null; phone: string | null };
  assignedUserId: string | null;
  assignedUser: PersonSummary | null;
  createdById: string;
  createdBy: PersonSummary;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string | null;
  subject: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  siret: string | null;
  siteAddress: string | null;
  description: string | null;
  paymentTerms: string | null;
  internalNotes: string | null;
  subtotalHt: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  monthlyAmountHt: number;
  nextFollowUpAt: string | null;
  acceptedAt: string | null;
  acceptedById: string | null;
  acceptedBy: PersonSummary | null;
  acceptedMethod: QuoteFollowUpMethod | null;
  acceptedComment: string | null;
  rejectedAt: string | null;
  rejectedComment: string | null;
  previousVersionId: string | null;
  nextVersion: { id: string; quoteNumber: string } | null;
  site: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
}

export interface QuoteEvent {
  id: string;
  action: string;
  method: QuoteFollowUpMethod | null;
  comment: string | null;
  createdAt: string;
  user: PersonSummary;
}

interface ListQuotesResponse {
  items: Quote[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listQuotes(params: { status?: QuoteStatus[]; clientId?: string; search?: string } = {}): Promise<ListQuotesResponse> {
  const { data } = await apiClient.get<ListQuotesResponse>("/quotes", {
    params: { pageSize: 100, ...params, status: params.status?.join(",") },
  });
  return data;
}

export async function getQuote(id: string): Promise<Quote> {
  const { data } = await apiClient.get<{ quote: Quote }>(`/quotes/${id}`);
  return data.quote;
}

export async function listQuoteEvents(id: string): Promise<QuoteEvent[]> {
  const { data } = await apiClient.get<{ items: QuoteEvent[] }>(`/quotes/${id}/events`);
  return data.items;
}

export interface QuoteInput {
  clientId: string;
  assignedUserId?: string | null;
  validUntil?: string;
  subject?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  siret?: string;
  siteAddress?: string;
  description?: string;
  paymentTerms?: string;
  internalNotes?: string;
  discount?: number;
  vatRate?: number;
  items: QuoteItemInput[];
}

export async function createQuote(input: QuoteInput): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>("/quotes", input);
  return data.quote;
}

export async function updateQuote(id: string, input: Partial<Omit<QuoteInput, "clientId">>): Promise<Quote> {
  const { data } = await apiClient.patch<{ quote: Quote }>(`/quotes/${id}`, input);
  return data.quote;
}

export async function submitQuoteForValidation(id: string): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/submit`);
  return data.quote;
}

export async function validateQuote(id: string): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/validate`);
  return data.quote;
}

export async function sendQuote(id: string, message?: string): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/send`, { message });
  return data.quote;
}

export async function recordQuoteFollowUp(id: string, input: { method: QuoteFollowUpMethod; comment?: string; nextFollowUpAt?: string }): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/follow-up`, input);
  return data.quote;
}

export async function markQuoteAccepted(id: string, input: { method: QuoteFollowUpMethod; comment?: string }): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/accept`, input);
  return data.quote;
}

export async function markQuoteRejected(id: string, input: { comment?: string }): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/reject`, input);
  return data.quote;
}

export async function markQuoteExpired(id: string): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/expire`);
  return data.quote;
}

export async function createQuoteVersion(id: string): Promise<Quote> {
  const { data } = await apiClient.post<{ quote: Quote }>(`/quotes/${id}/versions`);
  return data.quote;
}

// Le PDF n'est jamais servi par une URL publique (même principe que les
// photos, voir CLAUDE.md §11) — téléchargé via une requête authentifiée
// classique, puis partagé nativement (voir QuoteDetailScreen / utils/shareFile.ts).
export async function downloadQuotePdf(id: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/quotes/${id}/pdf`, { responseType: "arraybuffer" });
  return new Uint8Array(data);
}

// --- Calculs miroir (aperçu instantané côté mobile, avant tout appel serveur) ---
// Même formule que quotes.service.ts::computeItemTotals/computeQuoteTotals —
// le serveur recalcule toujours la vérité à l'enregistrement (cahier des
// charges §13), ceci ne sert qu'à un affichage réactif pendant la saisie.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function previewItemTotals(item: { quantity: number; unitPriceHt: number; discount?: number; frequency?: QuoteItemFrequency; occurrencesPerMonth?: number }) {
  const discount = item.discount ?? 0;
  const totalHt = round2(item.quantity * item.unitPriceHt * (1 - discount / 100));
  const monthlyAmountHt = item.frequency && item.frequency !== "ONE_TIME" && item.occurrencesPerMonth ? round2(totalHt * item.occurrencesPerMonth) : 0;
  return { totalHt, monthlyAmountHt };
}

export function previewQuoteTotals(items: { totalHt: number; monthlyAmountHt: number }[], discount: number, vatRate: number) {
  const subtotalHt = round2(items.reduce((sum, i) => sum + i.totalHt, 0));
  const taxableHt = Math.max(0, round2(subtotalHt - discount));
  const vatAmount = round2(taxableHt * (vatRate / 100));
  const totalTtc = round2(taxableHt + vatAmount);
  const monthlyAmountHt = round2(items.reduce((sum, i) => sum + i.monthlyAmountHt, 0));
  return { subtotalHt, vatAmount, totalTtc, monthlyAmountHt };
}
