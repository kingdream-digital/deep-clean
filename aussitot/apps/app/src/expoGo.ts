import { LogBox } from "react-native";
import { inExpoGo } from "@/lib/runtime";

/**
 * Expo Go (application de test d'Expo, utilisée pour essayer l'app sur un
 * téléphone sans l'installer) : la dictée vocale et les notifications push
 * n'y existent pas. L'app le sait et s'en passe ; on n'affiche donc pas les
 * avertissements techniques correspondants pendant les essais.
 * Importé EN PREMIER par app/_layout.tsx.
 */
if (inExpoGo()) {
  LogBox.ignoreLogs(["`expo-notifications` functionality is not fully supported in Expo Go"]);
}
