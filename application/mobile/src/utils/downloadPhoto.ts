import { apiClient } from "../api/client";
import { shareFile } from "./shareFile";

// Récupère une photo de signalement via la route authentifiée (jamais d'URL
// publique, voir backend/src/utils/storage.ts) puis ouvre le partage natif —
// la RH choisit où l'enregistrer (Fichiers, un drive, AirDrop...) pour
// archiver ce qu'elle veut garder avant la suppression automatique.
export async function downloadAndSharePhoto(problemId: string, photoId: string, filename: string): Promise<void> {
  const response = await apiClient.get(`/problems/${problemId}/photos/${photoId}/file`, {
    responseType: "arraybuffer",
  });
  const bytes = new Uint8Array(response.data as ArrayBuffer);
  await shareFile(filename, bytes, { mimeType: "image/jpeg" });
}
