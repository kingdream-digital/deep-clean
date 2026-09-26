# Audit approfondi — version web (panel entreprise)

Date : 2026-09-23, mise à jour le 2026-09-24 (round 2) — toutes les
recommandations de la passe précédente traitées, y compris les formulaires
secondaires restants et une vérification en profondeur des
signalements/photos qui a mis au jour et corrigé **quatre bugs réels**, tous
cachés derrière du code qui semblait correct à la lecture (voir §2.12 et §4).
Nouvelle mise à jour le 2026-09-24 (round 3) — audit exhaustif "dans tous les
sens" mené en conditions réelles sur l'intégralité des écrans et rôles,
**trois bugs supplémentaires trouvés et corrigés** (voir §2.13).
Périmètre : `mobile/` (Expo / React Native Web) + `backend/` pour les deux
correctifs qui s'y trouvaient (rapprochement des heures, limitation de
débit). Le code mobile natif (iOS/Android) n'a pas été modifié
fonctionnellement — voir "Garantie de non-régression mobile" ci-dessous.

## 1. Point de départ

Avant ce chantier, la version web de Deep Clean était strictement le rendu
`react-native-web` de l'application mobile, sans aucune adaptation : barre
d'onglets collée en bas d'un écran de bureau, écrans à largeur de téléphone
étirés sur un écran large, listes en cartes empilées au lieu de tableaux,
écran de connexion centré sur une colonne étroite au milieu d'un fond vide.
Aucun fichier `.web.tsx`, aucun breakpoint, aucune logique `Platform.OS`
n'existait dans le code avant cette intervention.

## 2. Ce qui a été livré

### 2.1 Navigation — sidebar façon panel d'administration

- `mobile/src/navigation/AppTabs.web.tsx` : variante web de `AppTabs.tsx`,
  chargée automatiquement par le bundler uniquement pour le build web
  (résolution par extension de plateforme — mécanisme standard Expo/RN, zéro
  configuration additionnelle). Le fichier natif `AppTabs.tsx` n'est jamais
  touché par cette variante.
- Réutilise **le même** `createBottomTabNavigator` que le mobile, avec
  `tabBarPosition: "left"` (fonctionnalité native de `@react-navigation/bottom-tabs@7`,
  déjà présente dans les dépendances — aucune nouvelle dépendance ajoutée) et
  un rendu de barre entièrement personnalisé (`tabBar` prop) via
  `mobile/src/navigation/web/WebSidebar.tsx`.
- Conséquence directe : toute la logique de navigation existante
  (`navigation.getParent<NavigationProp<AppTabsParamList>>()`, badges de
  notifications, permissions par rôle) continue de fonctionner à l'identique
  — c'est littéralement le même navigateur, seule sa présentation change.
- La sidebar affiche : logo + nom de marque, les items de navigation
  filtrés par rôle (identique à mobile), le badge de messages non lus, et un
  pied de page avec avatar/nom/rôle + déconnexion rapide.
- Comportement responsive intégré : sidebar complète (264px, icônes +
  libellés) au-dessus de 1280px de large ; en dessous, rail d'icônes seules
  (84px) — géré par `mobile/src/hooks/useResponsive.ts`.

### 2.2 Infrastructure responsive

- `mobile/src/theme/breakpoints.ts` + `mobile/src/hooks/useResponsive.ts` :
  point d'entrée unique (`isWeb`, `isDesktopWeb`, `isCompactWeb`) pour toute
  logique de mise en page dépendant de la largeur. Sur natif, ces valeurs
  sont **toujours** `false` — un composant qui les utilise retombe donc
  systématiquement sur son rendu mobile d'origine.
- `ScreenContainer` : plafond de largeur de contenu (1120px, centré) sur web
  large uniquement, pour éviter les lignes de texte illisibles et les
  formulaires étirés sur toute la largeur d'un écran de bureau.
- `KpiGrid` : grille à 4 colonnes sur web large (au lieu de 2 sur mobile) —
  les tableaux de bord affichent leurs indicateurs sur une seule ligne au
  lieu de s'empiler inutilement.

### 2.3 Écran de connexion

