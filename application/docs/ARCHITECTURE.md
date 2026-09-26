# Architecture — Deep Clean

## Vue d'ensemble

```
Application Deep Clean/
├── backend/     API REST (Node.js/TypeScript, Express, Prisma, PostgreSQL)
├── mobile/      Application mobile (Expo / React Native / TypeScript)
├── docs/        Documentation technique
└── docker-compose.yml   PostgreSQL local (dev + test)
```

Le backend et le mobile sont deux projets Node indépendants, chacun avec son propre
`package.json`, ses propres dépendances et son propre cycle de build. Ils ne
communiquent que via l'API HTTP (`EXPO_PUBLIC_API_URL` côté mobile).

## Backend

```
backend/src/
├── app.ts               Assemblage Express (middlewares, routes, gestion d'erreurs)
├── server.ts             Point d'entrée (écoute HTTP, arrêt propre)
├── config/
│   ├── env.ts             Validation stricte des variables d'environnement (Zod)
│   └── logger.ts          Logger structuré (Pino), avec rédaction des champs sensibles
├── db/
│   └── prisma.ts          Instance unique du client Prisma
├── middleware/
│   ├── auth.middleware.ts     Vérification du token d'accès + validité de session
│   ├── rbac.middleware.ts     Contrôle des rôles et de la propriété des données
│   ├── validate.middleware.ts Validation Zod de body/params/query
│   ├── rateLimit.middleware.ts Rate limiting général + dédié à l'authentification
│   └── error.middleware.ts    Gestion centralisée des erreurs (jamais de détail technique exposé)
├── modules/
│   ├── auth/          Connexion, refresh, déconnexion, changement de mot de passe
│   ├── users/          Gestion des comptes (création/activation/désactivation/reset — réservé RH/Admin)
│   ├── sites/          Chantiers : création (RH/Direction/Admin), visibilité et édition limitée selon le rôle
│   ├── missions/        Planning : création/modification/annulation/affectations, notifications automatiques
│   ├── problems/        Signalements (problème / matériel manquant) : photos, commentaires, suivi de statut
│   └── notifications/  Centre de notifications interne + enregistrement des tokens push
├── utils/
│   ├── ApiError.ts         Erreurs métier typées
│   ├── asyncHandler.ts     Wrapper pour les contrôleurs async
│   ├── password.ts         Hash bcrypt + politique de mot de passe + génération de mot de passe temporaire
│   ├── tokens.ts            JWT d'accès + refresh tokens (rotation, hash SHA-256 en base)
│   ├── storage.ts           Stockage local des photos (compression via sharp, clé opaque)
│   └── activityLog.ts       Journal d'activité (qui a fait quoi, quand)
└── types/express.d.ts   Extension du type Request (req.auth)
```

### Modèle de données (Prisma, `backend/prisma/schema.prisma`)

Couvre l'intégralité des entités prévues par le cahier des charges : `User`,
`Session`, `Site`, `SiteMember`, `Mission`, `MissionAssignment`, `Problem`,
`ProblemComment`, `Photo`, `Validation`, `Notification`, `PushToken`,
`ActivityLog`. Les modules **Auth**, **Users**, **Sites**, **Missions**,
**Problems** et **Notifications** exposent désormais une API complète.
`Validation` est utilisée pour la validation des missions terminées (voir
ci-dessous) ; les autres types prévus par l'enum (`SITE_CLOSURE`,
`PROBLEM_RESOLUTION`, `ACCOUNT_CHANGE`, `OTHER`) n'ont pas encore de
déclencheur applicatif — prochaine itération.

### Validation d'une mission terminée

- Endpoint dédié : `POST /missions/:id/validate` (body : `{ comment? }`),
  distinct du simple passage de statut à `COMPLETED`.
- **Réservée exclusivement au chef d'équipe responsable du chantier
  concerné** (`isOwningSiteManager()`, dans `missions.service.ts`) — ni la
  direction, ni l'admin technique, ni un autre chef d'équipe, même sur
  une mission qu'ils peuvent par ailleurs consulter ou gérer. Règle métier
  volontairement plus stricte que le reste du module Missions : c'est celui
  qui a suivi le chantier sur le terrain qui confirme que le travail a été
  fait correctement.
- Refusée tant que la mission n'est pas `COMPLETED`, et une seconde fois
  après une première validation (un enregistrement `Validation` de type
  `MISSION_COMPLETION` par mission, jamais modifiable ni révocable — c'est
  un journal d'audit, pas un statut qu'on peut défaire).
- Chaque validation conserve qui a validé, quand, et un commentaire libre
  optionnel — exactement ce que demande le cahier des charges (section 12) :
  "utilisateur, date, heure, action validée".

### Module Problems — signalements (problème / matériel manquant)

- Signalement depuis une mission : `type` (`ISSUE` ou `MISSING_MATERIAL`),
  description, puis 0 à plusieurs photos ajoutées séparément après création
  (`POST /problems`, puis `POST /problems/:id/photos`).
