import { Platform } from "react-native";

// Accueil public (services, demande de devis sans compte) : uniquement dans
// l'application iPhone/Android. Dans un navigateur (app.deep-clean.fr),
// l'application s'ouvre directement sur la connexion de l'espace salarié :
// le site de l'entreprise, c'est deep-clean.fr (retour explicite du client).
export const HAS_PUBLIC_SPACE = Platform.OS !== "web";
