import * as Location from "expo-location";

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

const LOCATION_TIMEOUT_MS = 8000;

// Capture la position GPS actuelle de l'appareil — partagée entre le pointage
// (useClockStatus.ts) et la fiche chantier (SiteFormScreen.tsx, position de
// référence pour vérifier les pointages). Une position fraîche peut prendre du
// temps à l'intérieur d'un bâtiment (signal GPS faible) : on retombe alors sur
// la dernière position connue plutôt que de bloquer indéfiniment — toujours
// une vraie position, jamais une valeur inventée.
export async function capturePosition(deniedMessage: string, unavailableMessage: string): Promise<CapturedPosition> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(deniedMessage);
  }

  const fresh = new Promise<Location.LocationObject>((resolve, reject) => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(resolve, reject);
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));

  let position = await Promise.race([fresh, timeout]);
  if (!position) {
    position = await Location.getLastKnownPositionAsync();
  }
  if (!position) {
    throw new Error(unavailableMessage);
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? undefined,
  };
}