- Peut signaler : l'employé affecté à la mission, le chef d'équipe
  propriétaire du chantier, la direction, l'admin — jamais la RH
  (`problems.service.ts`, `canReportOnMission()`).
- Suivi de statut **strictement croissant** (`NEW → IN_PROGRESS → RESOLVED →
  VALIDATED`, jamais de retour en arrière, vérifié par index de tableau —
  `setProblemStatus()`), réservé au chef d'équipe propriétaire /
  direction / admin.
- Visibilité en lecture (et commentaires) : le rapporteur et les employés
  affectés à la mission concernée ; le chef d'équipe (son chantier), la
  **RH**, la direction et l'admin voient tout, sans restriction de
  chantier — une visibilité globale volontaire pour la RH, qui n'a
  cependant ni le droit de signaler, ni celui de faire avancer le statut
  (`canViewProblem()` vs `canManageProblem()`, deux fonctions distinctes).
  Toute tentative hors périmètre renvoie 404 (même logique que
  missions/notifications).
- Notification automatique au chef d'équipe à la création
  (`PROBLEM_UPDATE`), et au rapporteur à chaque changement de statut.

### Photos — stockage et upload sécurisés

- Upload via `multipart/form-data` (`multer`, mémoire uniquement — jamais
  écrit tel quel sur disque), limité à 8 Mo et aux types image courants.
- Chaque image est systématiquement redimensionnée (1600px max) et
  recompressée en JPEG qualité 82 par `sharp` avant écriture sur disque
  (`utils/storage.ts`) — répond aux exigences "compression/optimisation"
  et "stockage sécurisé" du cahier des charges.
- Le fichier est stocké sous une clé opaque (`randomUUID()`), **jamais**
  servi par un accès statique public : la seule façon de le récupérer est
  `GET /problems/:id/photos/:photoId/file`, qui revérifie les permissions
  du demandeur avant de streamer le fichier — jamais d'URL publique
  permanente.
- Fondation volontairement simple (disque local) : à remplacer par un
  stockage objet (S3/GCS + URLs signées à courte durée de vie) pour un
  déploiement multi-instance — l'interface de `storage.ts` est conçue pour
  rendre ce changement local à un seul fichier.

### Module Missions — règles métier

- **Gestion du planning** (créer/modifier tout champ/annuler une mission,
  gérer les affectations, créer/modifier la fiche de poste) réservée à la
  **RH**, au **superviseur**, à la **direction** et à l'**admin technique**
  (`missions.service.ts`, `canManagePlanning()`, constante
  `MISSION_MANAGE_ROLES`). Revirement métier assumé en deux temps, retour
  explicite du client : la RH d'abord, puis le chef d'équipe
  explicitement **retiré** de cette liste au profit du superviseur — il ne
  crée/modifie/annule plus de missions, même sur ses propres chantiers.
- Le chef d'équipe propriétaire du chantier concerné garde uniquement,
  au titre du suivi terrain :
  - **la consigne** (`Mission.instructions` seul, jamais titre/date/
    horaire/chantier — `updateMission()` rejette toute autre tentative de
    champ avec 403) ; la notification `MISSION_INSTRUCTION_ADDED` envoyée
    aux employés affectés mentionne désormais qui l'a ajoutée ;
  - **démarrer/terminer une mission** (`setMissionStatus()`,
    `canOperateSite()` = gestion du planning OU chef d'équipe
    propriétaire) ;
  - **valider une mission terminée** — avec la RH et le superviseur
    désormais (`validateMission()`, constante `VALIDATE_MISSION_ROLES`) ;
    direction et admin restent volontairement exclus de la validation.
- Un employé ne voit et ne peut consulter que les missions où il est
  affecté ; un chef d'équipe, que celles de ses propres chantiers (vue
  seule, cohérente avec ses droits d'action réduits). Toute tentative
  d'accès à une mission hors périmètre renvoie 404 (jamais 403), pour ne
  pas révéler son existence — même logique que pour les notifications.
- Chaque changement déclenche automatiquement la notification adéquate aux
  employés affectés (nouvelle affectation, changement d'horaire, changement
  de chantier, annulation, nouvelle consigne) — jamais à quelqu'un de non
  concerné, conformément au cahier des charges (section 8).
- Hypothèse documentée : le serveur et les appareils mobiles partagent le
  même fuseau horaire (déploiement France). Les dates/heures de mission
  transitent en `AAAA-MM-JJ` / `HH:mm`, combinées côté serveur — à revoir
  si l'entreprise opère un jour sur plusieurs fuseaux.

### Fiche de poste (`JobSheet`)

Un document par mission (étapes, matériel, consignes de sécurité, notes —
`PUT /missions/:id/job-sheet`), créé/modifié par les rôles de gestion du
planning uniquement (`upsertJobSheet()`, `canManagePlanning()` — le chef
d'équipe n'y a plus accès non plus). Consultable par quiconque peut voir la
mission, employés affectés inclus, pour compléter les consignes libres du
champ `Mission.instructions` par un standard réutilisable.

