import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { Role } from "./auth.api";

export type TimeEntryStatus = "PENDING" | "VALIDATED" | "REJECTED";

export interface TimeEntry {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: Role; hasAvatar?: boolean };
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
  // Justificatif anti-fraude (retour explicite du client) : position GPS et
  // photo capturées sur le terrain au moment du pointage — absentes seulement
  // sur un pointage différé (`isRetroactive`, saisi après coup, personne sur
  // place pour les capturer). La photo elle-même n'est jamais dans cette
  // réponse (voir clockInPhotoUrl/clockOutPhotoUrl) : seul un indicateur de
  // présence, même principe que Photo.storageKey côté serveur.
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockInAccuracy: number | null;
  hasClockInPhoto: boolean;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
  clockOutAccuracy: number | null;
  hasClockOutPhoto: boolean;
  // Chantier/mission auquel ce pointage correspond le mieux (recoupement
  // horaire, voir timesheets.service.ts::attachMatchedMissions) — absent
  // (null) tant que le pointage n'est pas clôturé, ou si aucune mission ne
  // recoupe la période pointée. Permet de comparer l'heure PRÉVUE (ce champ)
  // à l'heure POINTÉE (clockIn/clockOut) juste à côté du justificatif photo.
  matchedMission: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    site: { name: string; address: string; latitude: number | null; longitude: number | null };
  } | null;
  // Distance à vol d'oiseau (mètres) entre le point capturé et le chantier de
  // `matchedMission` — calcul purement local côté serveur (retour explicite
  // du client : aucun service de géocodage externe), `null` si le chantier
  // n'a pas encore de position GPS enregistrée ou si aucune mission ne
  // correspond à ce pointage.
  clockInDistanceMeters: number | null;
  clockOutDistanceMeters: number | null;
}

export interface ClockPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// Même forme que LocalPhotoAsset (api/problems.api.ts) — un justificatif de
// pointage est capturé exactement de la même façon qu'une photo de
// signalement (voir hooks/useClockStatus.ts).
export interface ClockPhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
}

function buildClockFormData(position: ClockPosition, photo: ClockPhotoAsset): FormData {
  const formData = new FormData();
  formData.append("latitude", String(position.latitude));
  formData.append("longitude", String(position.longitude));
  if (position.accuracy !== undefined) formData.append("accuracy", String(position.accuracy));

  if (Platform.OS === "web" && photo.file) {
    formData.append("photo", photo.file, photo.fileName ?? photo.file.name);
  } else {
    formData.append("photo", {
      uri: photo.uri,
      name: photo.fileName ?? `pointage-${Date.now()}.jpg`,
      type: photo.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }
  return formData;
}

interface ListTimeEntriesResponse {
  items: TimeEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function clockIn(position: ClockPosition, photo: ClockPhotoAsset): Promise<TimeEntry> {
  // Ne jamais fixer Content-Type manuellement : le client doit générer
  // lui-même l'en-tête "multipart/form-data; boundary=..." (même remarque que
  // uploadProblemPhoto, api/problems.api.ts).
  const { data } = await apiClient.post<{ entry: TimeEntry }>("/time-entries/clock-in", buildClockFormData(position, photo));
  return data.entry;
}

export async function clockOut(position: ClockPosition, photo: ClockPhotoAsset): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>("/time-entries/clock-out", buildClockFormData(position, photo));
  return data.entry;
}

export function clockInPhotoUrl(timeEntryId: string): string {
  return `${API_URL}/time-entries/${timeEntryId}/clock-in-photo`;
}

export function clockOutPhotoUrl(timeEntryId: string): string {
  return `${API_URL}/time-entries/${timeEntryId}/clock-out-photo`;
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
  user: { id: string; firstName: string; lastName: string; phone?: string | null };
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

// Pointage saisi par un responsable pour un collaborateur, sur une de ses
// missions (oubli de pointer, vérifié par téléphone). Enregistré validé.
export async function createTimeEntryForUser(
  userId: string,
  input: { missionId: string; clockIn: string; clockOut: string; comment: string }
): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ entry: TimeEntry }>(`/time-entries/for-user/${userId}`, input);
  return data.entry;
}
