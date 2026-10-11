# Reprise du travail — état d'Aussitôt

Branche : `claude/deep-clean-voice-chat-euxhm0` (dépôt `kingdream-digital/deep-clean`). Tout Aussitôt est dans `aussitot/` ; le reste du dépôt (Deep Clean) n'a pas été modifié.

## Fait et vérifié

| Domaine | État | Vérification |
| --- | --- | --- |
| Socle multi-entreprises (RLS `FORCE`, rôle sans privilège) | fait | tests d'isolation (`tenancy.test.ts`) |
| Comptes : opérateur → administrateur → RH ; première connexion ; désactivation ; réinitialisation | fait | tests + parcours dans le navigateur |
| Connexion, « Rester connecté », sessions (rotation, détection de vol), verrouillage | fait | tests (`auth.test.ts`) |
| Permissions par rôle (6 rôles), propriété des données | fait | tests des accès interdits (`permissions.test.ts`) |
| Clients, catalogue, devis, factures, avoirs, paiements, relances, PDF, emails | fait | tests (`sales.test.ts`), PDF rendus et relus |
| Planning, missions, consignes, suivi terrain, notifications ciblées, temps réel, push | fait | tests (`missions.test.ts`) ; push non testé sur un vrai téléphone |
| Assistant (outils, confirmations, quotas, droits) | fait | tests avec un modèle scénarisé (`assistant.test.ts`, `tests/visual/demo-server.ts`) ; **pas encore essayé avec une vraie clé Anthropic** |
| Dictée vocale et réponses parlées | fait | code relu, interface vérifiée sur le web ; dans Expo Go, désactivée proprement (message, assistant à l'écrit) ; **à essayer sur téléphone** (version de développement EAS) |
| Identité visuelle par entreprise (logo, couleur, aperçu, PDF, emails) | fait | tests (`branding.test.ts`), parcours réel avec deux entreprises (téléphone, ordinateur, mode sombre), PDF générés |
| Application : accueil par rôle, planning, ventes, équipe, notifications, activité, réglages, profil | fait | captures dans `docs/captures` (téléphone, ordinateur, clair, sombre) |
| Production : images Docker, Caddy HTTPS, compose, migrations | fait | pile complète démarrée et testée en HTTPS local |
| Serveur d'essai Coolify + Expo Go, comme Deep Clean | prêt | pile `docker-compose.coolify.yml` testée de bout en bout avec Docker (API, worker, base, Redis, web, Mailpit) ; **reste à la déployer sur le serveur Coolify** ([TESTER-SUR-TELEPHONE.md](TESTER-SUR-TELEPHONE.md)) |
| Montée en charge | mesuré | voir [SCALABILITE.md](SCALABILITE.md) |

Tests au dernier passage : shared 24, app 8, API 65 — tous au vert.

## Prochaines étapes, par priorité

1. **Déployer le serveur d'essai** sur le serveur Coolify de Deep Clean et ouvrir l'app dans Expo Go ([TESTER-SUR-TELEPHONE.md](TESTER-SUR-TELEPHONE.md)).
2. **Brancher une vraie clé `ANTHROPIC_API_KEY`** sur un environnement de recette et dérouler les scénarios de [ASSISTANT.md](ASSISTANT.md#exemples) ; ajuster `prompt.ts` sur des demandes réelles d'utilisateurs.
3. **Version de développement EAS** (`eas init`, `eas build --profile development`) pour essayer la dictée et les notifications push sur iOS et Android.
4. **Facturation électronique** (réforme française) : réception obligatoire pour toutes les entreprises depuis le 1er septembre 2026, émission obligatoire pour les PME et TPE au 1er septembre 2027. Prévoir le format Factur-X et la transmission via une plateforme agréée : indispensable pour vendre à des TPE/PME françaises.
5. **Marque** : recherche d'antériorité INPI / EUIPO, dépôt, réservation de `aussitot.app` ([MARQUE.md](MARQUE.md)).
6. **Abonnements de la plateforme** : les offres (`plan`), le nombre de comptes inclus (`seatLimit`, déjà appliqué) et le quota de l'assistant existent ; reste le paiement en ligne et l'espace de gestion de l'abonnement.
7. **Fonctions de Deep Clean non reprises** : signalements avec photos, absences / disponibilités / remplacements, pointage. L'architecture les accueille (même modèle : module API + permission + écran).
8. **Actions hors connexion** : file d'actions synchronisée au retour du réseau, avec gestion des conflits (aujourd'hui : consultation hors connexion seulement).
9. **Sécurité avant commercialisation** : CSP de l'app web, double authentification pour administrateur et RH, test d'intrusion externe ([SECURITE.md](SECURITE.md#points-à-traiter-avant-une-mise-en-production-réelle)).
10. **Intégration continue** : le dossier `.github/` est à la racine du dépôt, partagé avec Deep Clean ; à mettre en place avec l'accord du propriétaire (typecheck, tests avec PostgreSQL et Redis, build des images).

## Reprendre en local

```bash
cd aussitot && npm install && docker compose up -d
cp apps/api/.env.example apps/api/.env && cp apps/api/.env.test.example apps/api/.env.test   # secrets à remplir
npm run prisma:generate -w @aussitot/api && npm run db:migrate -w @aussitot/api
DEMO_MODE=1 npm run db:seed -w @aussitot/api
npm run dev:api & npm run dev:worker & npm run dev:app
```

Comptes de démonstration : voir [README.md](../README.md#comptes-de-démonstration) (mot de passe `DemoAussitot2026!`).
