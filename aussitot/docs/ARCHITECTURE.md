# Architecture

## Vue d'ensemble

```
 Téléphone (iOS, Android)        Navigateur (app web)
            │  HTTPS (JSON, flux SSE)      │
            └──────────────┬───────────────┘
                     Caddy (HTTPS)  ── répartit entre les instances
                           │
            ┌──────────────┼──────────────┐
         API ×N        API ×N         API ×N      Fastify, sans état
            │  \          │              │
            │   \── Redis : sessions, limites de débit, cache, temps réel (pub/sub), files
            │                             │
       PostgreSQL 16 (RLS)            Worker ×N   emails + PDF, push, maintenance
            │                             │
     Stockage fichiers (S3)        Claude (assistant), SMTP, Expo Push
```

- **apps/api** — API HTTP (Fastify 5, TypeScript) et worker. Prisma 7 (adaptateur `pg`) sur PostgreSQL 16, Redis 7 (ioredis), BullMQ pour les tâches, pdfkit pour les PDF, sharp pour les images, `@anthropic-ai/sdk` pour l'assistant.
- **apps/app** — une seule base de code Expo (SDK 57, React Native 0.86, expo-router) pour iOS, Android et le web. TanStack Query (cache, chargement progressif), reanimated, lucide.
- **packages/shared** — tout ce qui doit être identique des deux côtés : rôles et **matrice des permissions**, calculs de montants (centimes, BigInt), schémas de validation (zod), formats français, couleurs de marque, types des échanges (DTO).

Principe directeur : **le serveur décide, l'app affiche.** L'app masque ce qu'un rôle ne peut pas faire (confort), mais chaque service de l'API revérifie la permission et la propriété des données (sécurité).

## Plusieurs entreprises, une seule base

Chaque table métier porte `organization_id`. L'isolation n'est pas confiée au seul code applicatif :

1. L'API se connecte avec le rôle PostgreSQL `aussitot_app`, **sans privilège** (ni superutilisateur ni `BYPASSRLS`, voir [infra/db/init/00-roles.sql](../infra/db/init/00-roles.sql)).
2. Toutes les tables ont une politique **Row-Level Security** `FORCE` : une ligne n'est visible et modifiable que si son `organization_id` vaut l'entreprise de la transaction en cours (`app_current_org()`).
3. Chaque requête s'exécute dans `withTenant(orgId, …)` : une transaction qui fixe `app.org_id` (portée transaction) à partir du **jeton de session**, jamais d'une donnée envoyée par l'app.
4. Les rares lectures transverses (trouver une entreprise par son code à la connexion, retrouver une session) passent par des fonctions `SECURITY DEFINER` qui ne renvoient que le strict nécessaire.

Conséquence : même un oubli de filtre dans le code ne peut pas exposer les données d'une autre entreprise. Les tests `tenancy.test.ts` le vérifient.

Les migrations s'appliquent avec le rôle propriétaire (`DATABASE_ADMIN_URL`) ; **toute nouvelle table doit recevoir sa politique RLS** dans sa migration (voir [CLAUDE.md](../CLAUDE.md)).

## Modules de l'API

