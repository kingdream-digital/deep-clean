import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

interface ShareFileOptions {
  mimeType: string;
  uti?: string;
}

// Écrit un contenu (texte ou binaire) dans le cache puis ouvre le partage
// natif — l'utilisateur choisit où l'enregistrer (Fichiers, un drive,
// AirDrop, e-mail...). Utilisé pour l'export CSV des pointages et le
// téléchargement des photos de signalement : même séquence, seul le contenu
// et le type MIME changent.
export async function shareFile(filename: string, content: string | Uint8Array, options: ShareFileOptions): Promise<void> {
  if (Platform.OS === "web") {
    // `expo-sharing` n'est disponible sur web que via la Web Share API
    // (`navigator.share`), elle-même limitée aux contextes HTTPS et
    // indisponible sur la plupart des navigateurs de bureau (Chrome desktop
    // notamment) — vérifié en conditions réelles : sur ce panel, RH et
    // direction utilisent très probablement un navigateur de bureau, où
    // `Sharing.isAvailableAsync()` renvoie `false` et le bouton "Télécharger"/
    // "Exporter" ne faisait alors rigoureusement rien, sans la moindre erreur
    // visible. Téléchargement web natif (lien `<a download>`) à la place :
    // fonctionne dans tous les navigateurs, sans HTTPS ni permission requise.
    // Cast nécessaire : le type de `Uint8Array.buffer` (`ArrayBufferLike`,
    // incluant `SharedArrayBuffer`) est légèrement plus large que ce que
    // `BlobPart` accepte strictement — sans incidence réelle ici, `content`
    // provient toujours d'un vrai `ArrayBuffer` (jamais partagé entre threads).
    const blob = new Blob([content as BlobPart], { type: options.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: options.mimeType, dialogTitle: filename, UTI: options.uti });
  }
}
