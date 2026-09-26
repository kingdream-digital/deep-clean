import { apiClient } from "./client";

export interface Site {
  id: string;
  name: string;
  address: string;
  description: string | null;
  isActive: boolean;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string; email: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

interface ListSitesResponse {
  items: Site[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listSites(params: { isActive?: boolean } = {}): Promise<ListSitesResponse> {
  const { data } = await apiClient.get<ListSitesResponse>("/sites", {
    params: { pageSize: 100, ...params },
  });
  return data;
}

export async function getSite(id: string): Promise<Site> {
  const { data } = await apiClient.get<{ site: Site }>(`/sites/${id}`);
  return data.site;
}

export interface CreateSiteInput {
  name: string;
  address: string;
  description?: string;
  managerId?: string;
}

// Réservé RH / Direction / Admin (voir backend/src/modules/sites/sites.routes.ts).
export async function createSite(input: CreateSiteInput): Promise<Site> {
  const { data } = await apiClient.post<{ site: Site }>("/sites", input);
  return data.site;
}

export async function updateSite(
  id: string,
  input: Partial<Omit<CreateSiteInput, "managerId">> & { managerId?: string | null; isActive?: boolean }
): Promise<Site> {
  const { data } = await apiClient.patch<{ site: Site }>(`/sites/${id}`, input);
  return data.site;
}
