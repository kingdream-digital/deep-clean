// Contournement d'un bug réel de `expo-image-picker` (57.0.18) sur web : son
// implémentation web (ExponentImagePicker.web.ts) ouvre le sélecteur de
// fichiers via `input.dispatchEvent(new MouseEvent("click"))` — un événement
// synthétique non "trusted" que tous les navigateurs ignorent pour l'ouverture
// d'un `<input type="file">` (mesure de sécurité du navigateur, pas un bug
// spécifique à un navigateur). Résultat observé : le sélecteur "Choisir dans
// la galerie" ne fait strictement rien sur web, silencieusement — vérifié en
// conditions réelles (Playwright + vrai backend), pas seulement en lisant le
// code. Cette fonction reproduit le même flux mais via `input.click()`, qui
// EST un clic synthétique accepté par les navigateurs pour ouvrir la boîte de
// dialogue — appelée uniquement sur web (`Platform.OS === "web"`), jamais
// exécutée sur natif où `ImagePicker.launchImageLibraryAsync` fonctionne déjà
// correctement.
export interface WebPickedFile {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  /** Le vrai fichier navigateur — nécessaire pour l'upload (voir problems.api.ts). */
  file: File;
}

export function pickWebImages({
  multiple,
  capture,
}: {
  multiple: boolean;
  /** Suggère l'appareil photo au navigateur quand il en propose un (mobile web surtout). */
  capture?: boolean;
}): Promise<WebPickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    if (capture) input.setAttribute("capture", "environment");
    input.style.display = "none";

    function cleanup() {
      if (input.parentNode) document.body.removeChild(input);
    }

    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : [];
      resolve(
        files.map((file) => ({
          uri: URL.createObjectURL(file),
          fileName: file.name,
          mimeType: file.type,
          file,
        }))
      );
      cleanup();
    });
    // Sans ceci, annuler la boîte de dialogue (Échap, "Annuler") ne
    // déclenche aucun événement sur certains navigateurs — la promesse
    // resterait en attente indéfiniment.
    input.addEventListener("cancel", () => {
      resolve([]);
      cleanup();
    });

    document.body.appendChild(input);
    input.click();
  });
}

// Même contournement que `pickWebImages` ci-dessus, généralisé à un type de
// fichier arbitraire (ex. PDF) — `expo-document-picker` a exactement le même
// bug sur web (`ExpoDocumentPicker.web.ts` ouvre aussi son `<input>` via
// `dispatchEvent(new MouseEvent("click"))`, un clic non "trusted" qu'aucun
// navigateur n'accepte pour ouvrir un sélecteur de fichiers) — vérifié en
// lisant son implémentation web, même défaut que celui déjà contourné pour
// les photos. Utilisée uniquement sur web ; sur natif, `expo-document-picker`
// fonctionne correctement et reste utilisé directement (voir
// screens/missions/MissionDetailScreen.tsx).
export function pickWebFile({ accept }: { accept: string }): Promise<WebPickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    function cleanup() {
      if (input.parentNode) document.body.removeChild(input);
    }

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      resolve(
        file
          ? { uri: URL.createObjectURL(file), fileName: file.name, mimeType: file.type, file }
          : null
      );
      cleanup();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      cleanup();
    });

    document.body.appendChild(input);
    input.click();
  });
}
