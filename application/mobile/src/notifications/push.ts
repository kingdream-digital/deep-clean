import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { markNotificationAsRead, registerPushToken, unregisterPushToken } from "../api/notifications.api";
import type { AppNotification } from "../api/notifications.api";
import { navigationRef } from "../navigation/navigationRef";
import { resolveNotificationTarget } from "../utils/notificationTarget";

// Retenu en mémoire pour pouvoir désenregistrer le bon token à la déconnexion
// (évite qu'un appareil partagé continue de recevoir les push d'un compte
// dont l'utilisateur s'est déconnecté).
let lastRegisteredToken: string | null = null;

// Détermine comment une notification reçue pendant que l'app est au premier
// plan doit être présentée (bannière + son, sans toucher au badge ici : le
// compteur non-lu affiché dans l'app est déjà géré par useUnreadInboxCount).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Demande la permission puis enregistre le token push Expo de l'appareil
 * auprès du backend. Échoue silencieusement (avec un log) dans tous les cas
 * non bloquants pour l'utilisateur : simulateur/émulateur, permission
 * refusée, ou projet Expo pas encore lié à un compte EAS (`projectId`
 * absent) — la notification interne reste de toute façon visible dans le
 * centre de notifications de l'app.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) {
      return; // Les tokens push natifs ne fonctionnent pas sur simulateur/émulateur.
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    lastRegisteredToken = token;
  } catch (err) {
    // Faille corrigée (audit sécurité mobile) : logger l'objet erreur brut ici
    // logue potentiellement l'AxiosError complet, y compris ses en-têtes de
    // requête (`config.headers.Authorization`, donc l'access token JWT en
    // clair) dans les logs de l'appareil (Metro/adb logcat) — accessibles à
    // quiconque a un accès debug/USB au téléphone, y compris en build de
    // production avec debugging activé. On ne logue donc que le message,
    // jamais l'objet complet.
    // eslint-disable-next-line no-console
    console.warn("Enregistrement du token push ignoré :", err instanceof Error ? err.message : String(err));
  }
}

/** À appeler à la déconnexion pour ne plus recevoir les push de ce compte sur cet appareil. */
export async function unregisterCurrentPushToken(): Promise<void> {
  if (!lastRegisteredToken) return;
  try {
    await unregisterPushToken(lastRegisteredToken);
  } catch {
    // Ignoré volontairement : au pire, ce token sera nettoyé par le backend
    // au prochain envoi push en échec ("DeviceNotRegistered").
  } finally {
    lastRegisteredToken = null;
  }
}

// Appui sur une notification push (app ouverte, en arrière-plan ou fermée) :
// même écran que depuis le centre de notifications.
async function openPushTarget(response: Notifications.NotificationResponse): Promise<void> {
  const content = response.notification.request.content;
  const data = (content.data ?? {}) as Partial<Pick<AppNotification, "type" | "relatedEntityType" | "relatedEntityId">> & { notificationId?: string };
  try {
    if (data.notificationId) void markNotificationAsRead(data.notificationId).catch(() => undefined);
    const target = await resolveNotificationTarget({
      type: data.type,
      relatedEntityType: data.relatedEntityType ?? null,
      relatedEntityId: data.relatedEntityId ?? null,
      title: content.title ?? "",
    } as AppNotification);
    // App lancée par l'appui : attendre que la navigation soit prête.
    for (let i = 0; i < 50 && !navigationRef.isReady(); i++) await new Promise((r) => setTimeout(r, 100));
    if (!navigationRef.isReady()) return;
    const navigate = navigationRef.navigate as (name: string, params?: object) => void;
    if (data.type === "MISSION_UNASSIGNED") navigate("Planning");
    else navigate("Messagerie", target ? { screen: target.screen, params: target.params } : undefined);
  } catch {
    // Élément supprimé entre-temps : l'app reste simplement ouverte.
  }
}

/** Écoute les appuis sur les notifications push ; renvoie la fonction d'arrêt. */
export function listenToPushTaps(): () => void {
  if (Platform.OS === "web") return () => undefined;
  void Notifications.getLastNotificationResponseAsync().then((last) => {
    if (last) void openPushTarget(last);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((response) => void openPushTarget(response));
  return () => sub.remove();
}
