import type * as SpeechRecognition from "expo-speech-recognition";

/**
 * Module de dictée vocale, chargé seulement s'il est présent dans
 * l'application. Il est absent d'Expo Go (l'application de test d'Expo) :
 * l'assistant y reste utilisable à l'écrit, sans planter au démarrage.
 * Version installée (EAS) et navigateur : dictée disponible.
 */
type SpeechRecognitionModule = typeof SpeechRecognition;

let loaded: SpeechRecognitionModule | null | undefined;

export function speechRecognition(): SpeechRecognitionModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("expo-speech-recognition") as SpeechRecognitionModule;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}
