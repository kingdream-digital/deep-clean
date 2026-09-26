import { Platform } from "react-native";
import { apiClient } from "./client";

export interface CleaningStandard {
  id: string;
  siteId: string;
  name: string;
  tasks: string[];
  equipment: string[];
  safetyInstructions: string | null;
  notes: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
  // Document PDF déposé directement sur le standard (le client fournit déjà
  // le sien en PDF) — voir backend/src/modules/standards/standards.service.ts.
  // Champs plats tous `null` ensemble quand aucun document n'est attaché.
  documentFileName: string | null;
  documentSizeBytes: number | null;
  documentUploadedAt: string | null;
  documentUploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export async function listStandards(siteId: string): Promise<CleaningStandard[]> {
  const { data } = await apiClient.get<{ items: CleaningStandard[] }>("/cleaning-standards", { params: { siteId } });
  return data.items;
}

export async function getStandard(id: string): Promise<CleaningStandard> {
  const { data } = await apiClient.get<{ standard: CleaningStandard }>(`/cleaning-standards/${id}`);
  return data.standard;
}

export interface StandardInput {
  siteId: string;
  name: string;
  tasks: string[];
  equipment: string[];
  safetyInstructions?: string;
  notes?: string;
}

export async function createStandard(input: StandardInput): Promise<CleaningStandard> {
  const { data } = await apiClient.post<{ standard: CleaningStandard }>("/cleaning-standards", input);
  return data.standard;
}

export interface UpdateStandardInput {
  name?: string;
  tasks?: string[];
  equipment?: string[];
  safetyInstructions?: string | null;
  notes?: string | null;
}

export async function updateStandard(id: string, input: UpdateStandardInput): Promise<CleaningStandard> {
  const { data } = await apiClient.patch<{ standard: CleaningStandard }>(`/cleaning-standards/${id}`, input);
  return data.standard;
}

export async function deleteStandard(id: string): Promise<void> {
  await apiClient.delete(`/cleaning-standards/${id}`);
}

export interface LocalDocumentAsset {
  uri: string;
  fileName: string;
  // Web uniquement (voir utils/webImagePicker.ts::pickWebFile) — même raison
  // que missions.api.ts::LocalDocumentAsset.file : le FormData d'un vrai
  // navigateur n'accepte qu'un Blob/File, pas la forme {uri,name,type} que
  // seul React Native natif sait interpréter.
  file?: File;
}

export async function attachStandardDocument(id: string, asset: LocalDocumentAsset): Promise<CleaningStandard> {
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

  const { data } = await apiClient.put<{ standard: CleaningStandard }>(`/cleaning-standards/${id}/document`, formData);
  return data.standard;
}

export async function removeStandardDocument(id: string): Promise<CleaningStandard> {
  const { data } = await apiClient.delete<{ standard: CleaningStandard }>(`/cleaning-standards/${id}/document`);
  return data.standard;
}

export async function downloadStandardDocument(id: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/cleaning-standards/${id}/document/file`, {
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}
