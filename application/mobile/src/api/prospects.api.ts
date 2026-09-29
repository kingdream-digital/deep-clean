import { apiClient } from "./client";
import type { DirectoryUser } from "./users.api";

// Cahier des charges "Module commercial" — un prospect/client n'est jamais un
// utilisateur DeepClean : ces fiches sont internes, gérées par
// Superviseur/RH/Direction/Admin uniquement (voir backend prospects.routes.ts).
export type ProspectStatus =
  | "NEW"
  | "CONTACTED"
  | "MEETING_SCHEDULED"
  | "QUOTE_TO_PREPARE"
  | "QUOTE_SENT"
  | "NEGOTIATING"
  | "WON"
  | "LOST";

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  MEETING_SCHEDULED: "Rendez-vous",
  QUOTE_TO_PREPARE: "Devis à préparer",
  QUOTE_SENT: "Devis envoyé",
  NEGOTIATING: "En négociation",
  WON: "Gagné",
  LOST: "Perdu",
};

export const PROSPECT_STATUS_ORDER: ProspectStatus[] = [
  "NEW",
  "CONTACTED",
  "MEETING_SCHEDULED",
  "QUOTE_TO_PREPARE",
  "QUOTE_SENT",
  "NEGOTIATING",
  "WON",
  "LOST",
];

export interface Prospect {
  id: string;
  companyName: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  source: string | null;
  need: string | null;
  serviceType: string | null;
  notes: string | null;
  status: ProspectStatus;
  nextFollowUpAt: string | null;
  assignedUserId: string | null;
  assignedUser: Pick<DirectoryUser, "id" | "firstName" | "lastName" | "email"> | null;
  createdById: string;
  createdBy: Pick<DirectoryUser, "id" | "firstName" | "lastName" | "email">;
  createdAt: string;
  updatedAt: string;
  // Transformé en client ou non — voir convertProspectToClient() ci-dessous.
  hasClient: boolean;
}

interface ListProspectsResponse {
  items: Prospect[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listProspects(
  params: { status?: ProspectStatus; search?: string; assignedUserId?: string } = {}
): Promise<ListProspectsResponse> {
  const { data } = await apiClient.get<ListProspectsResponse>("/prospects", { params: { pageSize: 100, ...params } });
  return data;
}

export async function getProspect(id: string): Promise<Prospect> {
  const { data } = await apiClient.get<{ prospect: Prospect }>(`/prospects/${id}`);
  return data.prospect;
}

export interface ProspectInput {
  companyName: string;
  contactFirstName?: string;
  contactLastName?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  source?: string;
  need?: string;
  serviceType?: string;
  notes?: string;
  status?: ProspectStatus;
  nextFollowUpAt?: string;
  assignedUserId?: string | null;
}

export async function createProspect(input: ProspectInput): Promise<Prospect> {
  const { data } = await apiClient.post<{ prospect: Prospect }>("/prospects", input);
  return data.prospect;
}

export async function updateProspect(id: string, input: Partial<ProspectInput>): Promise<Prospect> {
  const { data } = await apiClient.patch<{ prospect: Prospect }>(`/prospects/${id}`, input);
  return data.prospect;
}

interface ConvertedClient {
  id: string;
  companyName: string;
}

// "Transformer en client" (cahier des charges §7) — reprend telles quelles
// les coordonnées du prospect, jamais ressaisies à la main. Purement manuel :
// ne crée ni devis, ni chantier, ni mission.
export async function convertProspectToClient(id: string): Promise<ConvertedClient> {
  const { data } = await apiClient.post<{ client: ConvertedClient }>(`/prospects/${id}/convert`);
  return data.client;
}
