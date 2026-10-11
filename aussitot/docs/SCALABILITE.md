# Montée en charge : objectif 10 000 utilisateurs simultanés

## Ce que veut dire « 10 000 utilisateurs simultanés »

10 000 personnes qui ont l'application ouverte en même temps (connectées, flux temps réel ouvert), réparties entre de nombreuses entreprises clientes. Dans un logiciel de gestion, une personne active ouvre un écran ou rafraîchit des données toutes les 15 à 45 secondes environ : 10 000 utilisateurs représentent donc de l'ordre de **330 requêtes par seconde en moyenne**, avec des pointes de 2 à 3 fois plus (début de journée : tout le monde ouvre son planning).

L'architecture est faite pour cela : API sans état qui se multiplie, travail lent confié au worker, données partagées entre instances par Redis, isolation par la base. Les chiffres ci-dessous sont **mesurés**, avec leurs conditions ; le dimensionnement final se valide avec le kit fourni sur l'infrastructure réelle.

## Mesures

### Conditions

- Une seule machine de **4 vCPU et 16 Go**, partagée par **tout** : l'API (build de production), PostgreSQL 16, Redis 7 **et** le générateur de charge lui-même. C'est défavorable : en production, la base et l'API ont chacune leurs machines.
- Comptes, clients, devis et missions créés par l'API publique, comme de vrais clients (`infra/load/preparer-comptes.mjs`), connexions réelles, renouvellement des jetons comme le fait l'app.

### Journée type (k6, `infra/load/k6-journee.js`)

Chaque utilisateur virtuel se connecte, puis enchaîne les écrans de l'application (accueil, planning, notifications, ventes pour l'encadrement). Pour charger la machine avec peu d'utilisateurs virtuels, le temps entre deux écrans a été réduit à **1 à 3 secondes** au lieu de 15 à 45 : chaque utilisateur virtuel produit environ 15 fois plus de requêtes qu'une vraie personne. API : 3 processus (`WEB_CONCURRENCY=3`).

| Utilisateurs virtuels | Débit | Erreurs | Latence p95 | Accueil p95 | Planning p95 | Notifications p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 600 | **331 req/s** (50 285 requêtes) | **0 %** | **85 ms** | 113 ms | 76 ms | 46 ms |
| 1 500 (saturation) | 441 req/s (60 411 requêtes) | 0 % | 2,1 s | 2,2 s | 2,1 s | 1,8 s |

Lecture :

- À 600 utilisateurs virtuels, la machine sert le **volume de requêtes d'environ 7 000 personnes au rythme réel** (234 écrans/s ; une personne réelle en ouvre un toutes les 30 s environ), avec des temps de réponse très bas et aucune erreur.
- Vers 440 req/s, cette machine unique est **saturée** (processeur partagé entre API, base et générateur) : les temps de réponse montent, mais **aucune requête n'échoue**.
- Ce scénario ne maintient pas les flux temps réel ouverts : leur coût (mémoire, voir plus bas) est à part.

### Débit par écran (autocannon, 100 connexions, 11 sessions différentes, 12 s par route)

| Route | 1 processus | 3 processus |
| --- | --- | --- |
| `GET /health` (socle HTTP) | 6 904 req/s | 19 626 req/s |
| `GET /v1/auth/me` (jeton + session) | 737 req/s · p99 279 ms | 1 251 req/s · p99 164 ms |
| `GET /v1/notifications/unread-count` | 886 req/s · p99 178 ms | 1 828 req/s · p99 105 ms |
| `GET /v1/dashboard` (accueil complet) | 211 req/s · p99 942 ms | 328 req/s · p99 593 ms |
| `GET /v1/missions` (planning de la semaine) | 355 req/s · p99 535 ms | 590 req/s · p99 297 ms |
| `GET /v1/quotes` (liste des devis) | 519 req/s · p99 312 ms | 980 req/s · p99 172 ms |
| `POST /v1/auth/login` (16 connexions) | 93 req/s · p99 296 ms | — |

La connexion est volontairement coûteuse (argon2id, 19 Mio par calcul) : c'est la protection contre le cassage de mots de passe. Elle n'a lieu qu'une fois par session ; « Rester connecté » renouvelle ensuite la session sans recalcul.

### Optimisations issues de ces mesures

- Accueil : lectures personnelles regroupées en **une seule transaction**, indicateurs d'entreprise (ventes, équipe) en cache Redis 30 s → **+33 %** de débit (159 → 211 req/s sur un processus).
- Validité des sessions et informations d'entreprise en cache (Redis / mémoire, invalidation immédiate entre instances) : aucune lecture en base juste pour authentifier une requête.
- Requêtes d'une même transaction exécutées en séquence (une transaction = une connexion), index sur tous les chemins chauds (missions par date, notifications par utilisateur, documents par statut), pagination par curseur.
- Mode multi-processus (`WEB_CONCURRENCY`) : un conteneur exploite tous ses cœurs.

