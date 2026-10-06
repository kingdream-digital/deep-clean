import { apiClient } from "./client";

export type AbsenceType = "PAID_LEAVE" | "SICK_LEAVE" | "UNPAID_LEAVE" | "WORK_ACCIDENT" | "PARENTAL_LEAVE" | "COMPENSATORY_REST" | "OTHER";

// Libellés complets, communs à toute l'application.
export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Arrêt maladie",
  UNPAID_LEAVE: "Congé sans solde",
  WORK_ACCIDENT: "Accident du travail",
  PARENTAL_LEAVE: "Maternité / paternité",
  COMPENSATORY_REST: "Repos compensateur (nuit)",
  OTHER: "Autre absence",
};
export type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface Absence {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: string; hasAvatar?: boolean };
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: AbsenceStatus;
  decidedBy: { id: string; firstName: string; lastName: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  // Nombre de jours OUVRÉS de la période, calculé côté serveur — jamais
  // recalculé côté mobile pour rester toujours identique à ce qui sera
  // réellement déduit du solde (voir leave.api.ts).
  daysCount: number;
}

interface ListAbsencesResponse {
  items: Absence[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListAbsencesParams {
  userId?: string;
  status?: AbsenceStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listAbsences(params: ListAbsencesParams = {}): Promise<ListAbsencesResponse> {
  const { data } = await apiClient.get<ListAbsencesResponse>("/absences", { params: { pageSize: 100, ...params } });
  return data;
}

export interface CreateAbsenceInput {
  userId?: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export async function createAbsence(input: CreateAbsenceInput): Promise<Absence> {
  const { data } = await apiClient.post<{ absence: Absence }>("/absences", input);
  return data.absence;
}

export async function decideAbsence(id: string, status: "APPROVED" | "REJECTED", decisionNote?: string): Promise<Absence> {
  const { data } = await apiClient.post<{ absence: Absence }>(`/absences/${id}/decide`, { status, decisionNote });
  return data.absence;
}

// Retour explicite du client (section "Modification et annulation") — recrédite
// le solde si le congé annulé était un congé payé déjà approuvé (voir
// leave.api.ts pour consulter l'effet sur le compteur).
export async function cancelAbsence(id: string): Promise<Absence> {
  const { data } = await apiClient.post<{ absence: Absence }>(`/absences/${id}/cancel`);
  return data.absence;
}

// Utilisé pour retrouver l'employé concerné par une notification "Demande
// d'absence" (relatedEntityId = l'absence, pas l'employé) avant de naviguer
// vers sa fiche — voir NotificationsList.tsx::handleOpenRelatedEntity.
export async function getAbsence(id: string): Promise<Absence> {
  const { data } = await apiClient.get<{ absence: Absence }>(`/absences/${id}`);
  return data.absence;
}
