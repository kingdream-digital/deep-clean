# Sécurité — Deep Clean

Résumé de ce qui est implémenté dans les fondations, et pourquoi.

## Comptes et accès

- **Aucune inscription publique.** Le backend n'expose aucune route de
  création de compte en libre-service ; seule la RH (ou l'admin technique)
  peut créer un compte, via `POST /api/v1/users` (protégé par rôle).
- **Mots de passe** : hashés avec bcrypt (12 rounds), jamais stockés ni
  journalisés en clair. Politique appliquée côté serveur (10 caractères
  minimum, majuscule, minuscule, chiffre, caractère spécial) —
  `backend/src/utils/password.ts`.
- **Première connexion** : un mot de passe temporaire est généré par la RH
  et l'utilisateur doit le remplacer avant d'accéder au reste de l'app
  (`mustChangePassword`).
- **Réinitialisation par la RH** : génère un nouveau mot de passe temporaire
  sans jamais exposer ni connaître l'ancien, et invalide toutes les
  sessions actives de l'utilisateur concerné.
- **Désactivation de compte** : révoque immédiatement toutes les sessions
  actives ; toute requête ultérieure avec un ancien token échoue (le
  middleware d'authentification revérifie `isActive` à chaque requête, pas
  seulement au moment de la connexion).

## Sessions et tokens

- **Access token JWT** (15 min) signé avec un secret dédié
  (`JWT_ACCESS_SECRET`), jamais utilisé pour autoriser une action sans
  revérification de la session en base (`Session` non révoquée, non
  expirée).
- **Refresh token** : chaîne aléatoire de 64 octets, dont seul le hash
  SHA-256 est stocké en base — comme un mot de passe, il est donc
  impossible de le reconstituer à partir d'une fuite de base de données.
- **Rotation à chaque refresh** : l'ancien refresh token est révoqué dès
  qu'un nouveau est émis, ce qui limite la fenêtre d'exploitation d'un vol
  de token.
- **Changement de mot de passe** : invalide toutes les autres sessions
  actives de l'utilisateur.
- **"Rester connecté"** : seule cette option persiste le refresh token sur
  l'appareil (Keychain/Keystore via `expo-secure-store`) ; sinon la session
  reste en mémoire pour la durée de vie de l'app uniquement, avec une
  expiration serveur plus courte (1 jour contre 30).

## API

- **Aucune confiance dans le frontend.** Chaque route sensible vérifie,
  côté serveur : authentification (`authenticate()`), rôle
  (`requireRole()`), et propriété des données quand pertinent (ex :
  `notifications.service.ts` renvoie 404 — pas 403 — si une notification
  n'appartient pas à l'appelant, pour ne pas révéler son existence).
  Aucune permission n'est appliquée côté mobile seul.
- **Propriété des chantiers/missions** : un chef d'équipe ne peut agir
  que sur les chantiers dont il est explicitement le responsable
  (`site.managerId`) et sur les missions de ces chantiers — jamais sur
  ceux d'un autre chef d'équipe, même en devinant un identifiant
  (`missions.service.ts` / `sites.service.ts`, fonction `canManageSite()`,
  vérifiée à chaque écriture). Un employé ne peut consulter que les
  missions où il est explicitement affecté.
- **Validation d'une mission terminée** : règle intentionnellement plus
  stricte que le reste du module Missions — réservée au seul chef
  d'équipe responsable du chantier (`isOwningSiteManager()`), y compris
  exclue de la direction et de l'admin technique. Chaque validation est un
  enregistrement d'audit immuable (qui, quand, commentaire), jamais
  modifiable ni révocable via l'API.
- **Validation systématique** des entrées (`body`/`params`/`query`) avec
  Zod avant tout traitement métier — `middleware/validate.middleware.ts`.
- **Rate limiting** : limite générale sur toute l'API, et limite dédiée,
  plus stricte, sur `/auth/login` et `/auth/refresh` pour freiner le brute
  force.
- **En-têtes de sécurité** via Helmet, CORS restreint aux origines
  déclarées dans `CORS_ORIGINS`.
- **Messages d'erreur génériques** : un identifiant/mot de passe incorrect
  renvoie toujours le même message (`Identifiant ou mot de passe
  incorrect.`), sans indiquer lequel des deux est fautif, pour empêcher
  l'énumération de comptes.
- **Gestion d'erreurs centralisée** : toute exception non prévue est
  journalisée en détail côté serveur mais renvoyée au client sous une forme
  générique (`error.middleware.ts`) — aucun détail technique (stack trace,
  requête SQL, etc.) n'atteint jamais le mobile en production.

## Fichiers et photos

- Chaque photo est stockée sous une clé opaque (`storageKey`, générée par
  `randomUUID()` côté serveur — jamais dérivée d'une donnée fournie par le
  client) et n'est **jamais** exposée par un accès statique public.
- La seule façon de récupérer une photo est `GET
  /problems/:id/photos/:photoId/file`, qui revérifie à chaque appel que
  l'utilisateur a le droit de consulter le signalement concerné (même
  logique de propriété que pour les missions) avant de streamer le
  fichier depuis le disque.
