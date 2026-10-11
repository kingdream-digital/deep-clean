# Sécurité

Règle de base : **ne jamais faire confiance à l'application**. Tout ce qui compte est vérifié par l'API, puis par la base de données elle-même.

## Comptes et mots de passe

- **Aucune inscription publique.** Une entreprise cliente est ouverte par l'opérateur de la plateforme (`npm run platform -- create-org` ou `POST /v1/platform/organizations` avec un jeton dédié, comparé en temps constant ; sans jeton configuré, la route n'existe pas). Ensuite, seuls la RH et l'administrateur du compte créent des comptes.
- Personne ne choisit un rôle supérieur au sien, ni n'agit sur un compte de rang supérieur (`assignableRoles`, `canManageAccount`).
- Création ou réinitialisation d'accès : mot de passe **temporaire** affiché une seule fois à la RH, jamais stocké en clair ; l'utilisateur doit le remplacer à la première connexion (aucune autre route n'est accessible avant).
- Politique (recommandation CNIL) : 12 caractères mêlant au moins 3 types, ou phrase de passe de 16 caractères ; jamais le nom ou l'identifiant.
- Hachage **argon2id** (19 Mio, 2 itérations — paramètres recommandés par l'OWASP). La RH ne voit jamais un mot de passe et n'en a pas besoin pour réinitialiser un accès.
- Pour tout problème de connexion ou de compte, l'app oriente vers la RH.

## Sessions

- Jeton d'accès signé (JWT HS256, `JWT_SECRET`), **10 minutes**, gardé en mémoire par l'app.
- Jeton de renouvellement **à usage unique** (rotation à chaque utilisation). Un jeton déjà utilisé qui se représente = vol probable : **toute la famille de sessions est révoquée**.
- Web : jeton de renouvellement en cookie `httpOnly`, `Secure`, `SameSite=Strict`, inaccessible au JavaScript. C'est pourquoi l'app web et l'API doivent être deux sous-domaines du même domaine.
- Téléphone : trousseau sécurisé du système (Keychain / Keystore) seulement si « Rester connecté » est coché, sinon mémoire seule.
- Durées : 12 h sans « Rester connecté » (`SESSION_TTL_HOURS`), 30 jours avec (`REMEMBER_ME_TTL_DAYS`).
- À **chaque requête** : signature, expiration, session non révoquée, compte actif, entreprise active, rôle inchangé. L'état des sessions est mis en cache dans Redis (60 s) mais **invalidé immédiatement** par une déconnexion, une désactivation de compte ou un changement de mot de passe : l'accès est coupé sur toutes les instances à la requête suivante. Un changement de rôle oblige l'app à obtenir un nouveau jeton.

## Isolation des entreprises et permissions

- **Row-Level Security PostgreSQL `FORCE`** sur toutes les tables, rôle applicatif sans privilège : l'entreprise vient du jeton, et la base refuse toute ligne d'une autre entreprise, même en cas d'oubli dans le code (détails : [ARCHITECTURE.md](ARCHITECTURE.md#plusieurs-entreprises-une-seule-base)).
- Permissions : matrice unique ([packages/shared/src/permissions.ts](../packages/shared/src/permissions.ts)), vérifiée par chaque **service** de l'API (pas seulement par les routes). L'app ne s'en sert que pour masquer ce qui serait refusé.
- Propriété des données : un employé ne lit que ses missions ; un chef d'équipe n'agit que sur les siennes. Changer un identifiant dans une requête ne donne accès à rien de plus (testé dans `permissions.test.ts` et `tenancy.test.ts`).
- L'assistant n'a **jamais** plus de droits que la personne qui lui parle (voir [ASSISTANT.md](ASSISTANT.md)).

## Limites et protections

| Protection | Réglage par défaut |
| --- | --- |
| Débit général par utilisateur (ou adresse IP sans session) | 300 requêtes / minute (`RATE_LIMIT_PER_MINUTE`) |
| Tentatives de connexion par compte et par adresse IP | 20 / 15 min (`LOGIN_RATE_LIMIT_PER_15_MIN`) |
| Plafond de connexions par adresse IP, tous comptes confondus | 300 / 15 min (`LOGIN_IP_LIMIT_PER_15_MIN`) — une équipe derrière la même box doit pouvoir se connecter |
| Verrouillage d'un compte | 15 min après 5 échecs, quelle que soit l'adresse (journalisé) |
| Renouvellements de session | 120 / 15 min |
| Assistant | 20 demandes / minute / utilisateur, quota mensuel par entreprise |
| Création d'entreprises (opérateur) | 30 / heure |

Les compteurs sont dans Redis : ils valent pour toutes les instances. Derrière un proxy, `TRUST_PROXY=true` pour lire la vraie adresse des clients.

Autres mesures :

- Validation stricte de chaque entrée (schémas zod partagés) ; requêtes SQL paramétrées (Prisma) : pas d'injection.
- CORS limité aux origines déclarées (`CORS_ORIGINS`, obligatoire en production), méthodes explicites ; en-têtes de sécurité (helmet) ; HTTPS de bout en bout (Caddy, HSTS sur l'app web).
- Erreurs : messages simples en français ; une erreur inattendue renvoie un message neutre et un identifiant de requête, le détail reste dans le journal technique.
- Journal technique (pino) avec masquage à la source des mots de passe, jetons, cookies et en-têtes d'autorisation.
- `/metrics` (Prometheus) : en production, accessible seulement avec `METRICS_TOKEN`, sinon désactivé.
- Le démarrage échoue si la configuration est incomplète ou si un secret de développement est utilisé en production.

## Fichiers

- Aucun fichier privé n'a d'adresse publique : logos et PDF sont servis par l'API, après contrôle de la session et de l'entreprise ; en S3, le compartiment reste privé.
- Logo : 2 Mo au plus, PNG / JPEG / WebP seulement (SVG refusé : il peut contenir du script), **décodé puis réencodé** par le serveur (taille d'image plafonnée, métadonnées supprimées). Ce qui est stocké est toujours une image propre, jamais le fichier reçu.
- Emails : le logo est **intégré** au message (pièce jointe en ligne), pas chargé depuis une adresse publique.

## Traçabilité

Le journal d'activité (`activity_logs`) enregistre l'auteur, l'action, la date et l'élément concerné : connexions réussies et échouées, verrouillages, comptes créés / modifiés / désactivés / réactivés, accès réinitialisés, réglages et logo de l'entreprise, devis et factures (création, envoi, émission, paiement, avoir), missions (création, modification, annulation, démarrage, fin, validation). Les actions faites par l'assistant sont marquées comme telles. Consultable par l'administrateur, la direction et la RH.

## Secrets et données personnelles

- Aucun secret dans le code : variables d'environnement uniquement (`.env` jamais versionné ; modèles `*.example` sans valeur).
- À générer pour chaque installation : `JWT_SECRET`, `PLATFORM_ADMIN_TOKEN`, `METRICS_TOKEN`, mots de passe PostgreSQL (`openssl rand -base64 48`).
- Les demandes à l'assistant sont transmises à l'API Claude d'Anthropic pour être comprises : à mentionner dans la politique de confidentialité et le registre des traitements (RGPD), avec le sous-traitant.

## Points à traiter avant une mise en production réelle

- Politique de sécurité du contenu (CSP) pour l'app web servie par Caddy.
- Sauvegardes chiffrées et testées (voir [DEPLOIEMENT.md](DEPLOIEMENT.md#sauvegardes)), supervision et alertes.
- Audit de sécurité externe (test d'intrusion) avant la commercialisation.
- Double authentification pour les rôles administrateur et RH.