`LoginScreen.tsx` : sur web large, panneau de marque (dégradé, logo, message
d'accroche) à gauche + carte de connexion centrée à droite, au lieu du
formulaire mobile centré verticalement. La branche mobile (centrage vertical
en colonne unique) reste strictement identique à ce qu'elle était.

### 2.4 Tableaux de données

- `mobile/src/components/DataTable.tsx` : nouveau composant générique
  (colonnes typées par l'appelant), avec surbrillance au survol (web
  uniquement, sans effet natif).
- Rebranché sur `UsersListScreen` (Comptes) et `SitesListScreen` (Chantiers)
  : sur web large, tableau avec colonnes (Nom/Rôle/Email/Statut pour les
  comptes ; Chantier/Adresse/Chef d'équipe/Statut pour les chantiers),
  en-tête de page avec compteur et bouton d'action ("Nouveau compte" /
  "Nouveau chantier"). En dessous du seuil desktop, ces deux écrans
  retombent sur exactement le même rendu carte + FAB qu'avant (vérifié
  visuellement, voir §4).

### 2.5 Rôle Superviseur

Aucun changement fonctionnel n'était nécessaire ici : le rôle existait déjà
côté backend/permissions ; la sidebar web affiche automatiquement son
libellé ("Supervision") et ses entrées de menu comme sur mobile, sans code
spécifique à ajouter.

### 2.6 Missions et Planning

- `MissionsListScreen` : même traitement que Comptes/Chantiers — tableau
  (Mission/Chantier, Date, Horaire, Équipe, Statut) sur web large, en-tête
  avec compteur et bouton "Nouvelle mission" pour les rôles autorisés.
- `PlanningScreen` : sur web large, le sélecteur "un seul jour à la fois" est
  remplacé par une vraie grille des 7 jours de la semaine côte à côte
  (`DesktopWeekGrid`), chaque jour listant ses missions (puce colorée par
  statut, chantier, horaire) — réutilise les données déjà chargées
  (`missionsByDay`), aucun appel réseau supplémentaire. C'était l'écran où
  l'écart mobile/desktop se voyait le plus après la navigation ; c'est
  maintenant réglé.

### 2.7 Dossiers d'heures, Validation des heures, Absences, Journal d'activité

Les quatre écrans restants de la RH/direction utilisent maintenant
`DataTable` sur web large (fallback carte mobile inchangé en dessous du
seuil desktop) :
- **Dossiers d'heures** : Nom, Rôle.
- **Validation des heures** : Employé, Date, Horaire, Durée, Statut, et une
  colonne Actions (Valider/Refuser) uniquement sur l'onglet "En attente".
- **Absences** : Employé, Type, Période, Motif, Statut, et une colonne
  Actions (Approuver/Refuser) affichée seulement sur les lignes encore en
  attente.
- **Journal d'activité** : Action, Utilisateur, Élément, Date.

### 2.8 En-têtes de page dédupliqués

Comptes, Chantiers et Missions affichaient auparavant leur titre deux fois
sur desktop (le titre natif-stack "← Comptes" ET le grand titre de l'en-tête
desktop juste en dessous). Le titre natif-stack est maintenant vidé sur web
large pour ces trois écrans (`HomeStack.tsx`, `ManagementStack.tsx`,
`MissionsStack.tsx`) — la flèche de retour reste affichée, seul le texte en
double disparaît.

### 2.9 Formulaires en disposition desktop