- Upload limité en taille (8 Mo par défaut, `MAX_UPLOAD_SIZE_MB`) et en
  types de fichiers acceptés (JPEG/PNG/WebP/HEIC), avec un message d'erreur
  explicite en cas de dépassement plutôt qu'un plantage générique
  (`multer` + traduction dédiée dans `error.middleware.ts`).
- Chaque image est systématiquement redimensionnée et recompressée
  (`sharp`) avant écriture sur disque — jamais le fichier brut envoyé par
  le client n'est conservé tel quel.
- Fondation en stockage disque local (`backend/uploads/`, hors dépôt git) :
  suffisant pour une seule instance, à remplacer par un stockage objet
  (S3/GCS + URLs signées) avant un déploiement multi-instance/horizontal.

## Secrets

- Toutes les valeurs sensibles (secrets JWT, identifiants de base de
  données) vivent dans des variables d'environnement (`.env`, jamais
  commité — voir `.gitignore`), avec validation stricte du format au
  démarrage (`config/env.ts`) : l'application refuse de démarrer si un
  secret est manquant ou trop court.
- `.env.example` documente les variables attendues sans jamais contenir de
  vraie valeur secrète.

## Journal d'activité

Chaque action sensible (création/modification/activation/désactivation de
compte, réinitialisation d'accès, changement de mot de passe, tentative de
connexion échouée) est enregistrée dans `ActivityLog` avec l'utilisateur,
l'action, la cible et l'horodatage — `utils/activityLog.ts`.

## Limites connues à ce stade

- Pas encore de 2FA (non demandé dans le cahier des charges initial, mais
  le modèle `User` et le flux d'authentification permettraient de
  l'ajouter sans rupture).
- Pas encore de verrouillage de compte après N échecs de connexion
  consécutifs (seul le rate limiting par IP est en place) — à ajouter avec
  le module RH si nécessaire.
- **Statistiques** (`GET /stats/overview`) réservées Direction/Admin —
  jamais RH ni chef d'équipe, conformément au tableau de bord défini
  dans le cahier des charges. Uniquement des compteurs agrégés, aucune
  donnée nominative.
- **Notifications push** désormais réellement envoyées via le relais Expo
  (`utils/pushSender.ts`), plus seulement journalisées — voir
  `docs/ARCHITECTURE.md`. Le token push d'un appareil est désenregistré à
  la déconnexion pour qu'un appareil partagé ne reçoive plus les
  notifications d'un compte dont l'utilisateur est parti.
- **Mode hors connexion** : lecture seule (dernières données déjà
  chargées, mises en cache localement côté mobile) — aucune action
  (création, modification, upload de photo...) n'est mise en file pour
  synchronisation différée ; elle nécessite toujours une connexion active
  et échoue proprement sinon. La résolution de conflits de synchronisation
  reste donc hors périmètre.
