# Publier Deep Clean sur l'App Store (Apple) et Google Play (Android)

> Dernière mise à jour : 9 octobre 2026. Les dossiers et fichiers cités sont dans
> `application/store/` (textes, visuels, pages web) et `application/mobile/`
> (configuration de l'app).

## En deux mots

**Ce qui est prêt** (rien n'a été cassé dans l'app) :

- la configuration Apple et Android (identifiants, permissions, chiffrement, confidentialité) ;
- les 8 captures d'écran de chaque store, l'icône, la bannière Google Play ;
- tous les textes des fiches (descriptions, mots-clés…) avec les limites de caractères contrôlées ;
- les réponses aux questionnaires de confidentialité d'Apple et de Google ;
- les 3 pages web exigées par les stores (confidentialité, assistance, suppression de compte) ;
- un contrôle automatique qui **bloque** l'envoi si l'adresse du serveur est fausse.

**Ce qu'il reste à faire, et que seul le propriétaire peut faire** : acheter un nom de
domaine, ouvrir les comptes Apple et Google (paiement, pièce d'identité / D-U-N-S),
créer le projet Firebase, puis lancer les commandes ci-dessous. Compter **1 à 3
semaines** au total, surtout à cause de l'ouverture des comptes (Apple et Google
vérifient l'identité de la société).

| # | Étape | Qui | Durée |
|---|---|---|---|
| 1 | Nom de domaine + HTTPS | Propriétaire (+ Claude) | 1 h + attente DNS |
| 2 | Comptes Apple, Google, Expo | Propriétaire | quelques jours à 2 semaines |
| 3 | Préparer l'ordinateur | Propriétaire / Claude | 10 min |
| 4 | Notifications push (Firebase) | Propriétaire | 30 min |
| 5 | Construire les apps | Propriétaire / Claude | 1 h (attente) |
| 6 | Envoyer + remplir les fiches | Propriétaire / Claude | 2 h |
| 7 | Choisir le mode de distribution | Propriétaire | 10 min |
| 8 | Validation, puis mise en ligne | Apple / Google | quelques heures à quelques jours |

Coûts : Apple 99 $/an · Google Play 25 $ (une seule fois) · nom de domaine ≈ 10–15 €/an ·
Expo (EAS) : l'offre gratuite suffit pour commencer (nombre de constructions limité par mois).

---

## Décisions déjà prises (à confirmer)

| Sujet | Choix | Pourquoi / comment changer |
|---|---|---|
| **Identifiant de l'app** | `fr.kingdream.deepclean` (iPhone **et** Android) | `com.deepclean.app` est **déjà pris sur Google Play** par une autre application (« ديب كلين »). Cet identifiant devient **définitif au premier envoi** : à changer maintenant ou jamais (2 lignes dans `app.json` : `ios.bundleIdentifier` et `android.package`) |
| Version | 1.0.0 | Les numéros de build sont gérés automatiquement par EAS |
| iPad | Désactivé (l'app tourne en mode iPhone sur iPad) | L'interface est faite pour téléphone ; une vraie version iPad demande une mise en page dédiée. Pour réactiver : `ios.supportsTablet: true` (et fournir des captures iPad) |
| Sauvegarde Android dans le cloud | Désactivée (`android.allowBackup: false`) | Évite que des données de l'entreprise (cache planning) partent dans le compte Google personnel de l'employé |
| Micro, position « toujours », « mouvement » | Retirés | L'app n'en a pas besoin : moins de permissions = fiche de confidentialité plus simple et moins de risque de refus |
| Titulaire des comptes | **Deep Clean** (l'entreprise) | L'app sert l'entreprise ; KingDream Digital est ajouté comme développeur. Évite un transfert d'app plus tard |
| Distribution iPhone | **Non répertoriée** (lien direct) | Voir étape 7 |

---

## Étape 1 — Un nom de domaine et HTTPS (indispensable)

**Pourquoi.** iPhone et Android **bloquent** les connexions `http://` non sécurisées.
L'adresse actuelle du serveur est en `http://…sslip.io` : une app installée depuis un
store **ne pourrait pas s'y connecter**. Les stores exigent aussi des pages web de
confidentialité en `https://`.

> L'ancienne adresse `deep-clean-app.onrender.com` (dans l'ancien `eas.json`) n'est plus
> la bonne : ce serveur ne contient plus les fonctions actuelles. Elle a été remplacée
> par une adresse provisoire `A-CONFIGURER.invalid`, qui **ne peut pas** fonctionner par
> erreur : le contrôle automatique refuse tout envoi tant qu'elle est là.

**À faire** (exemple avec le domaine `monentreprise.fr`) :

1. Acheter un nom de domaine (OVH, Gandi, Namecheap…).
2. Dans la zone DNS du domaine, créer **deux enregistrements de type A** vers l'adresse du
   serveur (`141.253.112.12`) : `api` et `app`.
3. Dans **Coolify** (`http://141.253.112.12:8000`) :
   - Backend → **Domains** → `https://api.monentreprise.fr` ;
   - Web → **Domains** → `https://app.monentreprise.fr` ;
   - Backend → **Environment Variables** → `CORS_ORIGINS` = `https://app.monentreprise.fr`
     (la valeur seule, sans `CORS_ORIGINS=`) ;
   - **Redeploy** le backend puis le web.
   Coolify obtient tout seul le certificat HTTPS gratuit (Let's Encrypt). Les ports 80 et
   443 sont déjà ouverts (voir `DEPLOYMENT.md`, §4).
4. Vérifier dans un navigateur : `https://api.monentreprise.fr/health` doit répondre
   `{"status":"ok"…}`, et `https://app.monentreprise.fr/politique-de-confidentialite.html`
   doit afficher la politique de confidentialité.
5. Demander à Claude : « l'adresse du serveur est `https://api.monentreprise.fr` » — il met
   à jour `eas.json` (profils `preview` et `production`) —, ou modifier soi-même la ligne
   `EXPO_PUBLIC_API_URL` dans `application/mobile/eas.json` :
   `"https://api.monentreprise.fr/api/v1"`.
6. Contrôler : `cd application/mobile && npm run verifier:publication -- --en-ligne`.

Les trois pages web (`politique-de-confidentialite.html`, `assistance.html`,
`suppression-de-compte.html`) sont dans `application/mobile/public/` : elles sont
**publiées automatiquement avec le site web de l'app**. Dans les fiches, remplacer
`https://VOTRE-DOMAINE/` par `https://app.monentreprise.fr/`.

> Dépannage provisoire seulement : demander un certificat HTTPS pour l'adresse `sslip.io`
> dans Coolify. Déconseillé en production (service partagé, limites de certificats).

## Étape 2 — Les comptes

1. **Apple Developer Program** — <https://developer.apple.com/programs/enroll/> — 99 $/an.
   Pour s'inscrire **au nom de la société**, Apple demande un **numéro D-U-N-S** (gratuit,
   à demander sur <https://developer.apple.com/enroll/duns-lookup/>, quelques jours à
   quelques semaines) et un site web de la société. Un compte personnel est possible mais
   l'app s'afficherait au nom de la personne.
2. **Google Play Console** — <https://play.google.com/console/signup> — 25 $ une fois.
   Compte **Organisation** (numéro D-U-N-S) recommandé : un compte **Personnel** créé après
   novembre 2023 impose d'abord un **test fermé de 12 testeurs pendant 14 jours** avant de
   publier en production.
3. **Expo (EAS)** — <https://expo.dev/signup> — gratuit. C'est lui qui construit les apps
   dans le cloud, **y compris la version iPhone depuis Windows**.

Ne donner à personne le mot de passe de ces comptes. Activer la double authentification.

## Étape 3 — Préparer l'ordinateur (une seule fois)

Il faut Node.js 20 ou plus. Dans un terminal (Git Bash sous Windows) :

```bash
cd application/mobile
npm install
npx eas-cli login      # compte Expo
npx eas-cli init       # relie le projet à votre compte Expo (écrit extra.eas.projectId dans app.json)
```

Commiter ensuite la modification de `app.json` (le `projectId` n'est pas secret).

## Étape 4 — Notifications push

- **iPhone** : rien à faire à la main. Au premier build iOS, EAS propose de créer la clé
  de notifications Apple : répondre **Oui**.
- **Android** : les notifications passent par **Firebase** (gratuit).
  1. <https://console.firebase.google.com> → *Ajouter un projet* → « Deep Clean ».
  2. Dans le projet → *Ajouter une application Android* → nom du paquet
     **`fr.kingdream.deepclean`** → télécharger **`google-services.json`**.
  3. Le placer dans `application/mobile/` (à côté de `app.json`) et le commiter : il ne
     contient que des identifiants publics, et il est **pris en compte automatiquement**
     (`app.config.js`).
  4. Firebase → ⚙ *Paramètres du projet* → *Comptes de service* → *Générer une nouvelle clé
     privée* (fichier `.json`). **Secret : ne jamais le commiter** (le `.gitignore` bloque
     déjà les noms usuels).
  5. `npx eas-cli credentials` → *Android* → *production* → *Google Service Account* →
     *Manage your Google Service Account Key for Push Notifications (FCM V1)* → *Set up…* →
     *Upload a new service account key*.
  6. Dans Google Cloud (IAM), donner à ce compte de service le rôle
     **Firebase Cloud Messaging API Admin**.

Tant que `google-services.json` manque, le contrôle affiche un avertissement : l'app
fonctionne, mais **les notifications push Android ne partiront pas** (le centre de
notifications dans l'app reste utilisable).

## Étape 5 — Construire les apps

```bash
cd application/mobile
npm run verifier:publication -- --en-ligne     # doit afficher « Prêt pour les stores »
npx eas-cli build --platform android --profile production    # fichier .aab (Google Play)
npx eas-cli build --platform ios --profile production        # fichier .ipa (App Store)
```

- Le contrôle est **aussi lancé automatiquement** par EAS au début de chaque build `preview`
  et `production` : si l'adresse du serveur est fausse, le build s'arrête avec une
  explication claire.
- **iPhone, premier build** : EAS demande l'identifiant Apple et le code de double
  authentification, puis crée seul les certificats et le profil. Accepter les propositions.
- **Android, premier build** : EAS crée la clé de signature et la **garde**. Ne rien faire.
- Chaque build dure 15 à 40 minutes ; la progression se suit sur <https://expo.dev>.
- Pour tester sans passer par un store : `--profile preview` (Android : un fichier `.apk`
  à installer directement). Pour l'iPhone, préférer **TestFlight** (étape 6).

## Étape 6 — Envoyer les apps et remplir les fiches

### Google Play

1. Play Console → *Créer une application* : nom **Deep Clean**, langue **Français**,
   type **Application**, **Gratuite**.
2. Remplir la fiche avec `store/google-play/fiche-google-play.md`, téléverser les visuels de
   `store/visuels/` (icône 512, bannière, 8 captures téléphone).
3. Remplir *Contenu de l'application* avec `store/google-play/notes-pour-google.md` et
   *Sécurité des données* avec `store/google-play/securite-des-donnees.md`.
4. Envoyer le fichier : soit
   `npx eas-cli submit --platform android --profile production`
   (demande une *clé de compte de service Google* : guide <https://expo.fyi/creating-google-service-account>),
   soit déposer à la main le fichier `.aab` (récupérable sur expo.dev) dans *Tests → Test interne*.
   Le profil d'envoi est réglé sur la piste **Test interne**, en **brouillon** : rien n'est publié sans vous.

### App Store (Apple)

1. App Store Connect → *Apps* → **+** → *Nouvelle app* : plateforme iOS, nom **Deep Clean**,
   langue principale **Français (France)**, identifiant de bundle **`fr.kingdream.deepclean`**,
   SKU `deepclean-ios`.
2. `npx eas-cli submit --platform ios --profile production` (demande l'identifiant Apple ;
   l'identifiant de l'app `ascAppId` se lit dans App Store Connect → *Informations sur l'app*).
   Le build apparaît dans **TestFlight** après environ 15 minutes : **l'installer sur de
   vrais iPhone et tout essayer** (connexion, pointage, photo, notifications).
3. Remplir la fiche avec `store/apple/fiche-app-store.md`, téléverser les captures
   `store/visuels/apple/iphone-6.9-pouces/` et l'icône (déjà dans l'app).
4. *Confidentialité de l'app* : `store/apple/confidentialite-app-store.md`.
5. *Informations de validation* : `store/apple/notes-pour-apple.md` (compte de démonstration
   obligatoire).
6. Choisir **publication manuelle**, puis *Envoyer pour validation*.

## Étape 7 — Mode de distribution

- **iPhone : « Non répertoriée »** (recommandé). L'app n'apparaît ni dans la recherche ni
  dans les classements ; les salariés l'installent avec un **lien direct**. Procédure
  d'Apple : soumettre d'abord l'app à la validation, **mentionner dans les notes de
  validation** qu'elle est destinée à une distribution non répertoriée (déjà écrit dans
  `notes-pour-apple.md`), puis envoyer la demande
  <https://developer.apple.com/support/unlisted-app-distribution/>. Apple génère ensuite le lien.
  Apple conseille de prévoir dans l'app un moyen d'empêcher un usage non autorisé : ici,
  **sans compte créé par la RH, on ne peut rien faire dans l'app**.
- **Android** : *Test interne* pour démarrer (jusqu'à 100 personnes, immédiat), puis
  *Production* quand tout est bon. Là aussi, sans compte RH, l'app est inutilisable.

## Étape 8 — Après la validation

1. Publier l'app (Apple : bouton *Publier cette version* ; Google : *Production* → *Publier*).
2. **Supprimer ou désactiver les comptes de démonstration** donnés aux relecteurs.
3. **Vider la base de démonstration** si elle est encore chargée sur le serveur
   (`DEPLOYMENT.md`, §3 bis) : ses comptes ont un mot de passe public.
4. Donner aux salariés le lien de l'app et leur identifiant (créé par la RH).

### Mises à jour ensuite

- Modification **visible** de l'app : augmenter `version` dans `app.json` (1.0.1…), refaire
  `eas build` puis `eas submit` pour les deux stores. Le numéro de build se gère seul.
- Modification du **serveur seulement** : redéployer dans Coolify, rien à renvoyer aux stores.
- Ajouter une fonction qui change les données collectées (statistiques, publicité…) :
  **mettre d'abord à jour** les déclarations de confidentialité (Apple et Google).

---

## Les risques de refus, et ce qui les prévient

| Risque | Prévention |
|---|---|
| App qui ne se connecte pas (serveur en `http://`, éteint, mauvais compte de démo) | Contrôle automatique de l'adresse en HTTPS ; vérifier `/health` avant d'envoyer ; comptes dédiés à la revue |
| **Suppression de compte** (règle Apple 5.1.1(v), politique de Google) | Page `suppression-de-compte.html` + explication dans les notes de validation. **Point à surveiller** : Apple peut exiger un bouton dans l'app. Si c'est le cas, demander à Claude d'ajouter « Demander la suppression de mon compte » (prévient la RH) |
| Permissions sans explication, ou en trop | Textes en français pour caméra, photos, position, Face ID ; micro, position permanente et mouvement retirés |
| Fiche incomplète (URL manquante, texte provisoire) | Remplacer `VOTRE-DOMAINE` partout avant d'envoyer ; aucune zone « à remplir » dans les pages publiques |
| Déclarations de confidentialité inexactes | `confidentialite-app-store.md` et `securite-des-donnees.md` reflètent le schéma réel de la base ; à relire avec la RH |
| Identifiant déjà pris | `fr.kingdream.deepclean` vérifié libre sur Google Play et l'App Store le 9 octobre 2026 |
| Contenu qui ne ressemble pas à l'app | Les captures sont de **vrais écrans de l'application** (jeu de démonstration, initiales à la place des portraits) |

À faire relire par la RH / un juriste avant publication : la **politique de confidentialité**
(`mobile/public/politique-de-confidentialite.html`) et les réponses de confidentialité des stores.

---

## Ce qui a été modifié dans le code (pour mémoire)

| Fichier | Changement |
|---|---|
| `mobile/app.json` | Version 1.0.0 ; nouvel identifiant `fr.kingdream.deepclean` ; déclaration de chiffrement ; manifeste de confidentialité Apple ; micro / position permanente / mouvement retirés ; permission « afficher par-dessus » retirée ; sauvegarde cloud Android coupée ; mode iPad natif désactivé |
| `mobile/eas.json` | Adresses de serveur `preview` / `production` remplacées par un espace réservé qui fait échouer le contrôle ; envoi Android en Test interne, brouillon |
| `mobile/app.config.js` | **Nouveau** — branche `google-services.json` s'il existe (sinon ne change rien) |
| `mobile/scripts/verifier-publication.js` | **Nouveau** — contrôle avant publication (`npm run verifier:publication`), lancé aussi par EAS (`eas-build-post-install`) |
| `mobile/public/*.html` | **Nouveau** — confidentialité, assistance, suppression de compte, publiées avec le site web |
| `store/` | **Nouveau** — textes, visuels, questionnaires |
| `tools/audit-visuel/captures-stores.mjs`, `composer-visuels-stores.py` | **Nouveau** — pour refaire les visuels |

Aucun fichier de `mobile/src/` (le code de l'app) n'a été modifié.