### Chantiers — droits du chef d'équipe réduits au strict terrain

Revirement métier assumé (retour explicite du client) : le chef d'équipe
ne modifie plus la fiche chantier elle-même, **y compris sa description**
(auparavant seul champ qui lui restait ouvert) — `sites.service.ts`,
`assertCanManage()`, désormais réservée à Superviseur/RH/Direction/Admin
sans exception. Il garde uniquement la composition de son équipe (ajouter/
retirer un `SiteMember` sur son propre chantier — `assertCanManageTeam()`,
fonction distincte de `assertCanManage()`), et la consultation de son/ses
chantier(s).

### Module Pointage (feuilles d'heures) — `timesheets`

Nouveau module (retour explicite du client : un système de pointage pour
tout le monde, avec validation) — modèle `TimeEntry` (`prisma/schema.prisma`),
module `backend/src/modules/timesheets/`.

- **Arrivée / sortie** (`POST /time-entries/clock-in` / `clock-out`) : un
  utilisateur ne peut avoir qu'**un seul pointage ouvert à la fois**
  (`clockOut: null`) — une tentative de pointer une seconde arrivée sans
  avoir clôturé la première renvoie `409`. Chacun pointe uniquement pour
  soi-même (`req.auth.userId`, jamais un id transmis par le client).
- **Consultation** (`GET /time-entries`) : un employé ne voit que ses
  propres pointages ; un chef d'équipe voit les siens et ceux des
  employés membres d'un chantier qu'il dirige (`SiteMember` + `Site.managerId`,
  fonction `isTeamMemberOf`) ; superviseur/RH/direction/admin ont une vue
  globale (`GLOBAL_VALIDATE_ROLES`).
- **Validation** (`POST /time-entries/:id/validate` ou `/reject`) : mêmes
  rôles habilités que pour la consultation (chef d'équipe sur son
  équipe, superviseur/RH/direction/admin sur tout le monde — le
  superviseur est le rôle central voulu par le client pour cette étape,
  avant transmission à la RH), avec une règle absolue — **personne ne peut
  valider ou refuser ses propres heures**, y compris la RH ou la direction
  (`canValidate`, vérifie `actor.userId !== targetUserId` avant toute autre
  condition). Un pointage encore ouvert (`clockOut` non renseigné) ne peut
  pas être validé. Le refus exige un motif (`comment` obligatoire), notifié
  à l'employé (`NotificationType.TIMESHEET_VALIDATED`) — le message inclut
  les horaires pointés (`formatEntryWindow()`) et le nom du validateur, et
  précise pour une validation que les heures sont transmises à la RH.
  `GET /time-entries/:id` (portée identique à la liste, 404 hors périmètre)
  permet d'ouvrir le détail d'un pointage précis depuis cette notification.
- **Pointage différé** (`POST /time-entries/retroactive`) : pour un oubli
  de pointer, un utilisateur saisit lui-même une session déjà terminée
  (arrivée + départ, jamais un pointage "en cours"). Refusé si la période
  est future, si elle chevauche un pointage déjà enregistré, ou si elle
  remonte à plus de 7 jours (`MAX_RETROACTIVE_DAYS` — au-delà, passage par
  la RH pour régularisation). Signalé `isRetroactive: true`, soumis à
  validation comme n'importe quel pointage.
