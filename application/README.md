# Deep Clean

Application mobile professionnelle pour la gestion interne d'une entreprise
de nettoyage (employés, chefs d'équipe, RH, direction) : comptes et
rôles, planning, chantiers, missions, signalements, validations,
notifications.

Ce dépôt contient les **fondations** du projet : architecture complète,
authentification sécurisée, gestion des comptes par la RH, base de données
couvrant l'ensemble du périmètre métier, et une application mobile avec un
design premium prêt à recevoir les futurs modules (planning, missions,
chantiers...). Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour le
détail de ce qui est déjà fonctionnel et de ce qui reste à construire.

## Structure du dépôt

```
backend/     API REST (Node.js, TypeScript, Express, Prisma, PostgreSQL)
mobile/      Application mobile (Expo, React Native, TypeScript)
docs/        Documentation (architecture, sécurité)
docker-compose.yml   PostgreSQL local (base de dev + base de test)
```

## Prérequis

- Node.js ≥ 20
- Docker Desktop (pour PostgreSQL en local) — ou un PostgreSQL déjà installé
- Pour tester sur mobile : l'app **Expo Go** (Android/iOS) ou un simulateur

Les commandes ci-dessous utilisent une syntaxe shell POSIX (`cp`, `cd`) —
sous Windows, exécutez-les dans **Git Bash** (installé avec Git), ou
adaptez-les en PowerShell (`Copy-Item .env.example .env` à la place de
`cp .env.example .env`).

## 1. Démarrer la base de données

```bash
docker compose up -d db
```

Démarre PostgreSQL sur `localhost:5432` (utilisateur/mot de passe `postgres`,
base `deep_clean` — voir `docker-compose.yml`).

## 2. Backend

```bash
cd backend
cp .env.example .env
# Ouvrir .env et générer de vrais secrets, par ex. :
#   openssl rand -base64 64
npm install
npm run prisma:migrate      # crée les tables
npm run seed                # crée le compte administrateur technique initial
npm run dev                  # démarre l'API sur http://localhost:4000
```

Le compte administrateur créé par `npm run seed` utilise les identifiants
`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` définis dans `.env`.
C'est le seul compte qui ne passe pas par la RH — il sert justement à créer
le premier compte RH depuis l'application (`POST /api/v1/users`), qui
pourra ensuite créer tous les autres comptes.

Vérifier que tout fonctionne :

```bash
curl http://localhost:4000/health
```

### Tests backend

```bash
docker compose up -d db_test
cd backend
cp .env.test.example .env.test
npm run test:migrate   # applique les migrations sur la base de test
npm test
```

## 3. Mobile

```bash
cd mobile
cp .env.example .env
# Simulateur / même machine que le backend : laisser localhost.
# Téléphone physique (Expo Go) : remplacer par l'IP locale de votre machine,
# ex. EXPO_PUBLIC_API_URL="http://192.168.1.20:4000/api/v1"
npm install
npm run start
```

Scanner le QR code avec l'app **Expo Go** (Android/iOS), ou appuyer sur `i`
(simulateur iOS, macOS uniquement) / `a` (émulateur Android) / `w` (aperçu
web, pratique pour vérifier rapidement le design).

## Créer le premier compte RH

1. Se connecter à l'API avec le compte administrateur technique (`/auth/login`).
2. Créer un compte RH via `POST /api/v1/users` (`role: "HR"`).
3. Communiquer l'identifiant et le mot de passe temporaire renvoyé à la
   personne RH.
4. À partir de là, toute la gestion des comptes se fait depuis l'app, par
   la RH — plus besoin du compte administrateur au quotidien.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — organisation du code, choix techniques, flux d'authentification.
- [docs/SECURITY.md](docs/SECURITY.md) — mesures de sécurité mises en place et limites connues.

## Build de production

- **Backend** : `npm run build` (compile en `dist/`) puis `npm start`. Prévoir un vrai secret manager pour les variables d'environnement en production (ne jamais réutiliser les valeurs de développement).
- **Mobile** : builds Android/iOS via [EAS Build](https://docs.expo.dev/build/introduction/), configuré dans `mobile/eas.json` (profils `development`, `preview`, `production`).

> **Publication sur l'App Store et Google Play : suivre le guide pas à pas [docs/PUBLICATION-STORES.md](../docs/PUBLICATION-STORES.md)** (comptes, HTTPS, notifications, fiches, captures — tout est prêt dans [`store/`](store/)).

### Build mobile — première configuration (une seule fois)

```bash
cd mobile
npm install -g eas-cli   # ou npx eas-cli à chaque commande, sans installation globale
eas login                # compte Expo de l'entreprise
eas init                 # relie le projet à un projectId EAS (écrit dans app.json > extra.eas)
```

Pour un vrai build store (profil `production`), il faut en plus :

- un compte **Apple Developer** (99 $/an) pour iOS, avec les identifiants de signature générés automatiquement par `eas build` (ou importés manuellement) ;
- un compte **Google Play Console** (25 $ une fois) pour Android, avec un keystore généré automatiquement par `eas build` la première fois (EAS le conserve de façon sécurisée pour les builds suivants).

### Lancer un build

```bash
# Build de test interne, installable sans passer par un store
eas build --platform android --profile preview
eas build --platform ios --profile preview     # nécessite un compte Apple Developer même pour un build interne (limite Apple)

# Build store, prêt à soumettre
eas build --platform android --profile production
eas build --platform ios --profile production
```

Chaque profil pointe vers une URL d'API différente (`mobile/eas.json` > `env.EXPO_PUBLIC_API_URL`) : `development` vers un serveur local, `preview`/`production` vers l'API de production, **qui doit être en `https://`** (iOS et Android bloquent le `http://`). Tant que l'adresse est l'espace réservé `A-CONFIGURER.invalid`, le contrôle `npm run verifier:publication` — lancé aussi automatiquement par EAS au début de chaque build `preview`/`production` — refuse le build. Le profil `production` incrémente automatiquement le numéro de build (`autoIncrement: true`) — ne jamais le faire à la main.

Les identifiants de l'app sont `fr.kingdream.deepclean` (iOS et Android) : **définitifs dès le premier envoi sur un store**.

### Soumettre aux stores

```bash
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

Nécessite d'avoir renseigné les identifiants store dans `eas submit` (interactif la première fois, ou via variables d'environnement — voir la [documentation EAS Submit](https://docs.expo.dev/submit/introduction/)).
