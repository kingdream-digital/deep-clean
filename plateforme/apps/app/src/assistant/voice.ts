import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

/**
 * Dictée vocale (reconnaissance de la parole de l'appareil : iOS, Android,
 * Chrome / Edge / Safari sur ordinateur). Le son n'est capté que pendant
 * l'écoute, déclenchée par l'utilisateur.
 */
export type DictationError = "not-allowed" | "unavailable" | "no-speech" | "network" | "other";

const ERROR_MESSAGES: Record<DictationError, string> = {
  "not-allowed": "Autorisez l'accès au micro pour parler à l'assistant (réglages de l'appareil).",
  unavailable: "La dictée n'est pas disponible sur cet appareil ou ce navigateur. Utilisez Chrome, Edge ou Safari, ou écrivez votre demande.",
  "no-speech": "Je n'ai rien entendu. Appuyez de nouveau sur le micro et parlez.",
  network: "La dictée nécessite une connexion internet sur cet appareil.",
  other: "La dictée s'est interrompue. Réessayez.",
};

export function dictationErrorMessage(error: DictationError): string {
  return ERROR_MESSAGES[error];
}

/** Vocabulaire métier qui aide la reconnaissance. */
const CONTEXT = ["devis", "facture", "avoir", "relance", "TTC", "HT", "TVA", "SIRET", "planning", "mission", "encaisser", "acompte", "forfait", "passage"];

export function isDictationAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<DictationError | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const lastTranscript = useRef("");
  const delivered = useRef(false);

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    setError(null);
    delivered.current = false;
    lastTranscript.current = "";
  });
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript?.trim() ?? "";
    lastTranscript.current = transcript;
    setPartial(transcript);
    if (event.isFinal && transcript && !delivered.current) {
      delivered.current = true;
      setPartial("");
      finalRef.current(transcript);
    }
  });
  useSpeechRecognitionEvent("volumechange", (event) => setLevel(Math.max(0, Math.min(1, (event.value + 2) / 12))));
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setLevel(0);
    // Certains moteurs s'arrêtent sans résultat « final » : on livre le dernier texte entendu.
    if (!delivered.current && lastTranscript.current) {
      delivered.current = true;
      finalRef.current(lastTranscript.current);
    }
    setPartial("");
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    setLevel(0);
    if (event.error === "aborted") return;
    setError(
      event.error === "not-allowed"
        ? "not-allowed"
        : event.error === "no-speech" || event.error === "speech-timeout"
          ? "no-speech"
          : event.error === "network"
            ? "network"
            : event.error === "service-not-allowed" || event.error === "language-not-supported"
              ? "unavailable"
              : "other",
    );
  });

  const start = useCallback(async () => {
    setError(null);
    if (!isDictationAvailable()) {
      setError("unavailable");
      return;
    }
    stopSpeaking();
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError("not-allowed");
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: "fr-FR",
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      contextualStrings: CONTEXT,
      volumeChangeEventOptions: { enabled: Platform.OS !== "web", intervalMillis: 120 },
    });
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* déjà arrêté */
    }
  }, []);

  useEffect(() => () => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* rien à arrêter */
    }
  }, []);

  return { listening, partial, level, error, start, stop, clearError: () => setError(null) };
}

/** Lecture à voix haute d'une réponse (voix française de l'appareil). */
export function speak(text: string, onDone?: () => void): void {
  const clean = text
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;
  Speech.stop();
  Speech.speak(clean, { language: "fr-FR", rate: Platform.OS === "ios" ? 0.52 : 1.02, onDone, onStopped: onDone });
}

export function stopSpeaking(): void {
  Speech.stop();
}