`UserFormScreen`, `SiteFormScreen`, `MissionFormScreen` : sur web large, le
contenu du formulaire est plafonné à 640px de large et centré, au lieu de
s'étirer sur toute la largeur du panneau de contenu (jusqu'à ~1120px). Un
formulaire à un seul champ par ligne reste lisible à cette largeur ; au-delà,
les champs devenaient disproportionnés. Comportement mobile strictement
inchangé (le plafond ne s'applique que si `isDesktopWeb`).

### 2.10 Accessibilité clavier

- Vérifié que `react-native-web` rend déjà `Pressable` focusable au clavier
  (`tabIndex=0`) avec activation par Entrée/Espace par défaut — aucune
  bibliothèque supplémentaire nécessaire.
- Ajouté `accessibilityRole="button"` et `accessibilityLabel` explicites sur
  les items de la sidebar (important en mode rail compact, où seule une
  icône est visible) et sur le bouton de déconnexion.
- Corrigé un défaut dans `DataTable` : une ligne sans action (ex. Validation
  des heures, où seuls les boutons de cellule sont cliquables) ne rend plus
  un `Pressable` focusable qui ne faisait rien au clavier — rendu en `View`
  simple dans ce cas, jamais un arrêt de tabulation inutile.

### 2.11 Base PWA

`app.json` → `web` définit maintenant `lang`, `shortName`, `themeColor`
(`#0E7490`, la teinte d'accent de la marque), `backgroundColor` et
`display: "standalone"`, pour une installation "application" cohérente
depuis le navigateur.

### 2.12 Formulaires secondaires + quatre bugs réels sur les photos/exports (web)

Le même plafond 640px centré a été étendu à tous les formulaires restants :
`RetroactiveClockScreen`, `TimesheetRejectScreen`, `StandardFormScreen`,
`AbsenceFormScreen`, `JobSheetFormScreen`, `ReportProblemScreen`, et
`ChangePasswordForm` (composant partagé par l'écran de profil et le premier
changement de mot de passe obligatoire).

En testant ce dernier écran (`ReportProblemScreen`) en conditions réelles —
créer un signalement, y joindre une photo, la consulter, la télécharger —
**quatre bugs web indépendants ont été trouvés et corrigés**, tous invisibles
à la simple lecture du code (`tsc`/`jest` restaient propres) :

1. **La sélection de photo n'ouvrait jamais de boîte de dialogue sur web.**
   `expo-image-picker@57.0.18` déclenche son `<input type="file">` via
   `input.dispatchEvent(new MouseEvent("click"))` — un événement synthétique
   non "trusted" que les navigateurs ignorent pour ouvrir un sélecteur de
   fichiers (mesure de sécurité standard, pas un bug de navigateur). Résultat
   observé : cliquer sur "Choisir dans la galerie" ne faisait rigoureusement
   rien. Contournement dans notre propre code (`mobile/src/utils/webImagePicker.ts`),
   utilisé uniquement sur web (`Platform.OS === "web"`) : même principe, mais
   avec `input.click()`, qui EST accepté par les navigateurs.
2. **Même après sélection, l'upload n'aurait pas fonctionné.**
   `uploadProblemPhoto` construisait un `FormData` avec un objet
   `{ uri, name, type }` — la forme que React Native sait interpréter
   nativement, mais que le `FormData` d'un vrai navigateur ignore
   silencieusement (il n'accepte qu'un `Blob`/`File`). Corrigé dans
   `api/problems.api.ts` : sur web, le vrai `File` du sélecteur est attaché
   directement au FormData.
3. **Les photos déjà envoyées ne s'affichaient pas.**
   `AuthenticatedImage` passait un en-tête `Authorization` via
   `source={{ uri, headers }}` — un mécanisme réel sur `<Image>` natif, mais
   que `react-native-web` accepte dans son typage sans jamais l'utiliser : un
   navigateur ne peut de toute façon pas attacher d'en-tête personnalisé à une
   requête `<img>`. La route étant authentifiée (jamais d'URL publique, voir
   `docs/SECURITY.md`), chaque photo aurait échoué en 401, invisible. Corrigé
   en récupérant l'image via `apiClient` (qui porte le token et gère le
   rafraîchissement) puis en l'affichant comme URL `blob:` locale — natif
   inchangé.
4. **"Télécharger" (photo ou export CSV/Excel/PDF des heures) ne faisait rien
   sur un navigateur de bureau.** `expo-sharing` n'est disponible sur web que
   via la Web Share API (`navigator.share`), indisponible sur la plupart des
   navigateurs de bureau (dont Chrome desktop) et limitée au HTTPS.
   `Sharing.isAvailableAsync()` y renvoyait donc `false`, et `shareFile`
   s'arrêtait silencieusement après avoir écrit le fichier — aucune erreur,
   mais aucun téléchargement non plus. Corrigé dans `utils/shareFile.ts` :
   sur web, téléchargement via un lien `<a download>` généré à la volée,
   qui fonctionne dans tous les navigateurs sans HTTPS ni permission. Ce
   correctif restaure d'un coup **quatre usages** qui partagent la même
   fonction : téléchargement de photo de signalement, et export CSV, Excel
   et PDF des heures (`EmployeeHoursScreen`) — un point pourtant central pour
   la RH (préparation de la paie).

Les quatre correctifs ont été revérifiés en conditions réelles après coup
(pas seulement relus) : sélection de photo → boîte de dialogue du navigateur
capturée par Playwright, upload → réponse 201 du serveur, affichage →
réponse 200 sur la route photo authentifiée, téléchargement de photo ET
export Excel → événement de téléchargement du navigateur effectivement
déclenché avec le bon fichier.

### 2.13 Audit exhaustif round 3 — trois bugs supplémentaires trouvés et corrigés

Cette passe est partie d'une consigne large : tester l'application web "dans
tous les sens", tous rôles et tous écrans, puis corriger en profondeur ce qui
est trouvé. Une première vague de 6 agents de test en parallèle a été lancée ;
4 ont été interrompus par une limite de session API avant de finir, mais l'un
d'eux (rapprochement des heures) a livré un rapport complet, et un autre a
identifié en cours de route les deux bugs de limitation de débit ci-dessous.
Le reste du périmètre (authentification/session, tableaux de bord et
planning tous rôles, missions/signalements, chantiers/standards/comptes RH,
messagerie, balayage responsive) a ensuite été testé directement, en
conditions réelles (Playwright + backend réel), plutôt que de relancer des
agents en parallèle.

1. **Sélecteurs de date/heure entièrement inertes sur web.**
   `@react-native-community/datetimepicker` n'a **aucune implémentation web**
   (aucun fichier `.web.*` dans le paquet) ; `DateTimeField.tsx` ne rendait
   son picker que pour `Platform.OS === "ios"` ou `"android"`. Sur web,
   cliquer un champ date/heure ne faisait donc rigoureusement rien — bug
   critique qui bloquait silencieusement trois formulaires entiers
   (`RetroactiveClockScreen`, `MissionFormScreen`, `AbsenceFormScreen`,
   ce dernier partagé aussi par le pointage différé). Corrigé en ajoutant une
   branche web dédiée dans `DateTimeField.tsx`, qui rend un `<input
   type="date">` / `<input type="time">` HTML natif du navigateur (via
   `React.createElement`, aucune dépendance ajoutée) au lieu du picker natif
   RN. Revérifié en conditions réelles : le champ répond bien au clic et la
   valeur se propage correctement dans les trois formulaires, y compris la
   création de mission de bout en bout (voir §4).
2. **Minutes non arrondies affichées dans le rapprochement des heures.**
   `getReconciliation()` et `getReconciliationDetail()`
   (`backend/src/modules/timesheets/timesheets.service.ts`) renvoyaient
   `workedMinutes`/`scheduledMinutes` calculés en flottant brut
   (`(clockOut - clockIn) / 60000`, précision à la seconde près), affichés
   tels quels côté web — un utilisateur pouvait voir "1.4558833333333334
   min" sur l'écran Superviseur/RH "Pointage vs mission". Corrigé en
   arrondissant à l'entier au moment de construire la réponse API
   (`Math.round`), après le calcul de statut qui a lui besoin de la valeur
   précise pour sa tolérance de 15 minutes — donc aucun changement de
   comportement sur la détection d'écart, seul l'affichage est concerné.
3. **Limitation de débit ("rate limiting") mal calibrée, à deux endroits.**
   - `authRateLimiter` était partagé entre `/login` et `/refresh`. Le
     frontend relance silencieusement `/refresh` à chaque expiration
     normale de session ; un utilisateur pouvait donc se retrouver bloqué
     "trop de tentatives de connexion" **sans avoir jamais tapé un mauvais
     mot de passe**, uniquement à cause du trafic de rafraîchissement
     automatique. Corrigé en retirant `authRateLimiter` de la route
     `/refresh` (un refresh token de 64 octets aléatoires ne se devine pas
     par force brute ; cette route reste couverte par la limite générale de
     l'API) — gardé sur `/login` et `/change-password`.
   - `generalRateLimiter` (300 requêtes/15 min) était calé sur l'adresse IP
     brute. Plusieurs employés derrière le même NAT de bureau pouvaient donc
     épuiser collectivement le quota en quelques minutes d'usage normal et
     bloquer **tout le bureau** pendant 15 minutes. Corrigé avec une clé par
     utilisateur authentifié (décodage non-vérifié du JWT, suffisant pour du
     bucketing, jamais utilisé pour une décision de sécurité) qui retombe
     sur l'IP seulement en l'absence de token — appliqué à
     `generalRateLimiter` et `hrSensitiveRateLimiter`.
4. **Accessibilité clavier — quatre boutons d'action flottants muets pour un
   lecteur d'écran.** Les FAB "+" (créer) de `StandardsListScreen`,
   `UsersListScreen`, `SitesListScreen` et `MissionsListScreen` n'avaient ni
   `accessibilityRole` ni `accessibilityLabel` — un lecteur d'écran les
   annonçait comme un élément générique sans description. Corrigé en
   ajoutant `accessibilityRole="button"` et un libellé explicite ("Nouveau
   standard", "Nouveau compte", "Nouveau chantier", "Nouvelle mission") sur
   chacun.

Aucun autre bug fonctionnel trouvé sur le reste du périmètre balayé dans
cette passe : connexion avec identifiants corrects/incorrects, compte
désactivé (message dédié vers la RH bien affiché, sans fuite d'information
distinguant "mauvais mot de passe" de "compte désactivé"), changement de mot
de passe, navigation par tous les rôles (sidebar, rail compact), création
d'un chantier, création d'une mission de bout en bout avec validation
("Affectez au moins un employé" bien bloquant), fiche de mission (équipe,
fiche de poste, signalements, actions), création de la fiche de poste,
messagerie (onglets Notifications/Messages, recherche de collègue pour un
nouveau message), congés & absences (état vide propre), journal d'activité
(données réelles, actions correctement journalisées y compris la création de
mission qu'on vient de tester) — aucune erreur console/page dans aucun de ces
parcours.

## 3. Garantie de non-régression mobile

- **Aucun fichier natif modifié dans sa logique.** Tous les fichiers
  partagés touchés (`AppTabs.tsx`, `HomeStack.tsx`, `ManagementStack.tsx`,
  `MissionsStack.tsx`, `ScreenContainer.tsx`, `KpiGrid.tsx`,
  `LoginScreen.tsx`, `DataTable.tsx`, `AuthenticatedImage.tsx`,
  `shareFile.ts`, `problems.api.ts`, et tous les écrans de liste/formulaire
  retravaillés) ne reçoivent que des branches conditionnelles strictement
  gardées par `Platform.OS === "web"` (via `useResponsive` ou directement)
  — sur iOS/Android, ces branches ne sont jamais empruntées, le code
  exécuté est le même qu'avant. `webImagePicker.ts` n'est importé et appelé
  que depuis ces branches web ; sur natif, `expo-image-picker` continue de
  gérer la sélection de photo comme avant.
- `AppTabs.web.tsx` est un fichier à part entière : le bundler Metro ne
  l'inclut **jamais** dans un build iOS/Android.
- `npx tsc --noEmit` : ✅ aucune erreur, côté `mobile/` comme côté
  `backend/` (vérifié après chaque étape, pas seulement à la fin).
- `npx jest` côté mobile : ✅ 25/25 tests passent (4 suites), sans
  modification, du début à la fin du chantier.
- `npm test` (`jest --runInBand`) côté backend : 103/122 tests passent ; les
  19 échecs restants (missions, timesheets, problems, standards, stats) sont
  **antérieurs à ce chantier** — reproduits à l'identique (même nombre, même
  liste) sur le code non modifié via `git stash`, donc sans lien avec les
  correctifs de cette passe (rapprochement des heures, limitation de débit).
  Non corrigés ici : hors périmètre de cet audit web, et un changement de
  comportement de test préexistant mérite sa propre investigation dédiée
  plutôt qu'une correction en passant.
- Aucune nouvelle dépendance ajoutée (le sidebar utilise une fonctionnalité
  déjà présente dans `@react-navigation/bottom-tabs`, déjà installé ; le
  correctif date/heure web utilise `React.createElement` sur un `<input>`
  HTML natif, sans bibliothèque supplémentaire).

## 4. Vérification réelle effectuée (pas seulement du code relu)

Contrairement à une simple relecture de code, ce chantier a été vérifié en
conditions réelles :

1. Backend démarré localement (PostgreSQL + API Express/Prisma), base
   migrée et peuplée avec les scripts de démo existants du dépôt
   (`prisma/seedDemo.ts`, `seedSupervisor.ts`, `seedDemoExtras.ts`).
2. Application lancée en mode web (`expo start --web`) dans un vrai
   navigateur Chromium (Playwright), avec connexion réelle (JWT, refresh
   token) sur des comptes de démonstration RH et Directeur.
3. Captures d'écran à plusieurs largeurs (1440px, 1100px) sur : écran de
   connexion, tableau de bord RH, tableau de bord Directeur, hub de gestion,
   tableau "Comptes", tableau "Chantiers", tableau "Missions", grille
   semaine du Planning, tableau "Absences", tableau "Journal d'activité",
   formulaire "Nouveau compte" en largeur maîtrisée, sidebar en mode
   compact — avec des comptes de démo RH, Directeur et Superviseur.
4. **Un bug réel a été trouvé et corrigé pendant cette vérification** : un
   cycle d'auto-import (`AppTabs.web.tsx` important `./AppTabs`, résolu par
   le bundler web vers lui-même) plantait le rendu de la sidebar au premier
   chargement. Corrigé en extrayant les constantes partagées dans
   `mobile/src/navigation/appTabsShared.ts`. Un second bug a été corrigé au
   passage : l'appel `CommonActions.navigate({ name, merge: true })` est
   déprécié dans la version installée de React Navigation et ne changeait
   pas d'onglet correctement — remplacé par la forme `navigate(name, params)`
   utilisée par le composant officiel. Sans ce test en conditions réelles,
   ces deux régressions seraient passées inaperçues malgré un `tsc`/`jest`
   propres.
5. **Deuxième round de vérification (24/09)** : création réelle d'un
   signalement avec photo (sélection de fichier, upload, affichage,
   téléchargement) et export Excel d'un dossier d'heures, toujours via
   Playwright + le backend seedé. C'est ce round qui a mis au jour les
   quatre bugs détaillés en §2.12 — là encore, invisibles sans test réel.
6. **Troisième round de vérification (24/09, audit exhaustif)** : reprise
   avec un compte admin technique fraîchement créé, création réelle d'un
   chantier puis d'une mission de bout en bout (formulaire → validation
   bloquante → détail → fiche de poste), navigation par tous les items de la
   sidebar et du rail compact, balayage des écrans RH/Direction
   (Absences, Journal d'activité, Messagerie avec recherche de contact). Deux
   pièges de méthode notés pour toute vérification future de ce type : (a)
   `element.textContent` sur `document.body` remonte aussi le texte des
   onglets non affichés que React Navigation garde montés en arrière-plan —
   ne pas l'utiliser pour vérifier qu'une navigation a eu lieu, préférer une
   capture d'écran ou une vérification de visibilité ; (b) `npx jest` sur le
   backend doit être lancé avec `--runInBand` (comme le fait `npm test`) — en
   parallèle, plusieurs suites de test partagent la même base de
   développement et se marchent dessus (violations de clé étrangère en
   cascade). Lancer le run de tests backend a par ailleurs vidé les comptes
   de démonstration précédemment créés (les suites de test réinitialisent
   les tables qu'elles utilisent) : à refaire après toute exécution de
   `npm test` côté backend si des comptes de démo sont nécessaires pour une
   vérification manuelle ultérieure.

## 5. État par domaine

| Domaine | État web | Remarque |
|---|---|---|
| Connexion | ✅ Fait | Panneau desktop dédié |
| Navigation principale | ✅ Fait | Sidebar + rail compact |
| Tableau de bord (tous rôles) | ✅ Fait | Grille KPI 4 colonnes, largeur plafonnée |
| Comptes (RH/Admin) | ✅ Fait | Vrai tableau + création, en-tête dédupliqué |
| Chantiers | ✅ Fait | Vrai tableau + création, en-tête dédupliqué |
| Missions | ✅ Fait | Vrai tableau + création, en-tête dédupliqué |
| Planning | ✅ Fait | Grille des 7 jours de la semaine côte à côte sur desktop |
| Dossiers d'heures | ✅ Fait | Tableau |
| Validation des heures | ✅ Fait | Tableau avec colonne Actions (Valider/Refuser) |
| Congés & absences | ✅ Fait | Tableau avec colonne Actions (Approuver/Refuser) |
| Journal d'activité | ✅ Fait | Tableau |
| Formulaires (nouveau compte, nouveau chantier, nouvelle mission) | ✅ Fait | Largeur plafonnée à 640px, centrés |
| Accessibilité clavier | ✅ Fait | Focus/activation déjà géré par `react-native-web` ; rôles/labels ARIA ajoutés sur la sidebar ; lignes non cliquables du tableau non focusables |
| PWA / manifeste web | ✅ Fait | `themeColor`, `shortName`, `lang`, `display` dans `app.json` |
| Signalements / photos (sélection, upload, affichage, téléchargement) | ✅ Fait | 3 bugs web réels trouvés et corrigés — voir §2.12 |
| Export CSV/Excel/PDF des heures | ✅ Fait | Même correctif que le téléchargement de photo — voir §2.12 |
| Formulaires secondaires (StandardForm, JobSheetForm, AbsenceForm, ReportProblem, RetroactiveClock, TimesheetReject, ChangePassword) | ✅ Fait | Même plafond 640px que les formulaires principaux |
| Sélecteurs de date/heure sur web (Mission, Absence, pointage différé) | ✅ Fait | `@react-native-community/datetimepicker` n'a pas d'implémentation web — remplacé par `<input type="date"/"time">` natif, voir §2.13 |
| Rapprochement des heures (minutes affichées) | ✅ Fait | Arrondi à l'entier côté API, voir §2.13 |
| Limitation de débit (`/refresh`, quota général par utilisateur) | ✅ Fait | Voir §2.13 |
| Accessibilité clavier des FAB de création (Standards, Comptes, Chantiers, Missions) | ✅ Fait | `accessibilityRole`/`accessibilityLabel` ajoutés, voir §2.13 |
| Missions et signalements (création, détail, fiche de poste) | ✅ Fait | Vérifié de bout en bout, voir §2.13 et §4 |
| Congés & absences, Journal d'activité, Messagerie (recherche de contact) | ✅ Fait | Vérifié en conditions réelles, voir §2.13 |
| En-tête global / breadcrumb (recherche, fil d'Ariane) | ℹ️ Non fait par choix | Chaque écran garde son en-tête natif-stack (titre le cas échéant + retour) ; pas de barre supérieure globale — délibérément laissé de côté, voir §6 |

## 6. Recommandations pour la suite

1. **En-tête global optionnel** (recherche, fil d'Ariane, notifications
   toujours visibles même en dehors de l'onglet Messagerie) si l'usage
   révèle un besoin réel — non fait ici pour rester focalisé sur les écrans
   à plus fort trafic.
2. **Rejouer cet audit après un vrai cycle d'usage RH/Direction** : les
   captures ont été prises avec des comptes de démonstration ; certains
   états (beaucoup d'absences en attente, un long historique d'activité)
   n'ont pas pu être observés faute de données de démo correspondantes.
3. **Vérifier la caméra web** (`capture="environment"` sur l'input file,
   utilisé par "Prendre une photo") sur un vrai poste équipé d'une webcam —
   testé ici uniquement via sélection de fichier, le comportement exact du
   navigateur avec un appareil photo réel n'a pas pu être vérifié dans ce
   conteneur.
4. **Envisager de signaler en amont** (issue sur `expo-image-picker`) le bug
   `dispatchEvent` décrit en §2.12 — le contournement local fonctionne, mais
   une vraie correction upstream éviterait de le maintenir indéfiniment.

## 7. Ce qui n'a pas changé, par conception

Conformément à la demande, aucune fonctionnalité, permission ou règle
métier n'a été modifiée : les mêmes rôles, les mêmes écrans, les mêmes
appels API. Seule la présentation change sur web, et seulement au-dessus
des seuils de largeur définis — un navigateur redimensionné en dessous de
1280px retombe sur une expérience identique au mobile, jamais un rendu
cassé ou à mi-chemin.
