import { Platform } from "react-native";
import { apiClient } from "./client";

export type MissionStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface MissionAssignee {
  userId: string;
  isLead: boolean;
  user: { id: string; firstName: string; lastName: string; email: string | null; role: string; hasAvatar: boolean; isActive?: boolean };
}

export interface MissionValidation {
  id: string;
  type: "MISSION_COMPLETION" | "SITE_CLOSURE" | "PROBLEM_RESOLUTION" | "ACCOUNT_CHANGE" | "OTHER";
  comment: string | null;
  createdAt: string;
  validatedBy: { id: string; firstName: string; lastName: string };
}

export interface JobSheet {
  id: string;
  tasks: string[];
  equipment: string[];
  safetyInstructions: string | null;
  notes: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface Mission {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  instructions: string | null;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; address: string; isActive: boolean; managerId: string | null };
  createdBy: { id: string; firstName: string; lastName: string };
  assignments: MissionAssignee[];
  validations: MissionValidation[];
  jobSheet: JobSheet | null;
  standard: { id: string; name: string } | null;
  // Document PDF déposé sur la mission (voir backend missions.service.ts) —
  // champs plats renvoyés tels quels par `missionSelect`, tous `null`
  // ensemble quand aucun document n'est attaché.
  standardDocumentFileName: string | null;
  standardDocumentSizeBytes: number | null;
  standardDocumentUploadedAt: string | null;
  standardDocumentUploadedBy: { id: string; firstName: string; lastName: string } | null;
  // Regroupe les occurrences générées ensemble par une mission récurrente
  // (voir createMission ci-dessous) — null pour une mission ponctuelle.
  recurrenceGroupId: string | null;
}

interface ListMissionsResponse {
  items: Mission[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListMissionsParams {
  siteId?: string;
  mine?: boolean;
  status?: MissionStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listMissions(params: ListMissionsParams = {}): Promise<ListMissionsResponse> {
  const { data } = await apiClient.get<ListMissionsResponse>("/missions", { params });
  return data;
}

export async function getMission(id: string): Promise<Mission> {
  const { data } = await apiClient.get<{ mission: Mission }>(`/missions/${id}`);
  return data.mission;
}

export interface MissionRecurrenceInput {
  // 0 = dimanche ... 6 = samedi (JS Date#getDay) — même convention que le serveur.
  daysOfWeek: number[];
  until: string;
}

export interface CreateMissionInput {
  siteId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  instructions?: string;
  assigneeIds: string[];
  leadId?: string;
  standardId?: string;
  recurrence?: MissionRecurrenceInput;
}

export interface CreateMissionResult {
  mission: Mission;
  recurrenceCount: number;
}

// `recurrenceCount` vaut 1 pour une mission ponctuelle (voir missions.service.ts
// côté serveur) — permet d'afficher "N missions créées" seulement quand une
// récurrence a effectivement généré plusieurs occurrences.
export async function createMission(input: CreateMissionInput): Promise<CreateMissionResult> {
  const { data } = await apiClient.post<CreateMissionResult>("/missions", input);
  return data;
}

export interface UpdateMissionInput {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  instructions?: string | null;
}

export async function updateMission(id: string, input: UpdateMissionInput): Promise<Mission> {
  const { data } = await apiClient.patch<{ mission: Mission }>(`/missions/${id}`, input);
  return data.mission;
}

export interface CancelMissionResult {
  mission: Mission;
  seriesCancelledCount: number;
}

// `scope: "series"` annule aussi toutes les occurrences À VENIR encore
// programmées de la même mission récurrente (voir missions.service.ts côté
// serveur) — jamais une occurrence déjà en cours, terminée ou passée.
export async function cancelMission(id: string, scope: "one" | "series" = "one"): Promise<CancelMissionResult> {
  const { data } = await apiClient.post<CancelMissionResult>(`/missions/${id}/cancel`, { scope });
  return data;
}

export async function setMissionStatus(id: string, status: "IN_PROGRESS" | "COMPLETED"): Promise<Mission> {
  const { data } = await apiClient.post<{ mission: Mission }>(`/missions/${id}/status`, { status });
  return data.mission;
}

export async function updateMissionAssignments(
  id: string,
  input: { assigneeIds: string[]; leadId?: string }
): Promise<Mission> {
  const { data } = await apiClient.put<{ mission: Mission }>(`/missions/${id}/assignments`, input);
  return data.mission;
}

// Réservé au chef d'équipe responsable du chantier — voir backend/src/modules/missions/missions.service.ts.
export async function validateMission(id: string, comment?: string): Promise<Mission> {
  const { data } = await apiClient.post<{ mission: Mission }>(`/missions/${id}/validate`, { comment });
  return data.mission;
}

export type AssignmentConflict =
  | {
      kind: "MISSION_OVERLAP";
      user: { id: string; firstName: string; lastName: string };
      conflictingMission: { id: string; title: string; startTime: string; endTime: string; site: { name: string } };
    }
  | {
      kind: "ABSENCE";
      user: { id: string; firstName: string; lastName: string };
      absence: { type: string; startDate: string; endDate: string };
    };

export async function getAssignmentConflicts(params: {
  assigneeIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  excludeMissionId?: string;
}): Promise<AssignmentConflict[]> {
  if (params.assigneeIds.length === 0) return [];
  const { data } = await apiClient.get<{ conflicts: AssignmentConflict[] }>("/missions/conflicts", {
    params: { ...params, assigneeIds: params.assigneeIds.join(",") },
  });
  return data.conflicts;
}

export interface JobSheetInput {
  tasks: string[];
  equipment: string[];
  safetyInstructions?: string | null;
  notes?: string | null;
}

export async function upsertJobSheet(missionId: string, input: JobSheetInput): Promise<Mission> {
  const { data } = await apiClient.put<{ mission: Mission }>(`/missions/${missionId}/job-sheet`, input);
  return data.mission;
}

export interface MissionTimeEntry {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  isRetroactive: boolean;
}

// Rapprochement approximatif par recoupement horaire (voir missions.service.ts
// côté serveur) — pas un lien garanti, présenté comme tel à l'affichage.
export async function getMissionTimeEntries(missionId: string): Promise<MissionTimeEntry[]> {
  const { data } = await apiClient.get<{ items: MissionTimeEntry[] }>(`/missions/${missionId}/time-entries`);
  return data.items;
}

export interface LocalDocumentAsset {
  uri: string;
  fileName: string;
  // Web uniquement (voir utils/webImagePicker.ts::pickWebFile) — même raison
  // que LocalPhotoAsset.file dans problems.api.ts : le FormData d'un vrai
  // navigateur n'accepte qu'un Blob/File, pas la forme {uri,name,type} que
  // seul React Native natif sait interpréter.
  file?: File;
}

export async function attachMissionStandardDocument(missionId: string, asset: LocalDocumentAsset): Promise<Mission> {
  const formData = new FormData();
  if (Platform.OS === "web" && asset.file) {
    formData.append("document", asset.file, asset.fileName);
  } else {
    formData.append("document", {
      uri: asset.uri,
      name: asset.fileName,
      type: "application/pdf",
    } as unknown as Blob);
  }

  const { data } = await apiClient.put<{ mission: Mission }>(`/missions/${missionId}/standard-document`, formData);
  return data.mission;
}

export async function removeMissionStandardDocument(missionId: string): Promise<Mission> {
  const { data } = await apiClient.delete<{ mission: Mission }>(`/missions/${missionId}/standard-document`);
  return data.mission;
}

export async function downloadMissionStandardDocument(missionId: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/missions/${missionId}/standard-document/file`, {
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}