`apps/api/src/modules/<domaine>/` : `*.routes.ts` (aiguillage HTTP, rien d'autre) et `*.service.ts` (règles métier, permissions, transactions). Les écrans de l'app **et** les outils de l'assistant appellent les mêmes services : une règle n'existe qu'une fois.

| Module | Rôle |
| --- | --- |
| `auth` | Connexion, renouvellement, déconnexion, changement de mot de passe, première connexion |
| `users` | Comptes (création par RH/administrateur, rôles, désactivation, réinitialisation d'accès) |
| `organization` | Réglages de l'entreprise, logo, aperçu de documents |
| `platform` | Ouverture d'une entreprise cliente (opérateur uniquement) |
| `clients` | Clients, lieux d'intervention, catalogue de prestations |
| `quotes`, `invoices`, `sales` | Devis, factures, avoirs, paiements ; coordonnées figées à l'envoi / l'émission |
| `missions` | Planning, affectations, consignes, suivi terrain, validation |
| `notifications` | Centre de notifications, flux temps réel, jetons push |
| `dashboard` | Accueil par rôle, journal d'activité |
| `email` | Modèles, file d'envoi (outbox), livraison par le worker |
| `assistant` | Conversation, boucle d'outils, confirmations, quotas |

Socle (`apps/api/src/lib`) : `db.ts` (transactions par entreprise), `sessionCache.ts`, `orgCache.ts`, `realtime.ts`, `queue.ts`, `afterCommit.ts` (effets **après** validation de la transaction : on n'annonce jamais ce qu'une erreur a annulé), `storage.ts` (disque local ou S3), `pdf/`, `audit.ts` (journal d'activité), `metrics.ts` (Prometheus).

## Données

Schéma : [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma). Principales tables :

- `organizations` (réglages, mentions légales, identité visuelle), `users`, `sessions` (familles de jetons de renouvellement) ;
- `clients`, `sites`, `catalog_items` ;
- `quotes` / `quote_lines`, `invoices` / `invoice_lines` (factures et avoirs), `payments`, `number_sequences` (numérotation continue par année) ;
- `missions`, `mission_assignments` ;
- `notifications`, `push_tokens`, `email_outbox` ;
- `assistant_conversations`, `assistant_messages`, `assistant_actions` (confirmations en attente), `ai_usage_months` (quota) ;
- `activity_logs` (qui, quoi, quand, sur quel élément, via l'assistant ou non).

Règles transverses : montants en **centimes** (entiers), taux en points de base ; dates et heures toujours interprétées dans le **fuseau de l'entreprise** ; un devis envoyé ou une facture émise garde une copie figée du vendeur et du client (et de son logo) : le document reste identique à ce qu'a reçu le client.

## Temps réel et notifications

- Un changement de planning détermine les personnes concernées (affectées, retirées, chef d'équipe) et ne notifie **qu'elles** : notification enregistrée, événement temps réel, push.
- Temps réel : chaque instance de l'API garde ses connexions **Server-Sent Events** et s'abonne dans Redis aux seuls utilisateurs connectés chez elle ; un événement publié par n'importe quelle instance ou par le worker atteint l'utilisateur où qu'il soit connecté.
- Push : jetons Expo enregistrés par appareil, envoi par le worker (file BullMQ, nouvelles tentatives automatiques).
- Emails : écrits dans `email_outbox` dans la même transaction que l'action, puis livrés par le worker (PDF joint, logo intégré). Rien n'est perdu si le serveur redémarre.

## Application

- `app/(auth)` : connexion (code entreprise, identifiant, mot de passe, « Rester connecté ») ; `app/premiere-connexion.tsx` : mot de passe temporaire à remplacer.
- `app/(app)` : accueil, planning, ventes (devis, factures), clients, équipe, notifications, activité, réglages, profil, assistant.
- Navigation : barre latérale sur grand écran (assistant ouvrable par Ctrl/⌘ + K), barre d'onglets avec bouton micro central sur téléphone ; seules les sections autorisées pour le rôle apparaissent.
- `src/api` : client HTTP (jeton d'accès en mémoire, renouvellement automatique et unique), points d'accès typés.
- `src/features`, `src/ui`, `src/theme` : composants métier, système de design (typographie Inter, modes clair et sombre, animations courtes respectant « réduire les animations »).

### Hors connexion

TanStack Query conserve sur l'appareil les données utiles sur le terrain (accueil, planning, missions, notifications), jamais les factures ni les fiches clients. Hors connexion, l'utilisateur consulte ce qui a déjà été chargé et un bandeau l'indique. **Les actions nécessitent la connexion** : la file d'actions hors ligne avec résolution des conflits fait partie des évolutions prévues (voir [REPRISE-SESSION.md](REPRISE-SESSION.md)).

## Ce qui tourne en production

| Processus | Rôle | Mise à l'échelle |
| --- | --- | --- |
| `api` (`dist/server.js`) | HTTP + flux temps réel | horizontale (sans état), `WEB_CONCURRENCY` processus par conteneur |
| `worker` (`dist/worker.js`) | emails, push, maintenance | horizontale (BullMQ répartit les tâches) |
| `migrate` | migrations Prisma, puis s'arrête | une fois par déploiement |
| PostgreSQL, Redis | données, cache, files | services managés au-delà d'un serveur |

Détails : [DEPLOIEMENT.md](DEPLOIEMENT.md) et [SCALABILITE.md](SCALABILITE.md).
