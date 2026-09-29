import { apiClient } from "./client";
import type { QuoteItemUnit } from "./quotes.api";
import { QUOTE_ITEM_UNIT_LABELS } from "./quotes.api";
import type { SiteBillingMode } from "./sites.api";

export { QUOTE_ITEM_UNIT_LABELS as INVOICE_ITEM_UNIT_LABELS };

// Cahier des charges "Module commercial" — FACTURATION ≠ PLANNING (§29/§40) :
// une facture ne crée, ne modifie et ne supprime jamais de mission, de
// chantier ou d'événement de planning. Réservé à RH/Direction/Admin — le
// Superviseur n'a aucun accès à ce module (absent de sa liste de permissions,
// contrairement aux prospects/clients/devis).
export type InvoiceStatus = "DRAFT" | "VALIDATED" | "SENT" | "PAID" | "CANCELLED";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "À préparer",
  VALIDATED: "Validée",
  SENT: "Envoyée",
  PAID: "Payée",
  CANCELLED: "Annulée",
};

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  totalHt: number;
  sourceQuoteItemId: string | null;
  sortOrder: number;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  sourceQuoteItemId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  client: { id: string; companyName: string; email: string | null };
  quoteId: string | null;
  quote: { id: string; quoteNumber: string } | null;
  siteId: string | null;
  site: { id: string; name: string } | null;
  createdById: string;
  status: InvoiceStatus;
  billingMode: SiteBillingMode;
  period: string | null;
  issueDate: string;
  dueDate: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  siret: string | null;
  paymentTerms: string | null;
  internalNotes: string | null;
  subtotalHt: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelledComment: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
}

interface ListInvoicesResponse {
  items: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listInvoices(params: { status?: InvoiceStatus[]; clientId?: string; quoteId?: string; siteId?: string; search?: string } = {}): Promise<ListInvoicesResponse> {
  const { data } = await apiClient.get<ListInvoicesResponse>("/invoices", {
    params: { pageSize: 100, ...params, status: params.status?.join(",") },
  });
  return data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.get<{ invoice: Invoice }>(`/invoices/${id}`);
  return data.invoice;
}

export interface InvoiceInput {
  clientId: string;
  quoteId?: string;
  siteId?: string;
  billingMode?: SiteBillingMode;
  period?: string;
  dueDate?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  siret?: string;
  paymentTerms?: string;
  internalNotes?: string;
  vatRate?: number;
  items: InvoiceItemInput[];
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>("/invoices", input);
  return data.invoice;
}

export async function updateInvoice(id: string, input: Partial<Omit<InvoiceInput, "clientId" | "quoteId" | "siteId" | "billingMode" | "period">>): Promise<Invoice> {
  const { data } = await apiClient.patch<{ invoice: Invoice }>(`/invoices/${id}`, input);
  return data.invoice;
}

export async function validateInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/validate`);
  return data.invoice;
}

export async function sendInvoice(id: string, message?: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/send`, { message });
  return data.invoice;
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/pay`);
  return data.invoice;
}

export async function cancelInvoice(id: string, comment?: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/cancel`, { comment });
  return data.invoice;
}

export async function downloadInvoicePdf(id: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/invoices/${id}/pdf`, { responseType: "arraybuffer" });
  return new Uint8Array(data);
}
