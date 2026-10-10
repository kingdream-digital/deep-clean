import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Préférence « réponses à voix haute » : quand une demande est dictée,
 * l'assistant lit sa réponse (activé par défaut, réglable dans le profil et
 * dans l'assistant). Partagée entre écrans, gardée sur l'appareil.
 */
const KEY = "aussitot.voiceReplies";
let value = true;
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((stored) => {
    if (stored === "0" || stored === "1") {
      value = stored === "1";
      for (const listener of listeners) listener();
    }
  })
  .catch(() => undefined);

export function setVoiceReplies(next: boolean): void {
  value = next;
  for (const listener of listeners) listener();
  AsyncStorage.setItem(KEY, next ? "1" : "0").catch(() => undefined);
}

export function useVoiceReplies(): [boolean, (next: boolean) => void] {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => value,
    () => value,
  );
  return [current, setVoiceReplies];
}
