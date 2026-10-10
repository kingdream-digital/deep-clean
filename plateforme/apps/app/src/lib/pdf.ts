import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_URL, getAccessToken } from "@/api/client";
import { endpoints, fetchPrivateFile } from "@/api/endpoints";

/**
 * Ouvre le PDF d'un devis ou d'une facture. Le fichier n'a pas d'adresse
 * publique : il est téléchargé avec le jeton de la session, puis affiché
 * (ordinateur) ou proposé au partage (téléphone : email, WhatsApp, Fichiers…).
 */
export async function openPdf(path: string, fileName: string): Promise<void> {
  // Garantit un jeton d'accès frais (renouvelé automatiquement si besoin).
  await endpoints.auth.me();

  if (Platform.OS === "web") {
    // Fenêtre ouverte tout de suite (sinon bloquée comme fenêtre surgissante), remplie une fois le fichier reçu.
    const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
    const blob = await fetchPrivateFile(path);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const target = new File(Paths.cache, fileName.replace(/[^\w.\-]+/g, "_"));
  const file = await File.downloadFileAsync(`${API_URL}${path}`, target, {
    headers: { authorization: `Bearer ${getAccessToken() ?? ""}`, accept: "application/pdf" },
    idempotent: true,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: fileName });
  }
}
