# Publication sur l'App Store et Google Play — dossier complet

Tout ce qu'il faut pour publier **Deep Clean** sur iPhone (App Store) et
Android (Google Play) : comptes à créer, textes à copier-coller, captures,
réponses aux questionnaires, puis commandes de build et d'envoi.

Les éléments encore à fournir sont repérés par **⚠️ À FOURNIR**.

---

## 0. Récapitulatif

| | |
|---|---|
| Nom de l'app | **Deep Clean** |
| Éditeur (compte développeur) | **Boris Corsiez** — KingDream Digital, micro-entreprise, SIRET 102 486 677 00010 (compte développeur **personnel**, déjà créé chez Apple). Nom affiché sur les stores : celui du compte. |
| Titulaire du nom et du logo | **DEEP CLEAN**, SAS au capital de 600 € — 21 boulevard de la Plaine, 04100 Manosque — SIREN 942 773 375 — RCS Manosque — TVA FR54942773375 — président : Romain Chris Kada-Junior FEDI — deepclean.contact.pro@gmail.com, 06 81 70 07 51. L'application, développée sur mesure pour elle, lui est mise à disposition sous licence ; elle reste la propriété de l'éditeur. |
| Identifiant iOS (Bundle ID) | `fr.deepclean.app` |
| Nom de paquet Android | `fr.deepclean.app` |
| Version | 1.0.0 (le numéro de build s'incrémente tout seul) |
| Langue | Français |
| Domaine | `deep-clean.fr` |
| API (serveur) | `https://api.deep-clean.fr/api/v1` |
| Application web | `https://app.deep-clean.fr` |
| Politique de confidentialité | `https://app.deep-clean.fr/confidentialite.html` |
| Assistance | `https://app.deep-clean.fr/support.html` |
| Suppression de compte | `https://app.deep-clean.fr/suppression-compte.html` |
| Site de l'entreprise | `https://deep-clean.fr` — site officiel « La Plongée » (dossier `v2/` de ce dépôt), **pas encore en ligne** : voir §1 bis |
| Email de contact des stores (éditeur) | kingdreamdigital@gmail.com |
| Contact de l'entreprise cliente | deepclean.contact.pro@gmail.com · 06 81 70 07 51 |

> L'identifiant `fr.deepclean.app` reprend le domaine de l'entreprise. Il
> remplace `com.deepclean.app`, qui risquait d'être déjà pris par une autre
> application « Deep Clean ». Il ne pourra plus être changé après la
> première publication.

---

## 1. Avant tout : le domaine et le serveur

Les applications publiées appellent `https://api.deep-clean.fr`. Il faut
donc que cette adresse fonctionne **avant** le premier build store.

1. Chez **BookMyName** (fournisseur du domaine), créer deux enregistrements
   DNS de type **A** :
   - `api.deep-clean.fr` → `141.253.112.12`
   - `app.deep-clean.fr` → `141.253.112.12`
2. Dans Coolify :
   - Backend → **Domains** : `https://api.deep-clean.fr`
   - Web → **Domains** : `https://app.deep-clean.fr`
   - Coolify génère seul les certificats HTTPS (Let's Encrypt).
3. Variables d'environnement :
   - Backend : `CORS_ORIGINS` doit contenir `https://app.deep-clean.fr`.
   - Web : `EXPO_PUBLIC_API_URL=https://api.deep-clean.fr/api/v1`
     (cochée « Buildtime »).
4. Redéployer les deux, puis vérifier dans un navigateur :
   - `https://app.deep-clean.fr` affiche l'écran de connexion ;
   - `https://app.deep-clean.fr/confidentialite.html` affiche la politique.

Détail dans `docs/DEPLOYMENT.md`, section « Nom de domaine ».

---

## 1 bis. Avant l'envoi de CETTE version : serveur à jour et site réparé

Les apps iPhone/Android appellent le serveur de production : ce qui est
nouveau dans l'app doit y être **avant** l'envoi à Apple, sinon le
vérificateur tombe sur des erreurs (règle 2.1).

1. **Fusionner** la branche `claude/deep-clean-app-store-audit-fc4cfh` dans
   `master` (Coolify déploie `master`).
2. **Backend** : Coolify → Redeploy, puis dans son Terminal :
   ```
   npx prisma db push
   ```
   Changements de schéma de cette version, **tous sans perte de données** :
   tables `user_blocks` et `message_reports` (messagerie : blocage et
   signalement), colonne `users.deletionRequestedAt` (suppression de compte
   depuis l'app), `prospects.createdById` facultatif (demandes de devis de
   l'espace public).
3. **Web** : Redeploy (pages légales mises à jour, espace public).
4. Vérifier dans un navigateur :
   - `https://app.deep-clean.fr/confidentialite.html` (mentionne les demandes
     de devis) ;
   - sur `https://app.deep-clean.fr`, l'accueil public s'affiche en premier
     (logo, services, « Demander un devis gratuit ») et « Espace équipe »,
     en bas du menu et de la page, mène à la connexion.
5. **Site officiel `https://deep-clean.fr`** : c'est la version « La
   Plongée » (dossier `v2/` de ce dépôt, celle dont l'espace « Découvrir » de
   l'app reprend les textes et les photos). Il n'est **pas encore en ligne** :
   le nom de domaine pointe déjà vers le serveur (on y voit pour l'instant le
   certificat par défaut de Traefik et une erreur 503). Pour le publier :
   dans Coolify, créer une application statique servant le dossier `v2/`,
   avec les domaines `https://deep-clean.fr` et `https://www.deep-clean.fr`
   (certificat automatique). Au passage, dans `v2/index.html`, les adresses
   canonique et de partage (`rel="canonical"`, `og:url`) pointent encore vers
   l'aperçu `https://kingdream-digital.github.io/deep-clean/v2/` : les
   remplacer par `https://deep-clean.fr/`.
   Une fois en ligne, ajouter `https://deep-clean.fr` comme URL marketing dans
   App Store Connect ; d'ici là, laisser ce champ vide (l'app et les pages
   légales n'y renvoient pas).

## 2. Comptes à créer (au nom de Boris Corsiez)

L'application est publiée sur **votre** compte développeur, en tant que
personne physique (micro-entreprise). Pas besoin de numéro D-U-N-S.

1. **Apple Developer Program**, inscription **individuelle** (99 €/an) :
   developer.apple.com/programs/enroll, avec votre identifiant Apple et une
   pièce d'identité.
   - Le nom affiché sous l'app sur l'App Store sera **« Boris Corsiez »**.
   - Le nom de la micro-entreprise ne peut pas remplacer le nom personnel
     sans D-U-N-S et statut de société.
2. **Google Play Console**, compte **personnel** (25 $ une fois) :
   play.google.com/console, avec vérification d'identité.
   - ⚠️ Règle Google pour les comptes personnels récents : avant de publier,
     l'app doit passer **14 jours en test fermé avec au moins 12 testeurs**
     inscrits sans interruption.
   - Solution simple : inviter 12 salariés (ou plus) de Deep Clean comme
     testeurs, avec l'adresse Gmail de leur téléphone Android.
3. **Expo** (gratuit) : votre compte existant **`boby13`** (déjà utilisé avec Expo Go pour les tests du 26/09) lance les builds (`eas login`). Le projet n'est encore relié à aucun projet EAS : `eas init` le fera au premier build.
4. **Firebase** (gratuit), pour les notifications Android : voir §8.

### Droits sur le nom et le logo « Deep Clean »

Le nom et le logo appartiennent à la société DEEP CLEAN, et le compte
développeur est à un autre nom. Apple (règle 5.2.1) et Google peuvent donc
demander une preuve que vous avez le droit de les utiliser.

Préparez avant l'envoi une **autorisation écrite signée par le président de
DEEP CLEAN** :
- elle vous autorise, vous et KingDream Digital, à publier l'application
  sous le nom et le logo Deep Clean, dans le cadre du contrat de licence ;
- elle est à joindre en pièce jointe dans App Store Connect
  (« Informations de vérification ») et à garder sous la main pour Google.

## 3. Positionnement et distribution : publique, sur l'App Store

Objectif : l'app est trouvable et téléchargeable par tout le monde en
cherchant « Deep Clean » dans l'App Store (et Google Play). Pas de lien non
listé, pas d'Apple Business Manager.

### Ce que l'app est, et comment la présenter (honnêtement)

**Deep Clean est l'application officielle de DEEP CLEAN**, entreprise de
nettoyage et de conciergerie de Manosque. Elle a deux publics :

1. **Le grand public** (particuliers et entreprises de la région), **sans
   compte** : l'app **s'ouvre sur l'accueil public**, dans l'ambiance de la
   marque (l'eau, le marine, le logo officiel). Simple et direct : « Que
   pouvons-nous faire pour vous ? », un service par tuile (chacun a sa page :
   ce que c'est, pour qui, ce que ça comprend, la méthode) et un bouton
   « Demander un devis gratuit » toujours visible ; « Comment ça marche » en
   trois étapes, « Intervenez-vous chez moi ? » (code postal), quelques
   questions. Le menu reprend tous les services et, tout en bas, « Espace
   équipe ». La demande de devis (service, description facultative,
   coordonnées) arrive dans les prospects du module commercial ; la
   direction, la RH et l'admin technique en sont notifiés.
2. **Les équipes de DEEP CLEAN** (salariés, chefs d'équipe, superviseurs, RH,
   direction), avec les identifiants remis par la RH : planning, missions,
   pointage, signalements, messagerie, RH, devis et factures.

Elle est **développée sur mesure et publiée par Boris Corsiez (KingDream
Digital)**, sous licence de DEEP CLEAN, titulaire du nom et du logo, qui
l'autorise par écrit (§2 et annexe).

### Les trois règles Apple qui comptent ici, et comment le dossier y répond

| Règle | Ce qu'elle dit | Réponse du dossier |
|---|---|---|
| **5.2.1** Propriété intellectuelle | « Apps should be submitted by the person or legal entity that owns **or has licensed** the intellectual property. » | Boris Corsiez publie **sous licence** de DEEP CLEAN : autorisation écrite signée, jointe dans App Store Connect. |
| **4.2.6** Applis générées par un service | Les prestataires ne doivent pas soumettre, au nom de leurs clients, des applis issues d'un modèle commercialisé. | L'app n'est **pas** un modèle en marque blanche : elle est développée sur mesure pour DEEP CLEAN, avec son contenu. **Ne jamais écrire** dans la fiche ni la note « louée à des entreprises clientes », « premier client », « plateforme pour toutes les entreprises de nettoyage ». |
| **3.2** Audience | Apple oriente les applis réservées aux salariés d'une seule entreprise vers la distribution privée. | L'app **s'ouvre sur un accueil public utilisable sans compte** (services, une page par service, devis, zone d'intervention) ; la connexion du personnel n'est qu'une entrée « Espace équipe » en bas du menu. C'est l'app d'une entreprise locale pour ses clients **et** ses équipes. |

**Risque résiduel, dit franchement :** la décision reste celle du
vérificateur. Si Apple propose malgré tout la distribution privée (règle 3.2),
répondre dans le Resolution Center avec le texte du §12 (le volet public,
l'utilisation sur les téléphones personnels des salariés, la licence). En
cas de refus maintenu, un appel est possible auprès de l'App Review Board.

### Google Play

Publication publique en production, après le test fermé de 14 jours exigé
pour un compte personnel (§2).

### Nom de l'app

Le nom doit être unique sur chaque store. Si « Deep Clean » est déjà pris,
utiliser **« Deep Clean Manosque »** (sans tiret ni mot générique). Le nom
affiché sous l'icône du téléphone reste « Deep Clean ».

## 4. Textes de la fiche App Store (à copier-coller)

Aucun de ces textes ne contient « interne », « réservé », « location » ni de
promesse de fonction future (règle 2.3.7 et 2.3.1).

**Nom** (30 max) : `Deep Clean`

**Sous-titre** (30 max) : `Nettoyage, devis et planning`

**Texte promotionnel** (170 max) :
```
Le propre, en profondeur : nettoyage, entretien et conciergerie à Manosque. Devis gratuit en quelques instants. Équipes : planning, missions et pointage.
```

**Description** (4000 max) :
```
Deep Clean, c'est l'application officielle de DEEP CLEAN, entreprise de nettoyage, d'entretien et de conciergerie à Manosque et alentours. Le propre, en profondeur.

POUR NOS CLIENTS — SANS COMPTE
• Découvrez nos prestations : nettoyage en profondeur, entretien régulier, bureaux et espaces professionnels, conciergerie, et nos soins spécifiques (canapés et fauteuils, matelas, textiles, sols et vitres)
• Chaque service détaillé, et notre méthode en quatre étapes : diagnostic, protocole adapté, exécution soignée, contrôle qualité
• Notre zone d'intervention : Manosque, Forcalquier, Volx, Pierrevert, Gréoux-les-Bains, Sainte-Tulle et alentours
• Demandez un devis gratuit en quelques instants (particulier, professionnel ou propriétaire) : nous revenons vers vous sous 24 à 48 h

POUR LES ÉQUIPES DEEP CLEAN
Votre compte est créé par le service RH, qui vous remet vos identifiants (pas d'inscription dans l'application).
• Planning du jour et de la semaine, missions à venir et terminées
• Adresse du chantier et itinéraire, consignes et fiche de poste de chaque mission
• Pointage de l'arrivée et du départ, avec photo et position comme justificatif
• Signalement d'un problème sur chantier, avec photos
• Notification dès qu'une mission est créée, modifiée ou annulée
• Messagerie d'équipe, avec signalement d'un message à la RH et blocage d'un contact
• Heures du mois, congés, absences et documents

POUR LES RESPONSABLES
• Planning et affectation des équipes, validation des missions et des heures
• Fiches chantier : équipe, consignes, photos, problèmes, historique
• Devis avec signature du client sur place, factures, demandes de devis reçues
• Gestion des comptes, statistiques et vue d'ensemble de l'activité

SÉCURITÉ ET CONFIDENTIALITÉ
Chacun ne voit que ce qui le concerne, contrôlé par le serveur. Mots de passe chiffrés, connexions sécurisées, reconnexion par Face ID. La position n'est utilisée qu'au moment du pointage, jamais en arrière-plan. Suppression du compte possible directement depuis l'application.

Un problème de connexion ? Contactez le service RH de DEEP CLEAN.
```

**Mots-clés** (100 max, séparés par des virgules, sans espace) :
`nettoyage,ménage,conciergerie,manosque,devis,planning,pointage,chantier,équipe,entretien,vitres`

**Nouveautés de la version** : `Première version de Deep Clean.`

**Catégories** : Économie et entreprise (principale), Style de vie
(secondaire — le volet public s'adresse aux particuliers).

**URL** :
- Assistance : `https://app.deep-clean.fr/support.html`
- Confidentialité : `https://app.deep-clean.fr/confidentialite.html`
- Marketing (facultative) : `https://deep-clean.fr` **seulement une fois le
  site réparé** (§1 bis) — sinon laisser vide.

**Copyright** : `2026 Boris Corsiez — KingDream Digital`

**Classification par âge** : aucun contenu sensible ; « Messagerie ou
discussion entre utilisateurs » : Oui (collègues, avec signalement et
blocage) ; « Accès web non restreint » : Non ; publicité : Non.

## 5. Visuels App Store

| Fichier | Usage |
|---|---|
| `application/mobile/assets/icon.png` | Icône (1024 × 1024, sans transparence) — médaillon officiel |
| `application/presentation/store/ios-*.png` | Captures iPhone 6,9" (1290 × 2796) |
| `application/presentation/store/android-*.png` | Captures Google Play (1080 × 2160) |
| `application/presentation/store/google-banniere-1024x500.png` | Bannière Google Play (l'App Store n'a pas de bannière) |
| `application/presentation/store/google-icone-512.png` | Icône Google Play |

Ordre d'import (identique sur les deux stores) :
1. `01-decouvrir` — Découvrez nos prestations (espace public)
2. `02-devis` — Votre devis en quelques instants (espace public)
3. `03-accueil-employe` — Votre journée en un coup d'œil
4. `04-planning` — Le planning de la semaine
5. `05-mission` — Consignes et fiche de poste
6. `06-messagerie` — Toute l'équipe, au même endroit
7. `07-statistiques` — Pilotez l'activité (compte Direction)

Elles se refont à l'identique avec `tools/store-screenshots/` (README).

Règles suivies pour les captures (règle 2.3.3) :
- elles montrent l'app **en usage**, sur des données de démonstration
  cohérentes — jamais de vraies données, jamais de vraies personnes ;
- la première capture n'est **pas** l'écran de connexion : c'est l'accueil
  public, premier écran de l'app ;
- **aucun prix ni aucune remise** dans les captures, le nom ou le sous-titre
  (règle 2.3.7) ;
- chaque écran montré est accessible avec les comptes de démo du §6 ;
- fond et titres aux couleurs de la charte (marine `#1F2D69`, bleu
  `#2A4F8E`, bleu goutte `#1E9CC6`).

L'app iPhone est configurée **sans version iPad dédiée**
(`supportsTablet: false`) : Apple n'exige pas de captures iPad.

## 6. Comptes de démonstration pour la vérification

Apple et Google doivent pouvoir tout tester. Sur le **serveur de
production**, la RH crée :

1. Un chantier « Chantier de démonstration », à une adresse de bureau (pas
   chez un vrai client), avec une position de référence.
2. Un compte **Employé** « Revue Stores », affecté à des missions sur ce
   chantier **chaque jour de la période de vérification** (aujourd'hui et
   les 10 jours suivants, dont une mission en cours aux heures de bureau
   américaines, soit l'après-midi et le soir en France).
3. Un compte **Superviseur** « Revue Stores Superviseur ».
4. Un compte **Direction** « Revue Stores Direction » (pour l'accueil
   direction, les statistiques et les factures montrés dans les captures).

Pour chacun : changer le mot de passe temporaire (sinon l'app demande d'en
définir un), puis noter identifiant et mot de passe dans App Store Connect →
« Informations de vérification de l'app » (et Play Console → « Accès aux
applications »). Ces comptes restent actifs tant que l'app est publiée.

Le jour de l'envoi : **mode maintenance désactivé** (`MAINTENANCE_MODE=false`)
et serveur à jour (§1 bis), sinon la vérification échoue (règle 2.1).

**Note pour les vérificateurs** (en anglais, à coller telle quelle, en
remplaçant les identifiants) :
```
Deep Clean is the official app of DEEP CLEAN, a cleaning and concierge company in Manosque, France. The app is in French.

It has two audiences:
1) The general public, WITHOUT any account: the app opens on the company's public home. It presents every service as a tile; each opens its own page (what it is, who it is for, what it includes, the company's method) with a "Demander un devis gratuit" button. The quote request (service, optional description, contact details) goes to the company's sales team; feel free to send a test request. The home also explains how a request works, checks instantly whether a town is in the service area ("Intervenez-vous chez moi ?", e.g. postal code 04100) and answers common questions.
Staff sign in through "Espace équipe", at the bottom of the menu and of the home page.
2) DEEP CLEAN's staff (employees, team leaders, supervisors, HR, management), with credentials provided by the company's HR department. There is no public sign-up by design: staff accounts are created by HR. Employees use the app on their personal iPhones.

The app was custom-built for DEEP CLEAN and is published by Boris Corsiez (KingDream Digital) under a license from DEEP CLEAN SAS (SIREN 942 773 375), which owns the "Deep Clean" name and logo. The written authorization signed by the company's president is attached.

Demo accounts (staff area):
- Employee: <identifiant> / <mot de passe> — today's missions, schedule, clock-in/out, problem reporting, notifications, messaging.
- Supervisor: <identifiant> / <mot de passe> — schedule management, validation of missions and timesheets.
- Management: <identifiant> / <mot de passe> — company overview, statistics, quotes and invoices, and the quote requests sent from the public home (Commercial > Prospects).

Privacy and safety:
- Camera and location are requested only when the user clocks in or out, as proof of presence on the job site (and when a manager records a job site's location). Location is never used in the background.
- Face ID is optional, for quick re-login.
- Messaging: long-press any message to report it to HR (HR and the admin are notified immediately and can deactivate the author's account); any user can block a contact from the contact's profile.
- Account deletion: Menu > Profil > "Supprimer mon compte" (password confirmation; the account is deactivated immediately and HR deletes the data within one month, except data the employer must legally retain).
- Privacy policy: https://app.deep-clean.fr/confidentialite.html
```

## 7. Questionnaires de confidentialité

Réponses alignées sur ce que l'application fait réellement (voir la
politique de confidentialité).

### Apple — « Confidentialité de l'app »

- **Suivi (tracking)** : **Non**. Aucune publicité, aucun outil d'analyse
  tiers, aucune donnée partagée avec des courtiers.
- Toutes les données ci-dessous sont **liées à l'identité** de la personne
  et utilisées pour les **fonctionnalités de l'app** uniquement :

| Catégorie Apple | Donnée | Pourquoi |
|---|---|---|
| Coordonnées | Nom, adresse email, numéro de téléphone, adresse physique | Comptes des collaborateurs ; demandes de devis (code postal, commune) |
| Santé et forme | Santé | Absences pour arrêt maladie ou accident du travail (gestion RH) |
| Informations financières | Autres informations financières | Bulletins de paie déposés dans les documents du salarié |
| Localisation | Localisation précise | Au pointage uniquement |
| Contenu de l'utilisateur | Photos ou vidéos ; Autre contenu de l'utilisateur | Photos de pointage, signalements, messages, documents, signalements de messages |
| Identifiants | Identifiant de l'utilisateur ; Identifiant de l'appareil | Compte ; jeton de notification push |
| Données d'utilisation | Interactions avec le produit | Journal de sécurité des actions importantes |

- **Non collectées** : contacts, historique de navigation, historique de
  recherche, achats, données de diagnostic, informations sensibles.

### Google — « Sécurité des données »

- Collecte de données : **Oui**. Partage avec des tiers : **Non** (les
  prestataires techniques — hébergement, notifications — ne comptent pas
  comme un partage).
- Chiffrement en transit : **Oui**. Suppression possible : **Oui**, dans
  l'app (Profil → Supprimer mon compte) et à
  `https://app.deep-clean.fr/suppression-compte.html`.
- Données collectées, toutes pour les **fonctionnalités de l'app** et la
  **gestion du compte** :

| Type | Obligatoire ? |
|---|---|
| Infos personnelles : nom, email, ID utilisateur, téléphone, adresse | Oui |
| Infos financières : autres (bulletins de paie) | Facultatif |
| Santé et remise en forme : infos de santé (arrêts, accidents du travail) | Facultatif |
| Position : position exacte | Oui (pointage) |
| Photos et vidéos : photos | Oui (pointage), facultatif sinon |
| Fichiers et documents | Facultatif |
| Messages : autres messages intégrés à l'appli | Facultatif |
| Activité dans l'appli : autres actions | Oui (journal de sécurité) |
| Identifiants de l'appareil (notifications) | Facultatif |

### Autres réponses

- **Chiffrement (export)** : chiffrement standard (HTTPS) uniquement, déjà
  déclaré dans l'app (`ITSAppUsesNonExemptEncryption: false`).
- **Manifeste de confidentialité iOS** : généré au build depuis `app.json`
  (`ios.privacyManifests`) ; les modules natifs fournissent le leur.
- **Public cible (Google)** : 18 ans et plus.
- **Publicités** : Non. **Appli gouvernementale / santé / finance** : Non.

---

## 8. Notifications sur Android (Firebase) — ⚠️ À FAIRE

Sur Android, les notifications passent par Firebase Cloud Messaging. Sans
cette étape, l'app Android fonctionne mais ne reçoit **aucune**
notification.

1. Sur console.firebase.google.com, créer un projet « Deep Clean ».
2. Ajouter une app Android avec le nom de paquet `fr.deepclean.app`, puis
   télécharger `google-services.json`.
3. Le transmettre à KingDream Digital, qui l'ajoute au projet
   (`android.googleServicesFile` dans `app.json`).
4. Dans Firebase :
   - Paramètres du projet → Comptes de service → générer une clé privée ;
   - envoyer cette clé dans Expo avec `eas credentials`, sur Android, en
     choisissant « FCM V1 ».

Sur iPhone, la clé de notifications Apple est créée automatiquement par
`eas build` à la première compilation.

---

## 9. Compiler et envoyer

Depuis `application/mobile` :

```bash
npm install -g eas-cli
eas login                      # compte Expo
eas init                       # première fois : relie le projet à Expo

# Compilations store (dans le cloud Expo, ~15-30 min chacune)
eas build --platform ios --profile production
eas build --platform android --profile production

# Envoi aux stores
eas submit --platform ios --profile production       # vers App Store Connect
eas submit --platform android --profile production   # vers la Play Console
```

- Au premier `eas build` iOS, se connecter avec le compte Apple Developer :
  EAS crée les certificats et la clé de notifications.
- Au premier build Android, EAS crée la clé de signature et la conserve.
- Pour Google, le **tout premier** envoi se fait à la main dans la Play
  Console : télécharger le fichier `.aab` depuis la page du build Expo. Les
  suivants peuvent passer par `eas submit`, avec une clé de compte de
  service Google.

---

## 10. Envoi en vérification

**Apple (App Store Connect)** :
1. Créer l'app (nom, Bundle ID `fr.deepclean.app`, langue française).
2. Remplir la fiche (§4), les captures (§5), la confidentialité (§7) et la
   classification par âge.
3. Indiquer les comptes de démonstration (§6) et coller la note du §6.
4. Sélectionner le build envoyé par `eas submit`.
5. Joindre l'autorisation de DEEP CLEAN (§2).
6. Envoyer en vérification (généralement 24 à 48 h). Choisir la
   disponibilité **publique**, dans tous les pays voulus.

**Google (Play Console)** :
1. Créer l'app (nom, langue, application gratuite).
2. Tableau de bord → « Configurer l'application » : accès aux applications
   (§6), annonces (Non), classification (§7), public cible (18+),
   sécurité des données (§7), application gouvernementale (Non).
3. Fiche Play Store principale : textes (§4) et visuels (§5).
4. Test fermé :
   - créer une release, envoyer le `.aab` et ajouter au moins 12 testeurs ;
   - attendre 14 jours sans interruption.
5. Demander l'accès à la production, puis publier : quelques heures à
   quelques jours d'examen.

---

## 11. Mises à jour suivantes

- **Serveur et application web** : une modification ne touchant que le
  serveur (règles, calculs, PDF…) ou le web passe par le redéploiement
  Coolify habituel (`docs/DEPLOYMENT.md` §3). Elle s'applique aussitôt aux
  apps déjà installées, sans repasser par les stores.
- **Application mobile** : tout changement d'écran ou de fonctionnement de
  l'app installée demande une nouvelle version sur les stores :
  - relancer `eas build` puis `eas submit` ;
  - ajouter une ligne « Nouveautés » ;
  - le numéro de build s'incrémente tout seul ; changer `version` dans
    `app.json` (1.1.0…) pour un numéro visible par les utilisateurs.
- Les vérifications Apple et Google des mises à jour sont en général plus
  rapides que la première.

---

## 12. Si Apple pose une question : réponses prêtes (Resolution Center)

Répondre en anglais, poliment, sans jamais contredire la fiche ni la note.

**Règle 3.2 — « app intended for a limited audience / internal use »**
```
Thank you for your review. Deep Clean is not limited to a company's employees: it is the official app of DEEP CLEAN, a cleaning and concierge company in Manosque, France, and it serves the general public without any account. The app opens on the company's public home where anyone can browse its services (each with its own page), see how a request works, check instantly whether their town is in the service area and request a free quote; requests reach the company's sales team directly. Staff sign in separately through "Espace équipe", at the bottom of the menu.
The staff area is used by the company's employees on their own personal iPhones (not company-managed devices), alongside seasonal and part-time staff who need to find the app by name on the App Store.
We would be grateful if you could reconsider the app for public distribution on the App Store.
```

**Règle 4.2.6 — « app created from a template or app generation service »**
```
Deep Clean is not created from a template or an app generation service. It is a custom app built specifically for DEEP CLEAN (its services, job sites, staff workflows and branding), developed and maintained by Boris Corsiez (KingDream Digital) under a license agreement with DEEP CLEAN. There is no other client version of this app.
```

**Règle 5.2.1 — « trademark / third-party brand »**
```
DEEP CLEAN SAS, which owns the "Deep Clean" name and logo, has licensed the app to be published by Boris Corsiez (KingDream Digital). The written authorization signed by the company's president, Romain Chris Kada-Junior FEDI, is attached to the App Review Information and can be provided again on request.
```

**Règle 1.2 — « user-generated content »**
```
The in-app messaging is limited to verified staff accounts created by the company's HR department. Any message can be reported to HR with a long press (HR and the administrator are notified immediately and can deactivate the author's account), and any user can block a contact from that contact's profile: a blocked person can no longer send direct messages or trigger notifications, and their group messages are hidden. Contact information is published on the support page: https://app.deep-clean.fr/support.html
```

**Règle 5.1.1(v) — « account deletion »**
```
Account deletion is available in the app: Menu > Profil > "Supprimer mon compte". After password confirmation, the account is deactivated immediately (all sessions closed) and HR deletes the user's data within one month, except data the employer is legally required to retain (working hours, payroll). Details: https://app.deep-clean.fr/suppression-compte.html
```

## 13. Liste de contrôle avant de cliquer sur « Envoyer pour vérification »

- [ ] Branche fusionnée, backend redéployé + `npx prisma db push`, web redéployé (§1 bis)
- [ ] `https://api.deep-clean.fr/health` répond `{"status":"ok"}`
- [ ] Pages confidentialité, assistance et suppression de compte en ligne
- [ ] Mode maintenance désactivé
- [ ] Comptes de démo Employé, Superviseur et Direction créés, mots de passe changés, missions planifiées pendant 10 jours (§6)
- [ ] L'app s'ouvre sur l'accueil public ; « Espace équipe » mène à la connexion
- [ ] Une demande de devis de test envoyée depuis l'app arrive bien dans Commercial → Prospects
- [ ] Autorisation signée de DEEP CLEAN jointe (annexe)
- [ ] Fiche, mots-clés, catégories, URL et classification renseignés (§4) — aucune mention « interne » ou « louée à des entreprises »
- [ ] Captures iPhone 6,9" importées dans l'ordre (§5)
- [ ] Questionnaire « Confidentialité de l'app » rempli comme au §7
- [ ] Build envoyé par `eas submit` sélectionné, chiffrement « standard uniquement »

## Annexe — Modèle d'autorisation d'usage du nom et du logo

À imprimer sur papier à en-tête de DEEP CLEAN, signer, scanner en PDF, puis
joindre dans App Store Connect (et garder pour Google). Une version en
anglais est utile pour les vérificateurs : elle suit le texte français.

```
AUTORISATION D'UTILISATION DE MARQUE

Je soussigné Romain Chris Kada-Junior FEDI, Président de la société DEEP CLEAN, SAS au
capital de 600 €, immatriculée au RCS de Manosque sous le numéro
942 773 375, dont le siège est situé 21 boulevard de la Plaine, 04100 Manosque,

autorise Monsieur Boris Corsiez, entrepreneur individuel exerçant sous le
nom commercial KingDream Digital (SIRET 102 486 677 00010), à publier et distribuer
sur l'App Store d'Apple et sur Google Play l'application mobile « Deep
Clean », en utilisant le nom « Deep Clean » et le logo de la société DEEP
CLEAN.

Cette application, développée sur mesure pour la société DEEP CLEAN, est
son application officielle, destinée à ses clients et à ses équipes. Elle lui
est mise à disposition par Monsieur Boris Corsiez dans le cadre d'un contrat
de licence. La présente autorisation vaut pour toute la durée de ce contrat.

Fait à Manosque, le [date].

[Signature et cachet]

---

TRADEMARK USE AUTHORIZATION

I, the undersigned Romain Chris Kada-Junior FEDI, President of DEEP CLEAN SAS
(registered in Manosque, France, under number 942 773 375), authorize
Mr Boris Corsiez (KingDream Digital) to publish and distribute the
"Deep Clean" mobile app on the Apple App Store and Google Play, using the
DEEP CLEAN name and logo. The app was custom-built for DEEP CLEAN and is
its official app, for its customers and its staff; it is provided to DEEP
CLEAN by Mr Corsiez under a license agreement. This authorization is valid
for the whole term of that agreement.
```

## Annexe — Obligations légales envers les particuliers (hors Apple)

Apple ne les vérifie pas, mais elles s'imposent à DEEP CLEAN dès qu'elle
reçoit des demandes de particuliers par l'app :

- **Médiateur de la consommation** (Code de la consommation, L612-1, L616-1,
  R616-1) : adhérer à un médiateur référencé par la CECMC (liste officielle :
  economie.gouv.fr/mediation-conso), puis afficher son nom et l'adresse de
  son site dans l'app (mentions légales, demande de devis), sur les devis,
  les CGV et le site. Manquement : amende administrative jusqu'à 15 000 €
  pour une société (L641-1).
- **Conditions générales de vente / de prestation** : prix TTC, modalités de
  paiement et d'exécution, droit de rétractation de 14 jours pour un devis
  accepté à distance ou signé chez le client (L221-18), avec le formulaire
  type, et la demande expresse du client si l'intervention a lieu avant la
  fin de ce délai (L221-25), médiateur, identité de l'entreprise. À rédiger
  ou faire relire par un juriste ou l'expert-comptable de DEEP CLEAN.

Une fois le médiateur choisi et les CGV validées, les ajouter dans l'app
(écran Mentions légales, lien sur la demande de devis) et sur les devis.

