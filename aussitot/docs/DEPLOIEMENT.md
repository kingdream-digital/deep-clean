# Mise en production

Deux façons de déployer, avec les **mêmes images** :

1. **Un serveur** (lancement, premiers clients) : tout sur une VM de 4 à 8 vCPU et 16 Go avec Docker Compose — [infra/production](../infra/production).
2. **Plusieurs serveurs** (au-delà de quelques milliers d'utilisateurs) : API et worker sur plusieurs machines, PostgreSQL, Redis et stockage S3 managés — dimensionnement dans [SCALABILITE.md](SCALABILITE.md).

Hébergement en France ou dans l'Union européenne conseillé pour la clientèle visée (Scaleway, OVHcloud, Clever Cloud…).

## Prérequis

- Deux sous-domaines **du même domaine** : `app.exemple.fr` (application web) et `api.exemple.fr` (API). Obligatoire : le cookie de session est `SameSite=Strict`.
- DNS de ces deux noms vers le serveur, ports 80 et 443 ouverts (certificats Let's Encrypt automatiques par Caddy).
- Un fournisseur d'emails transactionnels (SMTP) avec SPF, DKIM et DMARC configurés pour l'adresse d'expédition.
- Un compartiment S3 **privé** (ou compatible) pour les fichiers.
- Facultatif : clé `ANTHROPIC_API_KEY` (assistant), jeton `EXPO_ACCESS_TOKEN` (notifications push).

## Déploiement sur un serveur

Depuis le dossier `aussitot/` :

```bash
# 1. Images (API + worker, migrations)
docker build -f apps/api/Dockerfile -t aussitot-api:1.0.0 .
docker build -f apps/api/Dockerfile --target migrate -t aussitot-migrate:1.0.0 .

# 2. Application web (fichiers statiques servis par Caddy)
EXPO_PUBLIC_API_URL=https://api.exemple.fr npm run build:web -w @aussitot/app -- --clear
cp -r apps/app/dist infra/production/web

# 3. Configuration
cd infra/production
cp .env.production.example .env      # remplir CHAQUE valeur ; secrets : openssl rand -base64 48
#   API_IMAGE=aussitot-api:1.0.0, MIGRATE_IMAGE=aussitot-migrate:1.0.0

# 4. Démarrage : la base, les migrations, puis l'API (×API_REPLICAS), le worker et Caddy
docker compose --env-file .env up -d
curl https://api.exemple.fr/ready    # {"status":"ready","database":true,"redis":true}
```

Au premier démarrage, `db-init/00-roles.sh` crée le rôle `aussitot_app` (sans privilège, soumis à la RLS) avec `APP_DB_PASSWORD`. Le service `migrate` applique les migrations avec le rôle propriétaire puis s'arrête ; l'API ne démarre qu'après lui.

Ouvrir ensuite la première entreprise cliente (l'opérateur) :

```bash
curl -X POST https://api.exemple.fr/v1/platform/organizations \
  -H "x-platform-token: $PLATFORM_ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"slug":"proprete-martin","name":"Propreté Martin","admin":{"firstName":"Claire","lastName":"Martin","email":"claire@exemple.fr"}}'
```

La réponse contient, une seule fois, le mot de passe temporaire de l'administrateur. Il le remplacera à sa première connexion, réglera l'identité visuelle de son entreprise, puis créera les comptes de son équipe.

### Mettre à jour

```bash
docker build … -t aussitot-api:1.1.0 . && docker build … --target migrate -t aussitot-migrate:1.1.0 .
# .env : API_IMAGE / MIGRATE_IMAGE → 1.1.0
docker compose --env-file .env up -d     # migrations d'abord, puis remplacement des conteneurs
```

Les migrations doivent rester compatibles avec la version précédente le temps du remplacement (ajouter avant de retirer). Garder l'image précédente pour revenir en arrière.

### Variables d'environnement

Référence complète et commentée : [apps/api/src/config/env.ts](../apps/api/src/config/env.ts) (validée au démarrage : l'API refuse de démarrer si une valeur manque ou est invalide). Les plus importantes :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` / `DATABASE_ADMIN_URL` | rôle applicatif sans privilège / rôle propriétaire (migrations seulement) |
| `REDIS_URL` | sessions, limites, cache, temps réel, files |
| `JWT_SECRET`, `PLATFORM_ADMIN_TOKEN`, `METRICS_TOKEN` | secrets à générer pour chaque installation |
| `APP_URL`, `CORS_ORIGINS`, `TRUST_PROXY` | adresse de l'app web, origines autorisées, lecture des IP derrière le proxy |
| `WEB_CONCURRENCY`, `DB_POOL_SIZE` | processus par conteneur, connexions base par processus |
| `SMTP_*`, `MAIL_FROM_ADDRESS` | emails (l'expéditeur affiché est le nom de l'entreprise cliente) |
| `STORAGE_DRIVER=s3`, `S3_*` | fichiers privés partagés entre instances |
| `ANTHROPIC_API_KEY`, `ASSISTANT_*` | assistant (facultatif) |
| `EXPO_ACCESS_TOKEN` | notifications push |

## Sauvegardes

- **PostgreSQL** : sauvegardes automatiques du service managé avec restauration à un instant donné ; sur un serveur unique, au minimum un `pg_dump` chiffré chaque nuit, copié hors du serveur :

  ```bash
  docker compose exec -T db pg_dump -U postgres -Fc aussitot | gpg --encrypt -r exploitation@exemple.fr > aussitot-$(date +%F).dump.gpg
  ```

- **Fichiers** (logos, PDF) : versionnement du compartiment S3 activé.
- **Redis** : persistance activée (`appendonly`) ; il ne contient que des données reconstructibles et des tâches en attente.
- **Tester la restauration** régulièrement sur un environnement séparé : une sauvegarde jamais restaurée n'est pas une sauvegarde.

Rappel légal : les factures doivent être conservées 10 ans (Code de commerce) ; prévoir la durée de rétention des sauvegardes en conséquence.

## Supervision

- Sondes : `/health` (processus vivant), `/ready` (base et Redis joignables).
- Métriques : `/metrics` au format Prometheus, avec `Authorization: Bearer <METRICS_TOKEN>` (désactivé en production sans ce jeton).
- Journaux : JSON sur la sortie standard (`docker compose logs`), secrets masqués ; chaque erreur inattendue porte un identifiant de requête, aussi affiché à l'utilisateur.
- Alertes conseillées : voir [SCALABILITE.md](SCALABILITE.md#à-surveiller-en-production).

## Application mobile (Android et iOS)

L'application est construite avec **EAS Build** (Expo). Configuration : [apps/app/app.json](../apps/app/app.json) (nom, identifiants `app.aussitot.mobile`, autorisations micro / reconnaissance vocale / photos avec leurs textes explicatifs) et [apps/app/eas.json](../apps/app/eas.json).

### Une fois

```bash
npm install -g eas-cli
cd apps/app
eas login
eas init              # crée le projet EAS et ajoute son projectId (requis pour les notifications push)
```

- Remplacer `EXPO_PUBLIC_API_URL` dans `eas.json` (profils `preview` et `production`) par l'adresse de **votre** API : `https://api.aussitot.app` n'y figure qu'à titre d'exemple.
- Changer `bundleIdentifier` / `package` dans `app.json` si un autre identifiant est retenu (il ne pourra plus changer après la première publication).
- Notifications push : clé APNs (iOS) et identifiants FCM (Android) gérés par `eas credentials` ; jeton `EXPO_ACCESS_TOKEN` côté API.

### Construire

| Profil | Usage | Commande |
| --- | --- | --- |
| `development` | version de développement (avec la dictée vocale, absente d'Expo Go) | `eas build --profile development --platform android` (ou `ios`) |
| `preview` | test interne (APK Android, distribution interne iOS) | `eas build --profile preview --platform all` |
| `production` | publication sur les stores (numéro de version incrémenté automatiquement) | `eas build --profile production --platform all` |

Puis `eas submit --profile production --platform ios` (App Store Connect) et `--platform android` (Google Play Console). Comptes nécessaires : Apple Developer Program et Google Play Console.

Pour les stores : politique de confidentialité en ligne (micro, reconnaissance vocale, traitement des demandes par l'assistant), compte de démonstration pour la revue Apple (une entreprise de démonstration dédiée, jamais un vrai client), captures d'écran (voir [captures](captures)).

### Développer sur téléphone

```bash
eas build --profile development --platform android   # installer l'APK obtenu sur le téléphone
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npm run start -w @aussitot/app
```

Le téléphone et l'ordinateur doivent être sur le même réseau. Pour des essais avec un serveur en ligne et **Expo Go** (sans installation), comme pour Deep Clean : [TESTER-SUR-TELEPHONE.md](TESTER-SUR-TELEPHONE.md).

## Serveur d'essai sur Coolify

[docker-compose.coolify.yml](../docker-compose.coolify.yml) déploie en une seule ressource Coolify l'API, le worker, PostgreSQL, Redis, l'application web et une boîte mail de test (Mailpit), avec des secrets générés par Coolify et une entreprise de démonstration. Il sert aux **essais** (HTTP sur des adresses `sslip.io`, données fictives) ; un service réel utilise la configuration de production ci-dessus, en HTTPS. Pas à pas : [TESTER-SUR-TELEPHONE.md](TESTER-SUR-TELEPHONE.md).
