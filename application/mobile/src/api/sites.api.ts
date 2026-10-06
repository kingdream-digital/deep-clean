import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { LocalPhotoAsset } from "./problems.api";

export interface Site {
  id: string;
  name: string;
  address: string;
  description: string | null;
  isActive: boolean;
  // Photo du chantier (retour explicite du client : "un visuel directement")
  // — jamais la clé de stockage elle-même, voir sitePhotoUrl() ci-dessous et
  // le même principe que Announcement.hasCoverPhoto/User.hasAvatar.
  hasPhoto: boolean;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string; email: string | null; hasAvatar?: boolean } | null;
  // Superviseur fixe du chantier — retour explicite du client : distinct du
  // chef d'équipe (manager/managerId), qui peut varier d'un jour à l'autre
  // sur les missions. Le superviseur, lui, ne change pas.
  supervisorId: string | null;
  supervisor: { id: string; firstName: string; lastName: string; email: string | null; hasAvatar?: boolean } | null;
  // Position GPS de référence du chantier — calculée automatiquement par le
  // serveur à partir de `address` (géocodage, voir sites.service.ts), jamais
  // envoyée par le client. Absente si l'adresse n'a pas été reconnue ; permet
  // de vérifier automatiquement, en interne, la distance d'un pointage par
  // rapport au chantier prévu (voir timesheets.api.ts).
  latitude: number | null;
  longitude: number | null;
  // Lien commercial optionnel (module commercial §19-21) — rempli uniquement
  // quand le chantier a été créé à partir d'un devis accepté ; absent pour un
  // chantier opérationnel classique.
  clientId: string | null;
  client: { id: string; companyName: string } | null;
  quoteId: string | null;
  quote: { id: string; quoteNumber: string } | null;
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
  supervisorId?: string;
  // Voir §19-21 — uniquement renseigné via "Créer un chantier à partir du
  // devis" (voir QuoteDetailScreen), jamais pour un chantier opérationnel
  // classique créé depuis la liste des chantiers.
  clientId?: string;
  quoteId?: string;
}

// Réservé RH / Direction / Admin (voir backend/src/modules/sites/sites.routes.ts).
export async function createSite(input: CreateSiteInput): Promise<Site> {
  const { data } = await apiClient.post<{ site: Site }>("/sites", input);
  return data.site;
}

export async function updateSite(
  id: string,
  input: Partial<Omit<CreateSiteInput, "managerId" | "supervisorId">> & {
    managerId?: string | null;
    supervisorId?: string | null;
    isActive?: boolean;
  }
): Promise<Site> {
  const { data } = await apiClient.patch<{ site: Site }>(`/sites/${id}`, input);
  return data.site;
}

// Jamais d'URL publique permanente (voir CLAUDE.md section 11) : chaque
// affichage repasse par une requête authentifiée, voir components/AuthenticatedImage.tsx.
export function sitePhotoUrl(siteId: string): string {
  return `${API_URL}/sites/${siteId}/photo/file`;
}

export async function uploadSitePhoto(siteId: string, asset: LocalPhotoAsset): Promise<Site> {
  const formData = new FormData();
  if (Platform.OS === "web" && asset.file) {
    formData.append("photo", asset.file, asset.fileName ?? asset.file.name);
  } else {
    formData.append("photo", {
      uri: asset.uri,
      name: asset.fileName ?? `chantier-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }

  const { data } = await apiClient.put<{ site: Site }>(`/sites/${siteId}/photo`, formData);
  return data.site;
}

export async function removeSitePhoto(siteId: string): Promise<Site> {
  const { data } = await apiClient.delete<{ site: Site }>(`/sites/${siteId}/photo`);
  return data.site;
}

// --- Objectifs et suivi mensuel (module commercial §22-24/§28) -------------
// L'objectif est saisi manuellement ; le "réalisé" est toujours recalculé
// côté serveur depuis les missions réelles du chantier — jamais une valeur
// qui pourrait dériver (§34).

export type SiteBillingMode = "FLAT_RATE" | "PER_SERVICE";

export interface SiteTarget {
  id: string;
  siteId: string;
  period: string;
  plannedVisits: number;
  plannedHours: number | null;
  plannedAmount: number | null;
  billingMode: SiteBillingMode;
  createdAt: string;
  updatedAt: string;
}

export interface SiteProgress {
  period: string;
  target: { plannedVisits: number; plannedHours: number | null; plannedAmount: number | null; billingMode: SiteBillingMode } | null;
  scheduledVisits: number;
  completedVisits: number;
  cancelledVisits: number;
  // Objectif − réalisées.
  remainingVisits: number | null;
  // Objectif − programmées (une mission programmée est déduite tout de suite).
  toScheduleVisits: number | null;
  // Programmées au-delà de l'objectif.
  extraVisits: number;
  plannedHours: number;
  actualHours: number;
  // Proposé à partir du devis tant qu'aucun objectif n'est défini ce mois-ci.
  suggestedTarget?: { plannedVisits: number; plannedHours: number | null; plannedAmount: number | null } | null;
}

export async function upsertSiteTarget(
  siteId: string,
  input: { period: string; plannedVisits: number; plannedHours?: number; plannedAmount?: number; billingMode?: SiteBillingMode }
): Promise<SiteTarget> {
  const { data } = await apiClient.post<{ target: SiteTarget }>(`/sites/${siteId}/targets`, input);
  return data.target;
}

export async function listSiteTargets(siteId: string): Promise<SiteTarget[]> {
  const { data } = await apiClient.get<{ items: SiteTarget[] }>(`/sites/${siteId}/targets`);
  return data.items;
}

export async function getSiteProgress(siteId: string, period: string): Promise<SiteProgress> {
  const { data } = await apiClient.get<{ progress: SiteProgress }>(`/sites/${siteId}/progress`, { params: { period } });
  return data.progress;
}

/** Période "AAAA-MM" du mois courant — période par défaut du suivi. */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
