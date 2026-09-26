import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";

export type ProblemType = "ISSUE" | "MISSING_MATERIAL";
export type ProblemStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "VALIDATED";

export interface ProblemPhoto {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string;
  // Conservation limitée (voir backend/src/modules/problems/problems.service.ts) :
  // 0 signifie "sera supprimée à la prochaine purge automatique".
  daysUntilDeletion: number;
}

export interface ProblemComment {
  id: string;
  comment: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string };
}

export interface Problem {
  id: string;
  type: ProblemType;
  description: string;
  status: ProblemStatus;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; managerId: string | null };
  mission: { id: string; title: string; date: string } | null;
  reportedBy: { id: string; firstName: string; lastName: string; role: string };
  photos: ProblemPhoto[];
  comments: ProblemComment[];
}

interface ListProblemsResponse {
  items: Problem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateProblemInput {
  missionId: string;
  type: ProblemType;
  description: string;
}

export async function createProblem(input: CreateProblemInput): Promise<Problem> {
  const { data } = await apiClient.post<{ problem: Problem }>("/problems", input);
  return data.problem;
}

export async function listProblems(
  params: { missionId?: string; siteId?: string; status?: ProblemStatus } = {}
): Promise<ListProblemsResponse> {
  const { data } = await apiClient.get<ListProblemsResponse>("/problems", { params: { pageSize: 100, ...params } });
  return data;
}

export async function getProblem(id: string): Promise<Problem> {
  const { data } = await apiClient.get<{ problem: Problem }>(`/problems/${id}`);
  return data.problem;
}

export async function setProblemStatus(id: string, status: Exclude<ProblemStatus, "NEW">): Promise<Problem> {
  const { data } = await apiClient.post<{ problem: Problem }>(`/problems/${id}/status`, { status });
  return data.problem;
}

export async function addProblemComment(id: string, comment: string): Promise<ProblemComment> {
  const { data } = await apiClient.post<{ comment: ProblemComment }>(`/problems/${id}/comments`, { comment });
  return data.comment;
}

export interface LocalPhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  // Web uniquement (voir utils/webImagePicker.ts) : le vrai fichier issu du
  // sélecteur du navigateur. Nécessaire côté web car son `FormData` natif
  // n'accepte qu'un `Blob`/`File` — l'objet {uri, name, type} ci-dessous,
  // seule forme comprise par le FormData de React Native sur natif, y serait
  // silencieusement ignoré (aucune donnée binaire réellement envoyée).
  file?: File;
}

export async function uploadProblemPhoto(problemId: string, asset: LocalPhotoAsset): Promise<ProblemPhoto> {
  const formData = new FormData();
  if (Platform.OS === "web" && asset.file) {
    formData.append("photo", asset.file, asset.fileName ?? asset.file.name);
  } else {
    // Forme attendue par React Native pour un upload multipart depuis un fichier local.
    formData.append("photo", {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }

  // Ne jamais fixer Content-Type manuellement ici : React Native doit générer
  // lui-même l'en-tête "multipart/form-data; boundary=..." à partir du FormData.
  // Le fixer en dur (sans boundary) casserait le parsing multipart côté serveur.
  const { data } = await apiClient.post<{ photo: ProblemPhoto }>(`/problems/${problemId}/photos`, formData);
  return data.photo;
}

export async function deleteProblemPhoto(problemId: string, photoId: string): Promise<void> {
  await apiClient.delete(`/problems/${problemId}/photos/${photoId}`);
}

export function problemPhotoUrl(problemId: string, photoId: string): string {
  return `${API_URL}/problems/${problemId}/photos/${photoId}/file`;
}