- Mobile : `components/TimesheetWidget.tsx` (bouton pointer arrivée/sortie
  mis en avant tout en haut du tableau de bord, pour tous les rôles —
  c'est l'action la plus fréquente de l'app) ; `screens/timesheets/
  TimesheetScreen.tsx` (historique personnel) ; `TimesheetValidationScreen.tsx`
  + `TimesheetRejectScreen.tsx` (file de validation pour l'encadrement,
  onglets "En attente" / "Traités").

### Pourquoi ces choix

- **Express + TypeScript** : mature, explicite, aucune magie — chaque route,
  middleware et contrôleur est un fichier lisible indépendamment.
- **Prisma + PostgreSQL** : migrations versionnées, requêtes typées de bout
  en bout, relations explicites — adapté à un modèle métier riche en
  relations (utilisateurs, chantiers, missions, validations...).
- **JWT à courte durée de vie + refresh token en rotation** : le token
  d'accès (15 min) limite l'impact d'un vol de token ; le refresh token
  n'est jamais stocké en clair (hash SHA-256 en base) et est régénéré à
  chaque utilisation (rotation), ce qui invalide immédiatement un refresh
  token volé et réutilisé après coup.

## Mobile

```
mobile/src/
├── theme/            Palette (clair/sombre), typographie, espacements, ThemeProvider
├── components/        Composants premium réutilisables (Button, Card, TextField, StateView...)
├── auth/              AuthContext (état de session) + stockage sécurisé du refresh token
├── api/                Client HTTP (axios) + fonctions d'appel typées par domaine
├── navigation/         RootNavigator (auth ↔ app) + AppTabs (navigation par rôle)
│                        + MissionsStack / PlanningStack (pile de navigation imbriquée)
├── screens/            Écrans, organisés par domaine (auth, dashboard, missions, profile)
├── utils/              Fonctions pures partagées (ex: formatage/regroupement des missions par date)
└── hooks/              Hooks partagés (ex: compteur de notifications non lues)
```

### Flux d'authentification

1. `LoginScreen` appelle `POST /auth/login`.
2. `AuthContext` conserve `accessToken`/`refreshToken` en mémoire uniquement.
3. Si "Rester connecté" est coché, le refresh token est aussi écrit dans le
   stockage sécurisé (Keychain iOS / Keystore Android via `expo-secure-store`).
4. Au lancement de l'app, `AuthContext` tente de restaurer une session à
   partir du refresh token persisté ; sans token persisté (ou en cas
   d'échec), l'utilisateur retombe simplement sur l'écran de connexion.
5. Le client HTTP (`api/client.ts`) intercepte les réponses `401`, tente un
   rafraîchissement unique, rejoue la requête, et déconnecte l'utilisateur
   si le rafraîchissement échoue.
6. Si `user.mustChangePassword` est vrai (mot de passe temporaire fourni par
   la RH), `RootNavigator` bloque l'accès au reste de l'app tant que
   l'utilisateur n'a pas défini son propre mot de passe.

### Design

Design system maison inspiré des Human Interface Guidelines d'Apple (jamais
de copie littérale) : typographie Inter, coins arrondis, micro-interactions
de pression cohérentes sur tout élément cliquable. Le logo fourni a été
décliné en versions blanche/encre transparentes (`mobile/assets/brand/`) et
en jeu d'icônes d'application (icône iOS, icône adaptative Android, favicon,
splash screen).

**Thème clair forcé, volontairement.** Une première itération proposait un
mode sombre premium (surfaces à paliers d'élévation, jamais de noir pur) —
retour explicite du client : un fond sombre se lit "bas de gamme" pour un
outil vendu comme premium, et il a fourni une référence (dashboard
`janitly.com`) entièrement claire et colorée. `ThemeProvider`
(`mobile/src/theme/ThemeProvider.tsx`) fixe donc `isDark = false` et ne
suit plus `useColorScheme()` du système — c'est un choix de marque assumé,
pas une limitation technique. La palette `dark` reste définie dans
`colors.ts` (code mort, non branché) au cas où un vrai bouton de préférence
serait demandé plus tard.

#### Système de surfaces (clair)

`mobile/src/theme/colors.ts` : fond d'écran légèrement gris (`#F4F6F9`,
jamais blanc pur) sur lequel les cartes blanches (`backgroundElevated:
#FFFFFF`) se détachent nettement via une ombre douce + une bordure fine —
c'est ce palier de gris qui donne la lecture "dashboard dense" plutôt
qu'une page plate sans relief, à l'image de la référence fournie par le
client.

#### Rampe d'accent et palette de statut

Le bleu-sarcelle du logo reste l'unique identité de marque (`accentDeep
#0B5A70` / `accentBase #0E7490` / `accentBright #22D3EE`, `accentGradient`
deep→base pour les remplissages portant du texte : bouton principal,
pastille du jour sélectionné). La richesse visuelle vient d'une **palette
de statut et de KPI fonctionnelle** plutôt que d'une deuxième couleur de
marque ajoutée sans rôle : `info` (bleu), `purple`, `success` (vert),
`warning` (ambre), `danger` (rouge), `neutral` — chaque chiffre-clé et
chaque module de tableau de bord a une couleur cohérente d'un écran à
l'autre (`dashboardSections.ts`, champ `tone` ; `useDashboardData.ts`,
champ `tone` des `KpiTile`) au lieu de répéter le même accent partout —
c'est directement le retour du client ("des couleurs vraiment app 2030").

Les badges de statut (`StatusBadge`, `ProblemStatusBadge`) sont rendus en
"pill teintée" : fond à ~12% d'opacité de la couleur de statut + bordure à
~30% + point (pulsant sur les statuts actifs uniquement, statique sinon) —
jamais un aplat de couleur pleine, qui lit "kit UI gratuit".

Les cartes de mission (`MissionCard`) portent une fine barre verticale de 3px
à gauche, colorée selon le statut — un repère visuel immédiat, en plus du
badge, qui donne un sens à chaque carte d'un coup d'œil dans une liste.

#### Typographie (Inter)

Police système remplacée par **Inter** (`@expo-google-fonts/inter`, chargée
via `useFonts` dans `App.tsx` avant le premier rendu, écran de démarrage
affiché entre-temps) — un des marqueurs concrets qui distingue une
application "travaillée" d'un template, également utilisé par les
références étudiées. Contraste de tailles volontairement marqué entre le
gros chiffre (`type.statNumber`, 40px/700, utilisé sur les tuiles de
`StatsOverviewScreen`) et les libellés micro (`type.overline`, 11px/600
majuscules) plutôt qu'une échelle linéaire timide.

