import { logger } from "../config/logger";
import { env } from "../config/env";

// Envoi de notifications push via le service relais d'Expo (gratuit, sans
// compte tiers requis) : fonctionne pour les apps buildées avec Expo/EAS,
// qu'elles ciblent iOS (APNs) ou Android (FCM) — Expo relaie vers le bon
// service selon la plateforme du token. Documentation :
// https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Envoie un lot de notifications push. Best-effort : une erreur d'envoi push
 * est journalisée mais ne fait jamais échouer l'action métier qui l'a
 * déclenchée (la notification interne, elle, est déjà persistée en base).
 *
 * Retourne les tokens qu'Expo signale comme définitivement invalides
 * (app désinstallée...), pour que l'appelant les supprime en base et évite
 * de retenter en vain à chaque future notification.
 */
export async function sendExpoPushNotifications(messages: PushMessage[]): Promise<{ invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  const valid = messages.filter((m) => EXPO_PUSH_TOKEN_PATTERN.test(m.to));
  const invalidCount = messages.length - valid.length;
  if (invalidCount > 0) {
    logger.warn({ invalidCount }, "Jetons push ignorés : format invalide (pas un token Expo)");
  }
  if (valid.length === 0) return { invalidTokens };

  // L'API Expo accepte au maximum 100 messages par requête.
  for (const batch of chunk(valid, 100)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: "default" as const }))),
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, "Échec de l'envoi push (réponse Expo non-OK)");
        continue;
      }

      const json = (await res.json()) as { data?: ExpoPushTicket[] };
      json.data?.forEach((ticket, i) => {
        if (ticket.status !== "ok") {
          logger.warn({ token: batch[i]?.to, error: ticket.message }, "Notification push refusée par Expo");
          if (ticket.details?.error === "DeviceNotRegistered") {
            const token = batch[i]?.to;
            if (token) invalidTokens.push(token);
          }
        }
      });
    } catch (err) {
      logger.warn({ err }, "Erreur réseau lors de l'envoi push Expo");
    }
  }

  return { invalidTokens };
}
