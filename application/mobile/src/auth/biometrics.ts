import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

// Pas d'implémentation web pour expo-local-authentication (voir
// node_modules/expo-local-authentication/src/ExpoLocalAuthentication.web.ts) :
// Face ID / Touch ID / empreinte reste donc réservé au mobile natif, comme le
// trousseau sécurisé dans secureStorage.ts.
const isWeb = Platform.OS === "web";

export type BiometricKind = "faceId" | "fingerprint" | "iris" | "generic";

// Vérifie que l'appareil possède le matériel ET qu'au moins un visage/une
// empreinte y est déjà enrôlé — un téléphone compatible mais sans rien
// d'enregistré dans ses réglages ne doit pas proposer l'option.
export async function getAvailableBiometricKind(): Promise<BiometricKind | null> {
  if (isWeb) return null;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return null;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "faceId";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
    return "generic";
  } catch {
    return null;
  }
}

// Libellé affiché à l'écran — Face ID / Touch ID sont des noms de marque
// Apple, donc réservés à iOS ; Android reste générique ("Empreinte digitale"
// couvre l'immense majorité des appareils réellement en service).
export function biometricLabel(kind: BiometricKind | null): string {
  switch (kind) {
    case "faceId":
      return Platform.OS === "ios" ? "Face ID" : "Reconnaissance faciale";
    case "fingerprint":
      return Platform.OS === "ios" ? "Touch ID" : "Empreinte digitale";
    case "iris":
      return "Reconnaissance de l'iris";
    default:
      return "Déverrouillage biométrique";
  }
}

export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  if (isWeb) return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Annuler",
      // Autorise le code de verrouillage de l'appareil en secours, exactement
      // comme le ferait Face ID natif d'iOS quand la reconnaissance échoue.
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
