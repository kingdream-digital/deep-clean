import { Platform, TextStyle } from "react-native";
import type { Palette } from "../theme/colors";
import { fontFamily } from "../theme/typography";

/**
 * Style commun des listes déroulantes (`@react-native-picker/picker`).
 *
 * Sur le web, le Picker devient un `<select>` du navigateur : sans réglage, il
 * s'affichait minuscule, en police du navigateur, avec son propre cadre gris
 * à l'intérieur de la carte — le seul champ de formulaire de l'application à
 * ne pas ressembler aux autres. On lui donne ici la hauteur, la police et la
 * marge intérieure des champs de saisie. Sur iOS et Android, seule la couleur
 * du texte est réglée, le sélecteur natif s'occupe du reste.
 */
export function pickerStyle(colors: Palette): TextStyle {
  if (Platform.OS !== "web") return { color: colors.ink };
  return {
    color: colors.ink,
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: fontFamily.regular,
    fontSize: 16,
  };
}
