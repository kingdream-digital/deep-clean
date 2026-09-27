import AsyncStorage from "@react-native-async-storage/async-storage";

// File d'attente d'actions hors ligne (§18 du cahier des charges : "les
// actions réalisées hors connexion pourront être synchronisées lorsque la
// connexion revient"). Volontairement limitée aux actions au payload simple
// et sans fichier binaire (signalement texte, sans photo) — une action avec
// photo resterait bloquante hors ligne (voir ReportProblemScreen), stocker
// des fichiers en attente de synchronisation est un chantier à part, non
// couvert ici. Le pointage (CLOCK_IN/CLOCK_OUT) exige désormais toujours une
// photo (justificatif anti-fraude, retour explicite du client) : il a rejoint
// cette catégorie et n'est donc plus mis en file hors ligne (voir
// useClockStatus.ts), retiré de cette liste de types.
const QUEUE_KEY = "deepclean.offlineQueue.v1";

export type OfflineActionType = "REPORT_PROBLEM";

export interface OfflineAction<TPayload = unknown> {
  id: string;
  type: OfflineActionType;
  payload: TPayload;
  createdAt: string;
  attempts: number;
}

async function readQueue(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineAction[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: OfflineAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort, comme le reste du cache hors ligne.
  }
}

export async function enqueueAction<TPayload>(type: OfflineActionType, payload: TPayload): Promise<OfflineAction<TPayload>> {
  const queue = await readQueue();
  const action: OfflineAction<TPayload> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await writeQueue([...queue, action]);
  return action;
}

export async function getQueue(): Promise<OfflineAction[]> {
  return readQueue();
}

export async function hasPendingActionOfType(type: OfflineActionType): Promise<boolean> {
  const queue = await readQueue();
  return queue.some((a) => a.type === type);
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((a) => a.id !== id));
}

export async function bumpAttempts(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.map((a) => (a.id === id ? { ...a, attempts: a.attempts + 1 } : a)));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
