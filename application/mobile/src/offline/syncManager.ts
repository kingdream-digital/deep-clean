import NetInfo from "@react-native-community/netinfo";
import { Alert } from "../utils/alert";
import axios from "axios";
import { clockIn, clockOut } from "../api/timesheets.api";
import { createProblem, type CreateProblemInput } from "../api/problems.api";
import { extractErrorMessage } from "../api/client";
import { bumpAttempts, getQueue, removeFromQueue, type OfflineAction } from "./queue";

const MAX_ATTEMPTS = 5;

// Un échec de connexion (requête qui n'a jamais atteint le serveur) doit
// laisser l'action en file pour un prochain essai ; une réponse métier du
// serveur (400/403/404/409...) signifie que la requête EST arrivée et a été
// refusée pour une vraie raison — la rejouer indéfiniment ne changera rien,
// il faut prévenir l'utilisateur et retirer l'action de la file.
function isNetworkFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

let syncing = false;

async function processAction(action: OfflineAction): Promise<"done" | "retry" | "failed"> {
  try {
    switch (action.type) {
      case "CLOCK_IN":
        await clockIn();
        return "done";
      case "CLOCK_OUT":
        await clockOut();
        return "done";
      case "REPORT_PROBLEM":
        await createProblem(action.payload as CreateProblemInput);
        return "done";
      default:
        return "failed";
    }
  } catch (err) {
    if (isNetworkFailure(err)) return "retry";
    Alert.alert(
      "Synchronisation impossible",
      describeAction(action) + " n'a pas pu être synchronisé : " + extractErrorMessage(err, "erreur inconnue") + ". L'action a été abandonnée."
    );
    return "failed";
  }
}

function describeAction(action: OfflineAction): string {
  switch (action.type) {
    case "CLOCK_IN":
      return "Votre pointage d'arrivée";
    case "CLOCK_OUT":
      return "Votre pointage de sortie";
    case "REPORT_PROBLEM":
      return "Votre signalement";
    default:
      return "Une action en attente";
  }
}

// Rejoue la file dans l'ordre d'enregistrement (FIFO) : un clock-in avant un
// clock-out doit rester synchronisé dans cet ordre, jamais en parallèle, sous
// peine d'incohérence sur le serveur (voir lockUserRow côté backend, qui
// suppose des appels séquentiels pour un même utilisateur).
export async function processQueue(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const queue = await getQueue();
    for (const action of queue) {
      if (action.attempts >= MAX_ATTEMPTS) {
        await removeFromQueue(action.id);
        Alert.alert("Synchronisation abandonnée", describeAction(action) + " n'a pas pu être synchronisé après plusieurs tentatives.");
        continue;
      }
      const result = await processAction(action);
      if (result === "done" || result === "failed") {
        await removeFromQueue(action.id);
      } else {
        await bumpAttempts(action.id);
        // Échec réseau sur cette action : inutile d'essayer les suivantes
        // maintenant, la connexion est probablement encore instable.
        break;
      }
    }
  } finally {
    syncing = false;
  }
}

let unsubscribe: (() => void) | null = null;

// À appeler une seule fois, au démarrage de la session authentifiée (voir
// AuthContext) : synchronise immédiatement s'il y a du réseau, puis à chaque
// retour de connexion détecté.
export function startSyncManager(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void processQueue();
    }
  });
  void processQueue();
}

export function stopSyncManager(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
