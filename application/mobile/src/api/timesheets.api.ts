import { apiClient } from "./client";
import type { Role } from "./auth.api";

export type TimeEntryStatus = "PENDING" | "VALIDATED" | "REJECTED";

export interface TimeEntry {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: Role };
  clockIn: string;
  clockOut: string | null;
  status: TimeEntryStatus;
  validatedById: string | null;
  validatedBy: { id: string; firstName: string; lastName: string } | null;
  validatedAt: string | null;
  comment: string | null;
  isRetroactive: boolean;
  createdAt: string;
  updatedAt: string;
  // Non null seulement pour un pointage VALIDÉ dont la durée dépasse celle
  // de la ou des missions auxquelles il se rattache (recoupement horaire) —
  // voir timesheets.service.ts `attachOvertimeInfo`.
  overtimeMinutes: number | null;
}

interface ListTimeEntriesResponse {
  items: TimeEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function clockIn(): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>("/time-entries/clock-in");
  return data.entry;
}

export async function clockOut(): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>("/time-entries/clock-out");
  return data.entry;
}

export async function getMyTimesheetStatus(): Promise<{ clockedIn: boolean; openEntry: TimeEntry | null }> {
  const { data } = await apiClient.get<{ clockedIn: boolean; openEntry: TimeEntry | null }>("/time-entries/me/status");
  return data;
}

export async function getTimeEntry(id: string): Promise<TimeEntry> {
  const { data } = await apiClient.get<{ entry: TimeEntry }>(`/time-entries/${id}`);
  return data.entry;
}

export async function createRetroactiveTimeEntry(input: {
  clockIn: string;
  clockOut: string;
  comment?: string;
}): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>("/time-entries/retroactive", input);
  return data.entry;
}

export interface ListTimeEntriesParams {
  userId?: string;
  status?: TimeEntryStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listTimeEntries(params: ListTimeEntriesParams = {}): Promise<ListTimeEntriesResponse> {
  const { data } = await apiClient.get<ListTimeEntriesResponse>("/time-entries", { params });
  return data;
}

export async function validateTimeEntry(id: string, comment?: string): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>(`/time-entries/${id}/validate`, { comment });
  return data.entry;
}

export async function rejectTimeEntry(id: string, comment: string): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>(`/time-entries/${id}/reject`, { comment });
  return data.entry;
}

// Dossier RH pour la paie — même portée serveur que listTimeEntries (un chef
// d'équipe ne peut exporter que son équipe, voir timesheets.service.ts).
export async function exportTimeEntriesCsv(params: ListTimeEntriesParams = {}): Promise<string> {
  const { data } = await apiClient.get<string>("/time-entries/export", {
    params,
    responseType: "text",
    transformResponse: (raw) => raw,
  });
  return data;
}

export async function exportTimeEntriesExcel(params: ListTimeEntriesParams = {}): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>("/time-entries/export.xlsx", {
    params,
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}

export async function exportTimeEntriesPdf(params: ListTimeEntriesParams = {}): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>("/time-entries/export.pdf", {
    params,
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}

export interface ReconciliationRow {
  user: { id: string; firstName: string; lastName: string };
  scheduledMinutes: number;
  workedMinutes: number;
  missionsCount: number;
  pendingCount: number;
  rejectedCount: number;
  status: "OK" | "ANOMALY";
}

// Menu RH "pointage vs mission" — vert si les heures pointées correspondent
// aux missions planifiées et que tout a été traité par un validateur, rouge
// s'il reste un écart à examiner (voir timesheets.service.ts pour la règle exacte).
export async function getReconciliation(from: string, to: string): Promise<ReconciliationRow[]> {
  const { data } = await apiClient.get<{ items: ReconciliationRow[] }>("/time-entries/reconciliation", {
    params: { from, to },
  });
  return data.items;
}

export interface ReconciliationMissionEntry {
  mission: { id: string; title: string; date: string; startTime: string; endTime: string; site: { name: string } };
  scheduledMinutes: number;
  matchedEntries: Array<{
    id: string;
    clockIn: string;
    clockOut: string | null;
    status: TimeEntryStatus;
    isRetroactive: boolean;
    validatedBy: { id: string; firstName: string; lastName: string } | null;
  }>;
  workedMinutes: number;
  gapMinutes: number;
}

export interface ReconciliationDetail {
  user: { id: string; firstName: string; lastName: string };
  missions: ReconciliationMissionEntry[];
  unmatchedEntries: Array<{
    id: string;
    clockIn: string;
    clockOut: string | null;
    status: TimeEntryStatus;
    isRetroactive: boolean;
    validatedBy: { id: string; firstName: string; lastName: string } | null;
  }>;
  totals: { scheduledMinutes: number; workedMinutes: number };
}

export async function getReconciliationDetail(userId: string, from: string, to: string): Promise<ReconciliationDetail> {
  const { data } = await apiClient.get<ReconciliationDetail>(`/time-entries/reconciliation/${userId}`, {
    params: { from, to },
  });
  return data;
}
