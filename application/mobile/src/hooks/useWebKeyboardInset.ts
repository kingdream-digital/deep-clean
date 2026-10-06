import { useEffect, useState } from "react";
import { Platform } from "react-native";

// Sur un téléphone, dans le navigateur (version web de l'app), le clavier qui
// s'ouvre ne redimensionne pas la page : il se pose PAR-DESSUS. La barre de
// saisie d'une conversation, collée en bas de l'écran, se retrouvait cachée
// sous le clavier — on tapait sans voir son texte. Le KeyboardAvoidingView de
// React Native ne fait rien sur le web ; on mesure donc la partie de l'écran
// réellement visible (visualViewport) pour savoir de combien remonter.
// Renvoie 0 sur mobile natif et sur ordinateur (aucun clavier virtuel).
export function useWebKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
      // Au-delà de 80 px seulement : en dessous, c'est la barre d'adresse du
      // navigateur qui se replie, pas un clavier.
      setInset(hidden > 80 ? Math.round(hidden) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
