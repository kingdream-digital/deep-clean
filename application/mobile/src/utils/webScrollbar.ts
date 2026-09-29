import { Platform } from "react-native";

// Retour explicite du client : sur le web, l'appli masque partout la barre
// de défilement native (`showsVerticalScrollIndicator={false}`, choisi à
// l'origine pour éviter l'indicateur natif disgracieux sur mobile) — sur un
// vrai navigateur, ça donne l'impression qu'on ne peut "que scroller" sans
// repère visuel. On réinjecte donc une barre fine et discrète, cohérente
// avec un site web classique, sans toucher aux dizaines d'écrans qui
// passent déjà `showsVerticalScrollIndicator={false}` (comportement natif
// mobile inchangé). `!important` sur `scrollbar-width` est nécessaire pour
// prendre le pas sur la classe générée par react-native-web (Firefox) ; les
// pseudo-éléments `::-webkit-scrollbar` n'entrent, eux, jamais en conflit
// (Chrome/Safari/Edge ignorent `scrollbar-width`).
const SCROLLBAR_CSS = `
  * {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(148, 163, 184, 0.5) transparent !important;
  }
  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.5);
    border-radius: 999px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.8);
  }
`;

let injected = false;

export function injectWebScrollbarStyle(): void {
  if (Platform.OS !== "web" || injected) return;
  injected = true;
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-deep-clean", "web-scrollbar");
  styleEl.textContent = SCROLLBAR_CSS;
  document.head.appendChild(styleEl);
}
