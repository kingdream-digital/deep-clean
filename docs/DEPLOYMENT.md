# Déploiement — VPS Oracle Cloud + Coolify

Ce document décrit comment l'application Deep Clean est actuellement hébergée
en ligne, et comment faire une mise à jour après une modification du code.
Objectif : que n'importe qui (ou une future session Claude Code) puisse
reprendre l'infrastructure sans tout redécouvrir.

## 1. Infrastructure

- **Serveur** : VPS Oracle Cloud (offre "Always Free"), Ubuntu 24.04 LTS,
  architecture ARM64 (aarch64).
- **IP publique** : `141.253.112.12`
- **Accès SSH** : utilisateur `ubuntu`, authentification par clé privée
  (fichier `.key.txt` téléchargé depuis la console Oracle Cloud à la création
  de l'instance — conservé par le propriétaire du serveur).
- **Panel de déploiement** : [Coolify](https://coolify.io) (open-source,
  auto-hébergé), installé directement sur ce VPS.
  - Dashboard : `http://141.253.112.12:8000`
  - Accès au dashboard restreint par IP dans la Security List Oracle Cloud
    (ports 8000/6001/6002) — voir §4 si l'IP change et que l'accès est perdu.

## 2. Ce qui tourne sur Coolify

Projet Coolify : **"My first project"**, environnement **"production"**.

### Backend (API)

- Application Coolify : `alive-alpaca-fmtokdqzbgwovcjd5frrhnvf`
- Dépôt : `kingdream-digital/deep-clean`, branche `master`
- Dossier de base : `application/backend`
- Méthode de build : Railpack (détection automatique Node.js)
- URL publique : `http://fmtokdqzbgwovcjd5frrhnvf.141.253.112.12.sslip.io`
  (domaine `sslip.io` : résout automatiquement vers l'IP du serveur, pas de
  nom de domaine payant nécessaire pour l'instant)
- Base de données : PostgreSQL 16, ressource Coolify séparée dans le même
  projet — connexion via `DATABASE_URL` (variable d'environnement du
  backend, voir Coolify > backend > Environment Variables pour la valeur
  réelle).
- Variables d'environnement importantes (valeurs réelles uniquement dans
  Coolify, jamais dans ce fichier) : `DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `CORS_ORIGINS` (doit inclure l'URL du web, voir
  ci-dessous), `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.
- Compte admin technique bootstrap : identifiant `atechnique` (généré par
  `prisma/seed.ts`) — mot de passe changé à la première connexion, RH créée
  depuis ce compte ensuite (voir README.md principal, section "Créer le
  premier compte RH").

### Web (interface RH/Direction dans le navigateur)

- Application Coolify : `perfect-platypus-5su1qf8vcecqqpi5ob17sp7a`
- Dépôt : `kingdream-digital/deep-clean`, branche `master`
- Dossier de base : `application/mobile`
- Type de site : **Static** (Railpack, serveur web `nginx:alpine`)
- Build command : `npx expo export --platform web` → dossier `/dist`
- URL publique : `http://5su1qf8vcecqqpi5ob17sp7a.141.253.112.12.sslip.io`
- Variable clé : `EXPO_PUBLIC_API_URL` = URL du backend + `/api/v1`
  (**doit être disponible "at Buildtime"**, pas seulement "Runtime" — Expo
  intègre cette valeur dans le JS au moment du build, pas au lancement).

### HTTPS : indispensable pour les applications iPhone / Android

Les URL `…sslip.io` ci-dessus sont en **http://** : suffisantes pour le web et Expo Go,
mais **inutilisables par une app installée depuis l'App Store / Google Play** (iOS et
Android bloquent le trafic non sécurisé). Avant toute publication, il faut un nom de
domaine et HTTPS sur le backend (`api.…`) et le web (`app.…`) : voir
`docs/PUBLICATION-STORES.md`, étape 1. Le site web sert aussi les pages publiques
exigées par les stores (`/politique-de-confidentialite.html`, `/assistance.html`,
`/suppression-de-compte.html`, sources dans `application/mobile/public/`).

### Authentification GitHub utilisée par Coolify

L'organisation GitHub `kingdream-digital` a des policies (niveau Enterprise)
qui bloquaient au départ les Deploy Keys et l'installation de GitHub Apps
tierces sur l'organisation — un propriétaire de l'org a dû aller activer
l'autorisation des Deploy Keys manuellement dans les réglages de
l'organisation. Une fois autorisées, une clé SSH dédiée a été créée dans
Coolify (**Keys & Tokens**, nommée automatiquement du type
`obnoxious-ox-...`) et ajoutée comme Deploy Key (lecture seule) sur le dépôt
GitHub (`Settings > Deploy keys`). Les deux applications Coolify
(backend et web) utilisent cette même clé pour cloner le dépôt privé.

## 3. Faire une mise à jour après une modification du code

1. Le code est modifié et poussé sur `master` du dépôt
   `kingdream-digital/deep-clean` (par une session Claude Code ou
   directement).
2. **Coolify ne redéploie pas automatiquement** (pas de webhook avec la
   méthode "Deploy Key over SSH", contrairement à un vrai GitHub App ou à
   Render). Pour chaque application concernée :
   - Ouvrir l'application sur `http://141.253.112.12:8000`
   - **Actions → Redeploy**
   - Attendre le statut "Success" puis "Running"
3. Si le changement touche le schéma de base de données (nouveau champ,
   nouvelle table) : après le redéploiement du backend, ouvrir son
   **Terminal** (menu de gauche) et lancer :
   ```
   npx prisma db push
   ```
   **Messagerie de groupe** : cette mise à jour ajoute les tables
   `conversations` et `conversation_participants` — le `npx prisma db push`
   ci-dessus est donc obligatoire avant que la messagerie refonctionne. La
   reprise des conversations existantes, elle, est automatique : le backend la
   lance seul **à son démarrage** (voir
   `application/backend/src/db/migrateMessagesToConversations.ts`), sans perte
   des messages ni de leur état lu/non lu. Comme le redéploiement a démarré le
   backend **avant** le `db push`, cette reprise n'a pas encore pu se faire :
   **après le `db push`, redémarrer le backend (Restart)**, ou la lancer à la
   main depuis le même terminal avec
   `npx tsx src/db/migrateMessagesToConversations.ts`. Elle est idempotente et
   sans effet une fois faite. Redéployer le web seulement ensuite.
4. Si `CORS_ORIGINS` doit changer (nouvelle URL web, nouveau domaine) :
   Environment Variables du backend → éditer la variable → **attention à ne
   coller QUE la valeur dans le champ Value, jamais `CORS_ORIGINS=` en plus**
   (bug rencontré une fois, voir §5) → sauvegarder → Redeploy.

## 3 bis. Charger la démo complète (présentation au client)

Script : `application/backend/prisma/seedPresentationDemo.ts`. Il remplit une
base **vide** avec une entreprise fictive complète : 11 comptes avec photo
(RH, direction, superviseur, chefs d'équipe, employés), 4 chantiers, une
semaine de planning datée autour du jour de la démo (une mission en cours ce
jour-là), signalements avec photo et fil de suivi, messagerie (fils à deux et
groupe avec PDF), pointages à valider, congés à approuver, standards de
nettoyage, fiche de poste, actualités, et tout le module commercial
(prospects, clients, devis, factures).

Dans Coolify, backend → **Terminal** :

```
DEMO_MODE=1 DEMO_DATE=2026-10-02 npx tsx prisma/seedPresentationDemo.ts
```

- `DEMO_DATE` = le jour où la démo sera montrée (format AAAA-MM-JJ). Sans
  lui, le jour de lancement est pris.
- Si le schéma de la base a changé depuis le dernier déploiement (nouveau
  champ, ex. heures par semaine), lancer d'abord `npx prisma db push` dans
  le Terminal du backend, puis la commande de démo.
- `DEMO_RESET=1` = efface TOUT avant de charger la démo (comptes, chantiers,
  missions, pointages, devis, messages...), sauf les comptes administrateur
  technique. À utiliser pour repartir d'une démo propre. Commande complète :
  `DEMO_MODE=1 DEMO_RESET=1 DEMO_HEURE=18:00 npx tsx prisma/seedPresentationDemo.ts`
- `DEMO_HEURE` = l'heure de la présentation (format HH:mm, ex. `18:00`).
  Les missions du jour sont placées autour : une terminée avant, une en
  cours, les suivantes après. Sans lui, horaires du matin.
- Mot de passe de tous les comptes : `DemoClean2026!` (identifiants affichés
  à la fin du script : `lpetit` employé, `kbenali` chef d'équipe, `ytraore`
  superviseur, `mdupont` RH, `jlefevre` direction).
- **Garde-fous** : sans `DEMO_MODE=1`, le script refuse de tourner sur un
  serveur en production. Et il s'arrête sans rien modifier dès que la base
  contient un seul compte qui n'est pas un compte de démo (hors admin
  technique) : impossible de mélanger la démo avec de vraies données.
- Aucun e-mail n'est envoyé pendant le chargement, même si le SMTP est
  configuré (les adresses de la démo sont inventées).
- Relancer le script ne crée pas de doublons.
- Les heures sont calculées en heure de Paris, quel que soit le fuseau du
  serveur.

**Avant la vraie mise en service**, la base de démo doit être vidée (les
comptes de démo ont un mot de passe public). À faire ensemble, ce n'est pas
une commande à lancer seul.

## 4. Pare-feu / accès réseau

Deux couches de pare-feu à tenir synchronisées :

- **Sur le serveur** (`iptables`, règles persistées avec
  `netfilter-persistent save`) : ports 22, 80, 443, 4000, 6001, 6002, 8000,
  8081 ouverts.
- **Console Oracle Cloud** (Security List du VNIC/Subnet de l'instance) :
  - Ports **80, 443, 22** : ouverts à tous (`0.0.0.0/0`) — trafic web public.
  - Ports **8000, 6001, 6002** (dashboard Coolify) : restreints à l'IP
    publique du propriétaire (`<IP>/32`), pas à tout le monde — si cette IP
    change (réseau différent, box qui redémarre), il faut mettre à jour
    cette règle pour retrouver l'accès au dashboard. Vérifier son IP
    actuelle sur https://whatismyip.com et remplacer la règle.
  - Ports **4000, 8081** : ouverts à tous à l'origine (tests directs
    avant la mise en place de Coolify) — plus nécessaires maintenant que
    tout passe par 80/443 via le reverse proxy de Coolify ; à fermer quand
    l'occasion se présente (amélioration sécurité, non urgente).

## 5. Bugs rencontrés pendant la mise en place (pour ne pas les refaire)

- **"Base directory" qui revient à `/`** : après avoir changé le "Build
  strategy" ou d'autres réglages de la section "Build pipeline" dans
  Coolify, le champ "Base directory" peut silencieusement revenir à `/` au
  lieu de la valeur voulue (`application/backend` ou `application/mobile`).
  Toujours revérifier ce champ juste avant de redéployer si le build échoue
  de façon inattendue (conteneur qui tourne mais ne fait rien, ou erreur
  "COPY ... not found").
- **Commande de démarrage `/bin/bash` toute seule** : si "Base directory"
  est resté sur `/`, Railpack ne trouve pas de `package.json` et génère un
  conteneur qui ne fait qu'ouvrir un shell bash sans rien exécuter — boucle
  de redémarrage silencieuse, sans aucun log (`docker logs` vide, code de
  sortie 0). Vérifiable avec `docker inspect <id> --format '{{json
  .Config.Cmd}}'` sur le serveur.
- **`docker-buildx-plugin` manquant** : la première fois que Railpack essaie
  de builder une image sur ce serveur, il peut manquer le plugin Docker
  buildx. Installé une fois pour toutes via le dépôt officiel Docker (voir
  historique de cette conversation ou réinstaller avec les commandes
  standard `docker-buildx-plugin` sur Ubuntu/Debian).
- **Variable d'environnement collée avec son propre nom en trop** : en
  éditant `CORS_ORIGINS` dans l'interface Coolify, la valeur collée
  contenait `CORS_ORIGINS=http://...` au lieu de juste `http://...` — la
  variable finit par valoir littéralement la chaîne `CORS_ORIGINS=http://...`,
  ce qui casse la comparaison d'origine côté serveur (CORS silencieusement
  refusé pour la bonne URL, mais toujours accepté pour les anciennes valeurs
  restées correctes). Toujours vérifier via le Terminal de l'app
  (`env | grep NOM_VARIABLE`) si un comportement CORS/env semble
  incohérent avec ce qui est affiché dans l'interface.