#### Harmonisation des cartes ("listes groupées" façon Apple)

Retour explicite du client : l'empilement de plusieurs petites cartes à
ombre marquée (une par chiffre-clé, une par raccourci de navigation) se
lisait "bas de gamme", chaque carré paraissant flotter indépendamment du
reste de l'écran plutôt que de faire partie d'un ensemble cohérent.
Correction en deux temps :

- **`components/Card.tsx`** : ombre nettement adoucie (`shadowOpacity`
  0.5→plus petit rayon, `elevation` ramenée à 1 hors variant `glow`) — la
  profondeur vient du contraste avec le fond gris de l'écran et d'un
  liseré fin, jamais d'une ombre épaisse. Un empilement de cartes à ombre
  discrète se lit comme un ensemble ; à ombre marquée, comme des blocs
  disparates.
- **`components/KpiGrid.tsx`** : les chiffres-clés d'un même écran
  (tableau de bord, `StatsOverviewScreen`) partagent désormais **une seule
  carte**, en grille 2 colonnes séparée par des filets internes, au lieu
  d'une carte séparée par chiffre. Même principe pour la section "Accès
  rapide" du tableau de bord (`HomeScreen.tsx`) et le hub de gestion
  (`ManagementScreen.tsx`) : une carte unique, des lignes cliquables
  séparées par un filet — jamais une pile de cartes indépendantes pour une
  liste de choix homogènes.

#### Écrans traités spécifiquement

- **Connexion** : fond en léger dégradé (`ScreenContainer` avec `gradient`),
  bouton principal en dégradé avec glow coloré. `components/LogoHalo.tsx`
  (halo derrière le logo) ne s'affiche qu'en mode sombre — inactif tant que
  le thème sombre n'est pas rebranché (voir plus haut) ; laissé en place
  plutôt que supprimé pour ce cas d'usage futur.
- **Planning hebdomadaire** : bande "hero" en plein-bord au-dessus de la
  liste (dégradé subtil, coins arrondis en bas) qui crée une rupture
  visuelle nette avec le contenu — la sélection du jour n'est plus un aplat
  mais un dégradé `accentGradient` avec glow.
- **Boutons primaires** (`Button.tsx`) : `LinearGradient` (`expo-linear-
  gradient`) plutôt qu'un fond plat, glow `shadowColor: accentBright`,
  assombrissement au clic par calque noir animé (`opacity` interpolée) —
  plus simple et plus fluide qu'animer les stops d'un dégradé directement.

#### Tableau de bord unique, dense en informations, pour tous les rôles

Retour explicite du client : arriver sur l'app doit donner "pas mal
d'infos direct, sans avoir besoin de cliquer". `AppTabs` fait donc
atterrir **tous les rôles** (y compris la RH, auparavant seule à y
atterrir) sur l'onglet **Accueil** (`initialRouteName="Accueil"`) — le
Planning détaillé reste à un onglet de là, mais n'est plus l'écran de
lancement. `HomeScreen.tsx` + `useDashboardData.ts` composent, pour le
rôle courant, uniquement à partir d'endpoints déjà autorisés côté serveur
pour ce rôle (aucune nouvelle route, aucun chiffre inventé) :

- **KPI colorées** (`components/KpiGrid.tsx`) : 2 à 4 chiffres selon le
  rôle, réunis dans **une seule carte groupée** à cellules séparées par un
  filet (façon Apple Santé/Réglages) plutôt qu'une tuile flottante par
  chiffre — voir "Refonte visuelle" ci-dessous. RH → missions du jour,
  comptes actifs/total, signalements ouverts (`listUsers`, `listMissions`,
  `listProblems`) ; Chef d'équipe → missions du jour, employés mobilisés
  cette semaine (déduit des affectations, sans appel supplémentaire),
  chantiers gérés, signalements ouverts ; Directeur/Admin → les 4 chiffres
  de `GET /stats/overview` (déjà réservé à ces deux rôles côté backend) ;
  Employé → missions du jour, missions à venir (7 jours), ses propres
  signalements ouverts.
- **Mini-planning de la semaine** (`components/WeekMiniGrid.tsx`) : 7
  colonnes lundi→dimanche, chantiers du jour en puces colorées (couleur
  stable par chantier, `utils/siteColor.ts` — hash de l'id, jamais
  aléatoire d'un rendu à l'autre). Affiché pour **tous les rôles y compris
  la RH** désormais, qui a maintenant accès à `listMissions` côté serveur
  (voir "Module Missions — règles métier" plus haut). Appuyer sur un jour
  ouvre l'onglet Planning complet.
- **Activité récente** : les 5 dernières notifications de l'utilisateur
  (`listNotifications`, déjà universellement accessible) — un flux
  d'activité "en direct" réel. Le vrai pointage (arrivée/sortie, validation)
  a depuis été ajouté comme un module à part entière — voir "Module
  Pointage" et `components/TimesheetWidget.tsx` — plutôt que d'être simulé
  ici.
