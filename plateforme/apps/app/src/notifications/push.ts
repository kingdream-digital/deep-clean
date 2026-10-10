import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { endpoints } from "@/api/endpoints";

/**
 * Notifications push (iOS / Android). Le jeton de l'appareil est envoyé à
 * l'API à la connexion et retiré à la déconnexion : un téléphone ne reçoit
 * jamais les notifications d'un compte qui n'y est plus connecté.
 */
let registeredToken: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

export async function registerPushNotifications(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted && settings.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Activité", importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return; // projet EAS non configuré (voir README) : pas de push, le reste fonctionne
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  registeredToken = data;
  await endpoints.notifications.registerPushToken(data, Platform.OS === "ios" ? "ios" : "android");
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await endpoints.notifications.unregisterPushToken(token);
}

/**
 * Inscription aux notifications push une fois connecté, et ouverture de
 * l'écran concerné quand on touche une notification.
 */
export function usePushNotifications(signedIn: boolean, open: (link: string) => void): void {
  useEffect(() => {
    if (!signedIn || Platform.OS === "web") return;
    registerPushNotifications().catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = (response.notification.request.content.data as { link?: unknown } | undefined)?.link;
      if (typeof link === "string" && link.startsWith("/")) open(link);
    });
    return () => sub.remove();
  }, [signedIn, open]);
}
