import { Platform } from "react-native";
import { apiClient } from "./client";

// Espace documents personnel (retour explicite du client) : la RH/direction
// dépose un document (contrat, avenant...) directement dans l'espace d'un
// collaborateur, qui le consulte ensuite depuis son profil — voir
// backend/src/modules/documents/documents.service.ts.
export interface EmployeeDocument {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export async function listMyDocuments(): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ items: EmployeeDocument[] }>("/documents/me");
  return data.items;
}

export async function listUserDocuments(userId: string): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ items: EmployeeDocument[] }>(`/documents/user/${userId}`);
  return data.items;
}

export interface LocalDocumentAsset {
  uri: string;
  fileName: string;
  // Web uniquement (voir utils/webImagePicker.ts::pickWebFile) — même raison
  // que standards.api.ts::LocalDocumentAsset : le FormData d'un vrai
  // navigateur n'accepte qu'un Blob/File, pas la forme {uri,name,type} que
  // seul React Native natif sait interpréter.
  file?: File;
}

export async function uploadDocument(targetUserId: string, title: string, asset: LocalDocumentAsset): Promise<EmployeeDocument> {
  const formData = new FormData();
  formData.append("targetUserId", targetUserId);
  formData.append("title", title);
  if (Platform.OS === "web" && asset.file) {
    formData.append("document", asset.file, asset.fileName);
  } else {
    formData.append("document", {
      uri: asset.uri,
      name: asset.fileName,
      type: "application/pdf",
    } as unknown as Blob);
  }

  const { data } = await apiClient.post<{ document: EmployeeDocument }>("/documents", formData);
  return data.document;
}

export async function downloadDocument(id: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/documents/${id}/file`, { responseType: "arraybuffer" });
  return new Uint8Array(data);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}`);
}
