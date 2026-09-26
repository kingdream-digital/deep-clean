import { Linking } from "react-native";

// URL universelle Google Maps (fonctionne sur iOS et Android, avec ou sans
// l'app installée — ouvre l'app native via universal link si présente, sinon
// le navigateur) : évite toute logique spécifique par plateforme pour un
// simple "emmène-moi ici".
export async function openDirectionsTo(address: string): Promise<void> {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  await Linking.openURL(url);
}
