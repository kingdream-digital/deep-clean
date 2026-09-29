import { apiClient } from "./client";

// Cahier des charges "Module commercial" — un client n'est JAMAIS un
// utilisateur DeepClean : il n'a ni accès à l'application, ni planning, ni
// espace personnel. Ces coordonnées ne servent qu'à générer devis/factures
// et à rattacher des chantiers (voir backend clients.routes.ts).
export interface Client {
  id: string;
  companyName: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  notes: string | null;
  prospectId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListClientsResponse {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listClients(params: { search?: string } = {}): Promise<ListClientsResponse> {
  const { data } = await apiClient.get<ListClientsResponse>("/clients", { params: { pageSize: 100, ...params } });
  return data;
}

export async function getClient(id: string): Promise<Client> {
  const { data } = await apiClient.get<{ client: Client }>(`/clients/${id}`);
  return data.client;
}

export interface ClientInput {
  companyName: string;
  contactFirstName?: string;
  contactLastName?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  notes?: string;
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { data } = await apiClient.post<{ client: Client }>("/clients", input);
  return data.client;
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const { data } = await apiClient.patch<{ client: Client }>(`/clients/${id}`, input);
  return data.client;
}
