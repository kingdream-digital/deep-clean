# Aussitôt — conventions de développement

Aussitôt est un logiciel de gestion **multi-entreprises** (SaaS) pour TPE et PME de services : devis, factures, planning, équipe, piloté à la voix ou par chat. Présentation : [README.md](README.md) ; état et suite du travail : [docs/REPRISE-SESSION.md](docs/REPRISE-SESSION.md).

## Périmètre

- Tout le code d'Aussitôt vit dans ce dossier `aussitot/`. **Ne jamais modifier le reste du dépôt** (application Deep Clean : `application/`, `docs/`, `site/`, `tools/`, `v1/`, `v2/`, fichiers racine) sans demande explicite : c'est une application en production.
- Interface, messages d'erreur, commentaires et documentation : **en français**, simples et compréhensibles par un non-technicien.

## Règles métier qui ne se négocient pas

- **Aucune inscription publique.** Une entreprise est ouverte par l'opérateur (`npm run platform -- create-org` / `POST /v1/platform/organizations`) ; ensuite seuls la RH et l'administrateur du compte créent des comptes. Message à afficher pour tout problème de compte : « Pour tout problème de connexion ou de compte, contactez la RH. »
- **Le serveur décide.** Chaque service vérifie la permission (`requirePermission`) et la propriété des données ; l'app ne fait que masquer ce qui serait refusé.
- **Matrice des permissions unique** : [packages/shared/src/permissions.ts](packages/shared/src/permissions.ts). Une nouvelle capacité = une permission ici, utilisée par l'API et l'app.
- **Isolation des entreprises par la base** : toute requête passe par `withTenant(orgId, …)` / `inTenant`. **Toute nouvelle table** reçoit `organization_id` (défaut `app_current_org()`), une politique RLS `tenant_isolation` et `FORCE ROW LEVEL SECURITY` **dans sa migration**, plus un test d'isolation.
- **Montants en centimes** (entiers) et taux en points de base ; calculs uniquement avec `packages/shared/src/money.ts`. Un total envoyé par l'app n'est jamais cru.
- **Dates dans le fuseau de l'entreprise** (`ctx.timezone`, helpers de `format.ts` / `time.ts`), jamais celui du serveur.
- **Documents transmis figés** : un devis envoyé, une facture émise gardent leurs coordonnées (et leur logo) d'origine ; numérotation continue sans trou (`number_sequences`).
- **Effets après validation** : notifications, emails, push passent par `AfterCommit` / l'outbox, jamais avant la fin de la transaction.
- **Notifications** : uniquement aux personnes concernées par le changement.
- **Assistant** : un outil appelle un **service existant** (jamais la base directement), déclare ses permissions, et `confirm: true` pour tout ce qui sort de l'entreprise ou engage légalement (envoi, émission, encaissement, annulation, planning d'autrui).
- **Aucun secret dans le code** ; nouvelle variable = schéma de [apps/api/src/config/env.ts](apps/api/src/config/env.ts) + `.env.example` + documentation.
- **Pas de faux boutons** : une action affichée fonctionne réellement, de bout en bout.

## Organisation

- API : `apps/api/src/modules/<domaine>/{*.routes.ts, *.service.ts}` — la route aiguille, le service décide. Socle commun dans `apps/api/src/lib`.
- App : écrans dans `apps/app/app` (expo-router), composants métier dans `apps/app/src/features`, système de design dans `apps/app/src/ui` et `apps/app/src/theme` (réutiliser `Screen`, `Card`, `Button`, `Text`, `PressableScale`… plutôt que des styles ad hoc).
- Partagé : `packages/shared` pour tout ce qui doit être identique côté API et app (schémas zod, formats, calculs, couleurs).

## Commandes

```bash
docker compose up -d                       # PostgreSQL, Redis, Mailpit, MinIO
npm run dev:api | dev:worker | dev:app     # développement
npm run typecheck                          # TypeScript strict partout
npm test                                   # shared, app, API (base aussitot_test)
npx prettier --check <fichiers>            # largeur 140, guillemets doubles
npm run db:migrate:dev -w @aussitot/api    # nouvelle migration (puis y ajouter la politique RLS)
```

## Avant de considérer une tâche terminée

1. `npm run typecheck` et `npm test` au vert ; un test pour chaque règle nouvelle, y compris les accès **interdits** (autre rôle, autre entreprise).
2. Vérification réelle dans l'application (web au minimum, téléphone et ordinateur, modes clair et sombre) pour toute modification d'interface.
3. Documentation à jour dans `docs/` si le comportement, la configuration ou le déploiement changent.