## Dimensionnement recommandé pour 10 000 utilisateurs simultanés

| Composant | Recommandation | Pourquoi |
| --- | --- | --- |
| API | **3 instances de 4 vCPU / 8 Go**, `WEB_CONCURRENCY=4`, derrière un répartiteur (Caddy, ou celui de l'hébergeur) | une instance suffit au volume moyen mesuré ; trois pour les pointes du matin, la panne d'une machine et les déploiements sans coupure |
| PostgreSQL | **managé**, 4 vCPU / 16 Go, stockage SSD, sauvegardes continues, réplique de secours ; **PgBouncer** en mode transaction | le contexte d'entreprise est fixé par transaction (`set_config(…, true)`), compatible avec ce mode |
| Connexions base | `DB_POOL_SIZE` × processus × instances ≤ capacité (ex. 10 × 4 × 3 = 120) | éviter d'épuiser `max_connections` |
| Redis | managé, 1 à 2 Go, persistance, `maxmemory-policy noeviction` | sessions, limites, cache, temps réel, files d'attente |
| Worker | 2 instances (1 vCPU chacune) | emails avec PDF et push ne ralentissent jamais l'API |
| Fichiers | stockage S3 privé (`STORAGE_DRIVER=s3`) | partagé par toutes les instances |
| App web | fichiers statiques derrière un CDN | aucune charge sur l'API |

Ordre de grandeur attendu : plus de 1 500 req/s avec une latence p95 sous 300 ms, soit **4 à 5 fois** le volume moyen de 10 000 utilisateurs. C'est une estimation fondée sur les mesures ci-dessus (une machine partagée tenait déjà ~330 req/s avec une latence p95 de 85 ms) : **à confirmer avec le kit de charge** sur l'infrastructure choisie avant l'ouverture commerciale.

### Flux temps réel

Chaque utilisateur connecté garde un flux Server-Sent Events ouvert (battement toutes les 25 s). 10 000 flux répartis sur 3 instances ≈ 3 300 connexions par instance : peu de mémoire, aucune requête en base, **un seul** abonnement Redis par instance. Le répartiteur doit laisser les connexions inactives ouvertes plus de 25 s et ne pas mettre les réponses en tampon (déjà réglé dans `infra/production/Caddyfile`). Suivi : métrique `aussitot_realtime_connections`.

### Assistant

Le temps de l'assistant est surtout celui du modèle (quelques secondes) : il n'occupe presque pas le processeur de l'API. Garde-fous : `ASSISTANT_MAX_CONCURRENCY` (200 réponses simultanées par instance), 20 demandes / minute / utilisateur, quota mensuel par entreprise. Le plafond réel est celui du **niveau de débit du compte Anthropic** : à dimensionner selon l'usage attendu (par exemple, 5 % des utilisateurs qui dictent une demande par minute = 500 demandes / minute, chacune pouvant enchaîner plusieurs appels au modèle).

## Refaire les mesures

```bash
# 1. Comptes de test créés par l'API (opérateur → entreprises → équipes → clients, devis, missions)
API_URL=https://api.recette.exemple.fr PLATFORM_ADMIN_TOKEN=… ORGS=20 USERS_PER_ORG=100 \
  node infra/load/preparer-comptes.mjs > comptes.json

# 2. Journée type au rythme réel (un écran toutes les 15 à 45 s)
docker run --rm -i --network host -v "$PWD:/scripts" grafana/k6:1.3.0 run \
  -e API_URL=https://api.recette.exemple.fr -e COMPTES=/scripts/comptes.json \
  -e VUS=10000 -e MONTEE=10m -e PALIER=20m /scripts/infra/load/k6-journee.js
```

Seuils vérifiés automatiquement : moins de 1 % d'erreurs, p95 < 800 ms (accueil, planning), < 400 ms (notifications). À lancer depuis une ou plusieurs machines **distinctes** de l'infrastructure testée, sur un environnement de recette (jamais sur la production : le script crée des entreprises de test).

## À surveiller en production

- `/metrics` (Prometheus, protégé par `METRICS_TOKEN`) : `aussitot_http_request_duration_seconds` (latence par route et statut), `aussitot_realtime_connections`, `aussitot_assistant_in_flight`, métriques Node (mémoire, boucle d'évènements).
- `/ready` : base et Redis joignables (sonde du répartiteur) ; `/health` : processus vivant.
- PostgreSQL : connexions, requêtes lentes (`pg_stat_statements`), taille ; Redis : mémoire, files en attente (BullMQ).
- Alertes conseillées : p95 > 500 ms sur 5 min, taux d'erreur 5xx > 1 %, file d'emails qui grossit, sondes en échec.