- **Comptes de démo (`seedDemo.ts`/`seedSupervisor.ts`) sans `username`** :
  ces scripts créaient des comptes sans le champ `username`, pourtant requis
  et unique (c'est l'identifiant de connexion réel, jamais l'email) —
  corrigé, voir commit "Corrige la création des comptes de démo".

## 6. Prévisualisation mobile (Expo Go)

Pour tester la version mobile (iOS/Android) sans passer par un vrai build
EAS, un serveur Expo de développement tourne en permanence sur le VPS
(dans une session `tmux` nommée `expo`, pour survivre à une déconnexion
SSH) :

```bash
tmux attach -t expo      # rejoindre la session si elle existe déjà
# ou, si elle n'existe pas / a été arrêtée :
tmux new -s expo
cd ~/deep-clean/application/mobile
git pull                  # récupérer le dernier code avant de relancer
npx expo start --tunnel
```

Nécessite d'être connecté au même compte Expo (`npx expo login`) que celui
utilisé dans l'app **Expo Go** sur le téléphone de démo — le mode `--tunnel`
n'autorise pas l'anonymat des deux côtés à la fois.

Limites à connaître : c'est un serveur de développement, pas une vraie
application installée — le VPS doit rester allumé et la session tmux
active. Pour une version installée de façon autonome (surtout nécessaire
pour iOS, qui interdit toute installation hors App Store/TestFlight sans
compte Apple Developer à 99$/an), voir `application/README.md` section
"Build de production" (EAS Build).

## Congés payés : calcul et validation mensuelle

- Unité : jours **ouvrables** (lundi → samedi, hors jours fériés légaux,
  calculés automatiquement, Pâques comprise — voir `utils/frenchCalendar.ts`).
- Acquisition : 2,5 jours par mois de travail (taux réglable par salarié),
  plafond 30 jours par période de référence (1er juin → 31 mai, réglable).
  Congé payé, accident du travail, maternité/paternité, autre absence :
  assimilés à du travail effectif. Arrêt maladie ordinaire : 2 jours par
  mois (loi du 22 avril 2024). Congé sans solde : aucun droit. Premier mois
  au prorata.
- Le 1er de chaque mois à 2 h (et au démarrage du serveur), les relevés du
  mois écoulé sont calculés pour chaque salarié actif et la RH / la
  direction sont prévenues. Menu → **Compteurs de congés** : la RH vérifie,
  corrige si besoin (motif obligatoire) et valide. Seuls les relevés
  validés comptent dans le solde ; personne ne valide le sien.
- Le compteur d'un nouveau salarié part de 0 à la création de son compte.
  Pour un salarié déjà présent, reporter son solde actuel depuis sa fiche
  (« Ajuster le solde »).
- Deux compteurs, comme sur une fiche de paie :
  **« Reste de l'an dernier »** (congés N-1, acquis pendant la période
  précédente, à prendre avant le 31 mai) et **« Cette année »** (congés N,
  en cours d'acquisition). Un congé pris est décompté d'abord sur l'an
  dernier, puis sur l'année en cours (anticipation). Une reprise de solde ou
  un report accordé par la RH (« Ajuster le solde », montant positif) est
  rangé avec l'an dernier. Ce qui reste de l'an dernier au 31 mai est perdu
  et affiché comme tel ; la RH peut accorder un report par un ajustement.
- Le 1er mars, avril et mai, chaque salarié à qui il reste des congés de
  l'an dernier reçoit un rappel (une seule fois par mois).

## Synchronisation entre appareils

Chaque modification réussie (mission, pointage, absence, devis…) fait avancer
un numéro de version côté serveur (`GET /api/v1/sync/version`). Les
applications ouvertes le consultent toutes les 8 secondes et rechargent
discrètement l'écran affiché dès qu'il change ; les autres écrans se
rechargent quand on y revient. Aucun réglage n'est nécessaire.

Ces rechargements comptent dans la limite de requêtes par personne :
prévoir `RATE_LIMIT_MAX_REQUESTS=1200` (par fenêtre de 15 minutes) dans les
variables d'environnement du Backend.