- **Accès rapide** (`dashboardSections.ts`) : une seule carte groupée
  (lignes séparées par un filet, jamais une pile de cartes séparées) où
  chaque entrée mène soit à un onglet existant (`tab`, ex. Planning/
  Missions), soit à un écran réel de la pile Accueil (`screen`). Aucune
  entrée "Bientôt disponible" ne subsiste : chaque module annoncé au
  cahier des charges est soit branché sur un écran fonctionnel, soit retiré
  de la liste plutôt que simulé (section 27 du cahier des charges).

#### Modules Chantiers et Comptes (RH) — écrans réels

Ajoutés pour combler un écart : les endpoints backend de gestion des
chantiers et des comptes existaient depuis le socle initial, mais aucun
écran mobile ne les exposait encore (les cartes correspondantes
affichaient "Bientôt disponible").

- **Chantiers** (`screens/sites/`) : `SitesListScreen` (liste scopée
  côté serveur — un chef d'équipe ne voit que les siens), `SiteDetailScreen`,
  `SiteFormScreen` (création : nom, adresse, description, standard PDF
  optionnel ; édition, en plus : chef d'équipe assigné, statut
  actif/inactif — retour explicite du client : le chef d'équipe ne se
  choisit plus à la création, seulement ensuite). Création réservée Superviseur/
  RH/Direction/Admin — jamais le chef d'équipe — (`sites.routes.ts`,
  `CREATE_SITE_ROLES`), déjà appliqué côté serveur — le mobile ne fait
  qu'afficher ou masquer le bouton "+" en conséquence, jamais la seule
  barrière.
- **Comptes utilisateurs** (`screens/users/`) : `UsersListScreen`,
  `UserDetailScreen` (activer/désactiver, réinitialiser l'accès — affiche
  le mot de passe temporaire une seule fois, jamais stocké ni ré-affichable
  ensuite), `UserFormScreen` (création avec rôle, ou édition nom/téléphone/
  rôle). Création et actions de gestion réservées RH/Admin
  (`users.routes.ts`, `MANAGE_ACCOUNTS`) ; lecture seule pour Direction/
  Chef d'équipe (`VIEW_ACCOUNTS`), qui n'y voient ni bouton de création
  ni actions de gestion.
- **Onglet RH / Équipe / Chantiers / Administration** (`ManagementStack.tsx`) :
  remplace l'ancien écran "Bientôt disponible" (`ManagementScreen.tsx`) par
  un vrai hub — les mêmes écrans Chantiers/Comptes que ci-dessus, réunis
  dans une pile de navigation dédiée par rôle d'encadrement.

#### Animation (`react-native-reanimated`)

Élévation du niveau de finition à partir d'une recherche de références
(apps de planning/terrain premium + apps grand public réputées pour leurs
micro-interactions) :

- **`components/PressableScale.tsx`** : retour tactile cohérent (léger
  tassement + ressort) sur toute carte/ligne cliquable — mission,
  signalement, carte de tableau de bord, chips du sélecteur de jour.
  `Button.tsx` a son propre équivalent avec en plus un assombrissement de
  teinte du fond (variant principal) et un fondu croisé entre libellé et
  indicateur de chargement (jamais de saut de contenu).
- **`components/PulsingDot.tsx`** : pastille à pulsation douce, réservée
  aux statuts *actifs* (mission "En cours", signalement "Nouveau"/"En
  cours") — jamais sur un statut terminal, pour que le mouvement reste
  porteur de sens plutôt que décoratif (`StatusBadge`, `ProblemStatusBadge`).
- **Apparition en cascade** : les listes (missions, signalements,
  notifications, cartes de tableau de bord) font apparaître leurs éléments
  avec un léger décalage (`Animated.View entering={FadeInUp.delay(...)}`),
  plafonné pour ne jamais dépasser ~300ms de délai total sur une longue liste.
- **Sélecteur de jour de la semaine** (`PlanningScreen`) : une pastille
  d'arrière-plan glisse sous le jour sélectionné (`withSpring` sur une
  translation X) plutôt que de réapparaître brutalement. Point d'attention
  technique documenté dans le code : sur web, les éléments frères du
  sélecteur reçoivent par défaut `position: relative; z-index: 0` via
  react-native-web et peignent après la pastille dans l'ordre du DOM — un
  `zIndex: -1` explicite sur la pastille est nécessaire pour qu'elle reste
  visible derrière eux (natif iOS/Android non affecté par cette subtilité
  du web, mais le correctif est inoffensif partout).
- Toutes les durées restent sous 300-400ms (aucune animation ne doit
  ralentir la compréhension ni retarder une action métier).

### Planning & Missions (mobile)

