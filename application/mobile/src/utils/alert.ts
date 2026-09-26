import { Alert as RNAlert, Platform } from "react-native";

export type AlertButtonStyle = "default" | "cancel" | "destructive";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

export interface AlertRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

// `Alert.alert` de react-native-web est un no-op total (voir
// node_modules/react-native-web/dist/exports/Alert) : sur le web, chaque appel
// via l'API native de react-native — confirmations de suppression/désactivation,
// choix multiples (ajout de photo, export)... — ne montrait donc RIEN et
// bloquait silencieusement l'action. Ce module réachemine vers <AlertHost /> sur
// web (voir components/AlertHost.tsx) et vers l'Alert natif ailleurs, en gardant
// la même signature d'appel partout dans l'app.
let showHandler: ((request: AlertRequest) => void) | null = null;

export function registerAlertHandler(handler: ((request: AlertRequest) => void) | null): void {
  showHandler = handler;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS !== "web") {
      RNAlert.alert(title, message, buttons);
      return;
    }
    showHandler?.({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }] });
  },
};
