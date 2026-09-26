import { apiClient } from "./client";

export type AbsenceType = "PAID_LEAVE" | "SICK_LEAVE" | "UNPAID_LEAVE" | "OTHER";
export type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Absence {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: string };
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

// Utilisé pour retrouver l'employé concerné par une notification "Demande
// d'absence" (relatedEntityId = l'absence, pas l'employé) avant de naviguer
// vers sa fiche — voir NotificationsList.tsx::handleOpenRelatedEntity.
export async function getAbsence(id: string): Promise<Absence> {
  const { data } = await apiClient.get<{ absence: Absence }>(`/absences/${id}`);
  return data.absence;
}