- **Planning** (`PlanningStack`) : onglet dédié au planning détaillé, pour
  **tous les rôles y compris la RH** — désormais autorisée à créer et
  gérer le planning au même titre que la direction (voir "Module Missions
  — règles métier"). Ce n'est plus l'écran de lancement de l'app — tous
  les rôles atterrissent désormais sur
  **Accueil**, qui en affiche déjà un aperçu de la semaine (voir "Tableau
  de bord unique" ci-dessus) ; Planning reste accessible en un onglet pour
  la vue complète et les actions. Vue **semaine, lundi → dimanche** :
  sélecteur de 7 jours en
  chips (jour sélectionné, aujourd'hui repéré, pastille si le jour a des
  missions), navigation semaine précédente/suivante, raccourci "Revenir à
  aujourd'hui". La liste du jour sélectionné affiche tâche, horaire, lieu
  et statut (`MissionCard`). Le périmètre (personnel / chantiers gérés /
  vue globale) suit automatiquement la portée déjà appliquée côté
  serveur — aucune logique de rôle dupliquée côté mobile ; une semaine
  entière est chargée en un seul appel (`from`/`to`), le changement de
  jour est un filtrage local sans requête réseau supplémentaire.
- **Missions** (`MissionsStack`) : liste complète (À venir / Terminées /
  Annulées), création (chef d'équipe/direction/admin, bouton "+"),
  détail avec actions de cycle de vie (démarrer, terminer, annuler,
  modifier), formulaire de création/édition avec sélecteur de chantier,
  date/heure natifs (`@react-native-community/datetimepicker`) et sélecteur
  multi-employés avec désignation du chef d'équipe de la mission.
- Le formulaire ne permet pas de changer le chantier d'une mission après
  création (cohérent avec la règle serveur) ; toute autre modification
  (horaire, consignes, équipe) déclenche les notifications adéquates aux
  employés concernés.
- Une fois une mission `COMPLETED`, une section "Validation" apparaît sur
  `MissionDetailScreen` : commentaire optionnel + bouton "Valider la
  mission" pour le chef d'équipe propriétaire uniquement ; une fois
  validée (par lui, et seulement par lui), tout le monde voit qui a validé,
  quand, et le commentaire éventuel — plus aucun bouton, la validation est
  définitive.

### Signalements (mobile)

- Accessibles depuis le détail d'une mission (`MissionDetailScreen`) : liste
  des signalements existants + bouton "Signaler un problème" toujours
  visible (la visibilité de la mission elle-même suffit à déterminer qui a
  le droit de signaler — la RH n'atteint jamais cet écran).
- `ReportProblemScreen` : choix du type (Problème / Matériel manquant) via
  `SegmentedControl`, description, jusqu'à 5 photos prises avec l'appareil
  photo ou choisies dans la galerie (`expo-image-picker`) — envoyées
  séquentiellement après création du signalement.
- `ProblemDetailScreen` : photos (composant `AuthenticatedImage`, qui joint
  systématiquement le token d'accès courant puisqu'aucune photo n'est
  publique), fil de commentaires, et pour les gestionnaires (chef
  d'équipe propriétaire / direction / admin) un bouton unique qui fait
  avancer le statut à l'étape suivante du pipeline.
- Vue transverse (`ProblemsListScreen`, onglet Accueil devenu une pile de
  navigation — `HomeStack`) : accessible depuis la carte "Problèmes" du
  tableau de bord pour la RH, la direction et le chef d'équipe — chacun
  voit la portée que le serveur lui autorise (tout pour RH/direction,
  ses propres chantiers pour un chef d'équipe), sans logique de rôle
  dupliquée côté mobile. Onglets Ouverts/Résolus, réutilise
  `ProblemDetailScreen`.

### Statistiques (direction)

- `GET /stats/overview` (`backend/src/modules/stats/`) — réservé Direction
  et Admin (`requireRole`), jamais RH ni chef d'équipe, conformément au
  tableau de bord direction du cahier des charges (section 13). Agrège en
  parallèle (`Promise.all`) des comptages Prisma : chantiers/employés
  actifs, missions par statut et à venir sous 7 jours, signalements par
  statut/type, et un taux de validation (missions validées / terminées).
- Aucune donnée nominative dans la réponse — uniquement des compteurs.
- Mobile : `StatsOverviewScreen`, accessible depuis la carte "Statistiques"
  du tableau de bord direction (`HomeStack`), rendue en tuiles de
  statistiques groupées par thème (Activité / Missions / Signalements /
  Validations) — pas de bibliothèque de graphiques ajoutée pour cette
  fondation, les chiffres bruts suffisent à l'usage direction.

### Messagerie interne (`messages`)

Messagerie directe entre deux comptes quelconques de l'entreprise (retour
explicite du client : "communiquer directement avec tout le monde") —
`backend/src/modules/messages/`, modèle `Message` (`prisma/schema.prisma`).

- Pas d'entité "Conversation" en base : un fil entre deux utilisateurs se
  déduit en filtrant `Message` sur `(senderId, recipientId)` dans les deux
  sens (`getThread()`), plutôt qu'une table à maintenir en plus. La liste des
  fils actifs (`listConversations()`) part des identifiants des
  interlocuteurs déjà échangés (coût proportionnel au nombre de collègues
  contactés, pas au volume total de messages).
- Aucune restriction de rôle sur les routes : tout compte actif peut
  contacter n'importe quel autre compte actif. La portée d'un fil est de
  toute façon verrouillée par construction de la requête — un utilisateur ne
  peut techniquement pas voir un fil dont il ne fait pas partie, quel que
  soit l'id demandé dans l'URL.
- `GET /messages/contacts` : annuaire léger (nom, téléphone, rôle — jamais
  l'email ni les champs de gestion RH) de tous les comptes actifs sauf
  soi-même, pour démarrer une conversation ou consulter une fiche contact.
- Chaque message envoyé déclenche une alerte push directe
  (`sendExpoPushNotifications`) vers le destinataire, **sans** créer de
  `Notification` interne dupliquée : le segment "Messages" de l'onglet
  Messagerie a déjà son propre badge de non-lus, inutile de doubler avec une
  entrée dans le centre de notifications.
- Mobile (`mobile/src/screens/inbox/`) : un seul onglet **Messagerie**
  regroupe Notifications et Messages sous un contrôle segmenté
  (`InboxHomeScreen`), pour ajouter une vraie messagerie sans faire passer la
  barre d'onglets à 7 entrées (retour explicite du client). Fil de
  discussion avec sondage léger (5 s) pendant qu'il est à l'écran — pas
  d'infrastructure temps réel (websockets), cohérent avec le reste de l'app.

### Notifications push réelles

- `backend/src/utils/pushSender.ts` envoie chaque notification interne au
  service relais d'Expo (`https://exp.host/--/api/v2/push/send`, gratuit,
  aucun compte tiers requis) vers tous les appareils enregistrés de
  l'utilisateur concerné — remplace le simple log qui existait dans la
  fondation initiale. Échec d'envoi = best-effort : journalisé, jamais
  bloquant pour la notification interne (déjà persistée) ni pour l'action
  métier qui l'a déclenchée. Les tokens qu'Expo signale comme
  définitivement invalides (`DeviceNotRegistered`) sont supprimés de la
  table `PushToken` pour ne pas retenter en vain.
- `EXPO_ACCESS_TOKEN` (optionnel) : jeton recommandé par Expo en
  production pour fiabiliser l'envoi, le service fonctionne aussi sans.
- Mobile (`mobile/src/notifications/push.ts`) : demande la permission puis
  enregistre le token Expo de l'appareil dès qu'une session s'ouvre
  (`AuthContext`), et le désenregistre à la déconnexion — pour qu'un
  appareil partagé ne continue pas de recevoir les notifications d'un
  compte dont l'utilisateur s'est déconnecté. Échoue silencieusement
  (avec log) sur simulateur/émulateur, permission refusée, ou tant que le
  projet Expo n'est pas lié à un compte EAS (`projectId` absent) — dans
  tous les cas, la notification reste visible dans le centre de
  notifications interne de l'app.

### Mode hors connexion (fondation)

- Couvre la **lecture** uniquement, conformément au périmètre du cahier
  des charges ("consulter certaines données déjà chargées") : Planning,
  liste des Missions (par onglet) et Notifications mettent en cache leur
  dernière réponse serveur réussie (`mobile/src/offline/cache.ts`, sur
  `@react-native-async-storage/async-storage`).
- Si un chargement échoue **et** que `@react-native-community/netinfo`
  confirme l'absence de connexion, l'écran sert la dernière version mise
  en cache avec un bandeau explicite (`OfflineBanner`, "Hors connexion —
  données du HH:mm") plutôt qu'un écran d'erreur générique — l'utilisateur
  sait toujours si ce qu'il voit peut être daté.
- Explicitement **hors périmètre de cette fondation** : la mise en file
  d'actions réalisées hors connexion (créer une mission, signaler un
  problème...) pour synchronisation différée, et la résolution de
  conflits associée — ces actions nécessitent toujours une connexion et
  échouent proprement (`StateView kind="offline"`) plutôt que d'être
  mises en attente. À construire dans une itération dédiée si le besoin
  se confirme.

## Ce qui est volontairement hors périmètre à ce stade

Conformément à la demande ("construire d'abord les fondations", puis
"Planning + Missions", puis "signalements avec photos / matériel
manquant", puis "validation d'une mission terminée", puis "statistiques,
mode hors connexion, envoi push réel"), les éléments suivants restent hors
périmètre : la mise en file d'actions hors connexion et la résolution de
conflits de synchronisation (lecture seule pour l'instant — voir
ci-dessus), et les types de `Validation` autres que `MISSION_COMPLETION`
(clôture de chantier, résolution de problème, changement de compte). Le
journal d'activité, le RBAC, la gestion des comptes par la RH,
l'authentification complète, le centre de notifications interne (avec
envoi push réel), les chantiers, le planning/missions, les signalements
(avec photos), la validation des missions terminées, le pointage (arrivée/
sortie + validation par l'encadrement), les statistiques direction et la
consultation hors connexion des données déjà chargées sont pleinement
fonctionnels dès maintenant.
