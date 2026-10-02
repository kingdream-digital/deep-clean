import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { Role } from "./auth.api";
import type { LocalPhotoAsset } from "./problems.api";

export interface DirectoryUser {
  id: string;
  // Identifiant de connexion, généré par le serveur (voir
  // backend/src/utils/username.ts) — jamais fourni ni modifiable ici.
  username: string;
  // Coordonnée de contact optionnelle, sans rôle dans la connexion.
  email: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role;
  // Date d'entrée dans l'entreprise (jour calendaire, minuit UTC) — vue
  // RH/direction/admin uniquement.
  hireDate?: string;
  // Absent (jamais `false`) pour un appelant qui n'a que la vue "annuaire"
  // (voir backend/src/modules/users/users.service.ts::contactSelect) —
  // l'état du compte n'est exposé qu'à la RH/direction/admin/superviseur.
  // Ne jamais traiter "absent" comme "désactivé".
  isActive?: boolean;
  // Jamais la clé de stockage elle-même (voir backend/src/modules/users/users.service.ts::presentUser) —
  // juste de quoi savoir s'il faut appeler avatarUrl() ou afficher les initiales.
  hasAvatar: boolean;
}

// Photo de profil — toujours facultative (voir CLAUDE.md section 3) : jamais
// d'URL publique permanente, chaque affichage repasse par une requête
// authentifiée (voir components/AuthenticatedImage.tsx), comme les autres
// photos de l'application.
export function avatarUrl(userId: string): string {
  return `${API_URL}/users/${userId}/avatar/file`;
}

export async function uploadAvatar(asset: LocalPhotoAsset): Promise<DirectoryUser> {
  const formData = new FormData();
  if (Platform.OS === "web" && asset.file) {
    formData.append("photo", asset.file, asset.fileName ?? asset.file.name);
  } else {
    formData.append("photo", {
      uri: asset.uri,
      name: asset.fileName ?? `avatar-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }

  const { data } = await apiClient.put<{ user: DirectoryUser }>("/users/me/avatar", formData);
  return data.user;
}

export async function removeAvatar(): Promise<DirectoryUser> {
  const { data } = await apiClient.delete<{ user: DirectoryUser }>("/users/me/avatar");
  return data.user;
}

interface ListUsersResponse {
  items: DirectoryUser[];
  total: number;
  page: number;
  pageSize: number;
}

// Réservé RH / Direction / Chef d'équipe / Admin (voir backend/src/modules/users/users.routes.ts) —
// utilisé ici pour composer les équipes affectées aux missions.
export async function listUsers(params: { role?: Role; isActive?: boolean; search?: string } = {}): Promise<ListUsersResponse> {
  const { data } = await apiClient.get<ListUsersResponse>("/users", {
    params: { pageSize: 100, ...params },
  });
  return data;
}

export async function getUser(id: string): Promise<DirectoryUser> {
  const { data } = await apiClient.get<{ user: DirectoryUser }>(`/users/${id}`);
  return data.user;
}

export interface CreateUserInput {
  email?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  hireDate?: string;
}

// Réservé RH / Admin — seule façon de créer un compte (aucune inscription
// publique). Le mot de passe temporaire n'est renvoyé qu'une seule fois, ici :
// jamais stocké ni consultable ensuite.
export async function createUser(input: CreateUserInput): Promise<{ user: DirectoryUser; temporaryPassword: string }> {
  const { data } = await apiClient.post<{ user: DirectoryUser; temporaryPassword: string }>("/users", input);
  return data;
}

export async function updateUser(
  id: string,
  input: { firstName?: string; lastName?: string; phone?: string | null; role?: Role; hireDate?: string }
): Promise<DirectoryUser> {
  const { data } = await apiClient.patch<{ user: DirectoryUser }>(`/users/${id}`, input);
  return data.user;
}

export async function activateUser(id: string): Promise<DirectoryUser> {
  const { data } = await apiClient.post<{ user: DirectoryUser }>(`/users/${id}/activate`);
  return data.user;
}

export async function deactivateUser(id: string): Promise<DirectoryUser> {
  const { data } = await apiClient.post<{ user: DirectoryUser }>(`/users/${id}/deactivate`);
  return data.user;
}

// Réinitialise l'accès sans jamais exposer l'ancien mot de passe — génère un
// nouveau mot de passe temporaire à usage unique, à transmettre à l'utilisateur.
export async function resetUserAccess(id: string): Promise<{ temporaryPassword: string }> {
  const { data } = await apiClient.post<{ temporaryPassword: string }>(`/users/${id}/reset-access`);
  return data;
}

export interface DossierTimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  isRetroactive: boolean;
  comment: string | null;
}

export interface DossierAbsence {
  id: string;
  type: "PAID_LEAVE" | "SICK_LEAVE" | "UNPAID_LEAVE" | "OTHER";
  startDate: string;
  endDate: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  decisionNote: string | null;
}

export interface DossierMission {
  id: string;
  title: string;
  date: string;
  endTime: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  site: { id: string; name: string };
}

export interface DossierActivity {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

// Dossier employé — centralise pointages, absences, missions et journal
// d'activité pour la RH (voir backend/src/modules/users/users.service.ts::getEmployeeDossier).
// Réservé RH / Direction / Admin / Superviseur ; renvoie 403 pour les autres rôles.
export interface EmployeeDossier {
  user: DirectoryUser;
  timesheet: {
    windowDays: number;
    totals: { validatedMinutes: number; pendingMinutes: number; rejectedMinutes: number };
    recent: DossierTimeEntry[];
  };
  absences: {
    approvedDaysThisYearByType: Record<string, number>;
    pendingCount: number;
    recent: DossierAbsence[];
  };
  missions: {
    totals: { completed: number; upcoming: number; cancelled: number };
    recent: DossierMission[];
  };
  activity: DossierActivity[];
}

export async function getEmployeeDossier(id: string): Promise<EmployeeDossier> {
  const { data } = await apiClient.get<EmployeeDossier>(`/users/${id}/dossier`);
  return data;
}

// PDF complet (pointages détaillés + absences) sur une période explicite —
// pour l'archivage RH et la préparation de la fiche de paye (voir
// backend/src/modules/users/users.export.ts). Distinct du récapitulatif
// multi-employés de timesheets.api.ts::exportTimeEntriesPdf (une ligne par
// personne, sans les absences) : celui-ci porte sur UNE SEULE personne avec
// le détail complet.
export async function exportEmployeeDossierPdf(id: string, from: string, to: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/users/${id}/dossier/export.pdf`, {
    params: { from, to },
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}
