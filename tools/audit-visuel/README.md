# Outils d'audit visuel

Scripts qui pilotent l'application **réellement en train de tourner** (vrai
backend, vraie base) dans un navigateur, pour vérifier ce qu'un utilisateur
voit vraiment — pas ce que le code laisse supposer. C'est ainsi qu'ont été
trouvés la barre latérale qui écrasait l'écran sur téléphone, les boutons
illisibles en mode sombre et le compteur qui comptait double.

> Prérequis : environnement de développement lancé (voir
> `docs/REPRISE-SESSION.md`, section « Remonter l'environnement »), API sur
> `:4000` et application web sur `:8081`.

## Installation

```bash
cd tools/audit-visuel
npm init -y && npm install playwright@1.56
```

Chromium est déjà présent dans l'environnement Claude Code
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) — **ne pas** lancer
`playwright install`.

## Les scripts

| Script | Rôle |
|---|---|
| `helpers.mjs` | Connexion, navigation, capture. Contient `tapVisible()` (voir plus bas) |
| `demo-messages.mjs` | Crée un jeu de conversations de démo (fils à deux + un groupe avec document PDF) |
| `reset-messages.mjs` | Vide la messagerie pour rejouer un scénario proprement |
| `set-phones.mjs` | Ajoute des numéros de téléphone aux comptes de démo (sans quoi le bouton d'appel n'a rien à composer) |
| `make-pdf.mjs` | Génère un vrai PDF pour tester le partage de document |
| `check-api.mjs` | Vérifie l'API de messagerie de bout en bout : groupes, permissions, documents, non-lus, cloisonnement |

## Exemple : capturer un écran

```js
import { launch, newPage, login, tapTab, tapVisible, shot } from "./helpers.mjs";

const browser = await launch();
const page = await newPage(browser, { viewport: { width: 390, height: 844 } });
await login(page, "mdupont");          // voir les comptes dans REPRISE-SESSION.md
await tapTab(page, "Messagerie");
await tapVisible(page, "Messages");
await shot(page, "sortie/messagerie.png");
await browser.close();
```

## Pourquoi `tapVisible()` et pas `getByText()`

React Navigation **garde les écrans précédents montés** dans le DOM, en
`pointer-events: none`. Un `page.getByText("…").first()` tombe donc très
souvent sur l'occurrence d'un écran **invisible**, et le clic expire au bout
de 30 secondes sans explication claire.

`tapVisible()` ne retient que l'élément qui recevrait réellement le clic
(vérification par `document.elementFromPoint`), puis clique à ses coordonnées.

## Pièges à connaître

- **Metro en mode CI ne recharge pas les fichiers.** Après toute modification
  du code mobile : tuer et relancer `expo start`, sinon vous auditez l'ancien
  bundle.
- **La visite guidée bloque les clics.** `login()` la neutralise déjà en
  écrivant `deepclean.onboardingSeen.<userId>` dans le `localStorage` avant le
  premier rendu.
- **Mode sombre** : il ne suit pas le réglage du système (choix du client,
  l'application est claire par défaut). Pour le tester, écrire
  `localStorage.setItem("deepclean.themePreference", "dark")` avant chargement.
- **Limite de requêtes** : mettre `RATE_LIMIT_MAX_REQUESTS` très haut dans le
  `.env` de développement, un parcours automatisé épuise vite le quota normal.
