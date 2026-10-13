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
| Éditeur (compte développeur) | **Boris Corsiez** — KingDream Digital, micro-entreprise (compte développeur **personnel**). Nom affiché sur les stores : celui du compte. |
| Client utilisateur | **DEEP CLEAN**, SAS au capital de 600 € — SIREN 942 773 375 — RCS Manosque — TVA FR54942773375. L'application lui est **louée** ; elle reste la propriété de l'éditeur. |
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
| Site de l'entreprise | `https://deep-clean.fr` |
| Email de contact / assistance | ⚠️ À FOURNIR (idéalement une adresse `@deep-clean.fr`) |

> L'identifiant `fr.deepclean.app` reprend le domaine de l'entreprise. Il
> remplace `com.deepclean.app`, qui risquait d'être déjà pris par une autre
> application « Deep Clean ». Il ne pourra plus être changé après la
> première publication.

---

## 1. Avant tout : le domaine et le serveur

Les applications publiées appellent `https://api.deep-clean.fr`. Il faut
donc que cette adresse fonctionne **avant** le premier build store.

1. Chez le fournisseur du nom de domaine (⚠️ À FOURNIR : OVH, Gandi,
   IONOS…), créer deux enregistrements DNS de type **A** :
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
  sous le nom et le logo Deep Clean, dans le cadre du contrat de location ;
- elle est à joindre en pièce jointe dans App Store Connect
  (« Informations de vérification ») et à garder sous la main pour Google.

## 3. Distribution : publique, sur l'App Store et Google Play

Objectif : l'app est trouvable et téléchargeable par tout le monde, en
cherchant « Deep Clean » dans les stores.

### Pourquoi Apple pourrait poser une question

Apple vérifie chaque app à la main. Deux réactions sont fréquentes pour une
app où l'on ne peut pas créer de compte :
- **« App réservée à une seule entreprise »** (règle 3.2) : Apple peut
  proposer la distribution privée à la place de l'App Store public.
- **« Droits sur la marque »** (règle 5.2.1) : le nom « Deep Clean »
  appartient à une société, le compte est à votre nom. D'où l'autorisation
  écrite du §2.

Ces deux points sont prévus à l'avance dans la fiche et la note aux
vérificateurs :
- **Fiche** : la description présente l'app pour ce qu'elle est, un outil
  de gestion d'équipe pour entreprise de nettoyage, édité par vous et loué
  à l'entreprise, dont les salariés reçoivent leurs identifiants.
- **Note aux vérificateurs (§6)** : elle dit clairement qui édite l'app,
  qui l'utilise, et pourquoi il n'y a pas d'inscription. Elle fournit les
  comptes de démonstration.
- **Pas de promesse de fonctions futures** : Apple juge l'app telle
  qu'elle est. Annoncer un accès élargi « dans une future mise à jour »
  n'aide pas, et la règle 2.3 interdit les descriptions qui ne
  correspondent pas à l'app livrée.

Si Apple refuse malgré tout la publication publique, on répond au
vérificateur dans App Store Connect (le « Resolution Center ») avec le
contrat de location et l'autorisation. Une demande d'appel est possible. La
distribution par lien direct ne reste qu'une solution de repli.

### Google Play

Publication publique en production, après le test fermé de 14 jours exigé
pour un compte personnel (§2).

### Nom de l'app

Le nom doit être unique sur chaque store. Si « Deep Clean » est déjà pris,
utiliser **« Deep Clean – Équipes »**. Le nom affiché sous l'icône du
téléphone reste « Deep Clean ».

## 4. Textes de la fiche (à copier-coller)

**Nom** (30 caractères max) : `Deep Clean`

**Sous-titre Apple** (30 max) : `Planning, missions et pointage`

**Texte promotionnel Apple** (170 max) :
```
Votre journée en un coup d'œil : où aller, à quelle heure, quoi faire. Planning, missions, pointage et messages de l'équipe Deep Clean, au même endroit.
```

**Description courte Google** (80 max) :
```
Planning, missions et pointage de l'équipe Deep Clean, au même endroit.
```

**Description complète** (Apple et Google, 4000 max) :
```
Deep Clean réunit toute l'équipe d'une entreprise de nettoyage — employés, chefs d'équipe, superviseurs, RH et direction — dans une seule application.

En ouvrant l'application, chacun sait immédiatement où aller, quand, et ce qu'il doit faire.

Accès réservé aux équipes : votre compte est créé par le service RH de votre entreprise, qui vous remet vos identifiants. Il n'y a pas d'inscription publique.

POUR LES ÉQUIPES SUR LE TERRAIN
• Planning du jour et de la semaine, missions à venir et terminées
• Adresse du chantier et itinéraire en un geste
• Consignes et fiche de poste de chaque mission
• Pointage de l'arrivée et du départ, avec photo et position comme justificatif
• Signalement d'un problème sur chantier, avec photos
• Notification dès qu'une mission est créée, modifiée ou annulée
• Messagerie interne avec l'équipe
• Heures du mois, congés et absences

POUR LES RESPONSABLES
• Création et modification du planning, affectation des équipes
• Suivi des missions et validation des missions terminées
• Validation des pointages et des heures (nuit, dimanche, jours fériés)
• Fiches chantier : équipe, consignes, photos, problèmes, historique
• Devis avec signature du client sur place, et factures

POUR LA RH ET LA DIRECTION
• Gestion des comptes, des rôles et des accès
• Congés, absences et documents des salariés
• Vue d'ensemble de l'activité et statistiques

SÉCURITÉ
Chacun ne voit que ce qui le concerne, contrôlé par le serveur. Mots de passe chiffrés, connexions sécurisées, reconnexion par Face ID ou empreinte digitale.

Un problème de connexion ? Contactez le service RH de votre entreprise.
```

**Mots-clés Apple** (100 max) :
`nettoyage,propreté,planning,missions,pointage,chantier,équipe,heures,congés,RH,entreprise`

**Nouveautés de la version** : `Première version de Deep Clean.`

**Catégories** :
- Apple : Économie et entreprise (principale), Productivité (secondaire).
- Google : Entreprise.

**URL** : assistance, confidentialité et site, voir le tableau §0.

---

## 5. Visuels (prêts dans `application/presentation/store/`)

| Fichier | Usage |
|---|---|
| `ios-01` à `ios-07` (1290 × 2796) | Captures iPhone 6,9" — App Store |
| `android-01` à `android-07` (1080 × 2160) | Captures téléphone — Google Play |
| `google-icone-512.png` | Icône de la fiche Google Play (512 × 512) |
| `google-banniere-1024x500.png` | Bannière de la fiche Google Play |

Ordre conseillé : connexion, accueil employé, planning, missions,
notifications, accueil direction, commercial. Toutes les captures sont
prises sur les **données de démonstration**, jamais sur de vraies données.

L'icône de l'app vient de `application/mobile/assets/icon.png`.

> L'app iPhone est configurée **sans version iPad dédiée**
> (`supportsTablet: false`) : Apple n'exige donc pas de captures iPad. Sur
> iPad, l'app iPhone s'installe quand même, et l'application web reste
> disponible.

---

## 6. Compte de démonstration pour la vérification

Apple comme Google doivent pouvoir se connecter. Comme il n'y a pas
d'inscription, la RH crée, **sur le serveur de production** :

1. Un chantier « Chantier de démonstration », à une adresse de bureau
   (pas chez un vrai client).
2. Un compte **Employé** « Revue Stores », affecté à 2 ou 3 missions sur ce
   chantier (aujourd'hui et les jours suivants).
3. Un compte **Superviseur** « Revue Stores Responsable ».

Changer les mots de passe temporaires, puis noter identifiants et mots de
passe dans les deux consoles :
- Apple : App Store Connect → « Informations de vérification de l'app ».
- Google : Play Console → « Accès aux applications ».

Ces comptes restent actifs tant que l'app est publiée : Apple et Google
re-vérifient chaque mise à jour.

**Note pour les vérificateurs** (en anglais, à coller telle quelle) :
```
Deep Clean is a workforce management app for cleaning companies: schedules, job-site missions, clock-in/clock-out, problem reporting with photos, notifications and team messaging.

It is developed and published by Boris Corsiez (KingDream Digital) and licensed to client companies. The first client is DEEP CLEAN SAS (French cleaning company, SIREN 942 773 375). It authorizes the use of its name and logo; the written authorization is attached.

Accounts are created by each client company's HR department, which gives employees their credentials. There is no public sign-up, by design, as in other employer-provided workforce apps. Please use the demo accounts provided:
- Employee account: today's missions, schedule, clock-in/out, problem reporting, notifications, messaging.
- Manager account: schedule management, validation of completed missions and timesheets.

Camera and location are used only when the user clocks in or out, as proof of presence on the job site. Location is never used in the background. Face ID is optional, for quick re-login. The app is in French.
```

## 7. Questionnaires de confidentialité

Réponses alignées sur ce que l'application fait réellement (voir la
politique de confidentialité).

### Apple — « Confidentialité de l'app »

- **Suivi (tracking)** : **Non**. Aucune publicité, aucun outil d'analyse
  tiers.
- Données collectées, toutes **liées à l'identité** de l'utilisateur et
  utilisées pour les **fonctionnalités de l'app** :
  - Coordonnées : nom, adresse email, numéro de téléphone.
  - Localisation : localisation précise (au pointage uniquement).
  - Contenu utilisateur : photos, autre contenu (messages, signalements).
  - Identifiants : identifiant utilisateur.
- **Non collectées** : données de santé, financières, de navigation,
  d'historique de recherche, de diagnostic ou d'usage.

### Google — « Sécurité des données »

- Collecte ou partage de données : **Oui** (collecte). Partage avec des
  tiers : **Non** (les prestataires techniques ne comptent pas comme un
  partage).
- Données chiffrées en transit : **Oui**.
- Possibilité de demander la suppression : **Oui**, URL
  `https://app.deep-clean.fr/suppression-compte.html`.
- Données collectées, toutes pour les **fonctionnalités de l'app** et la
  **gestion du compte** :

| Type | Obligatoire ? |
|---|---|
| Infos personnelles : nom, adresse email, ID utilisateur, numéro de téléphone | Oui |
| Position : position exacte | Oui (pointage) |
| Photos et vidéos : photos | Oui (pointage), facultatif sinon |
| Fichiers et documents | Facultatif |
| Messages : autres messages intégrés à l'appli | Facultatif |
| Identifiants de l'appareil (notifications) | Facultatif |

### Autres réponses

- **Chiffrement (Apple, export)** : l'app n'utilise que le chiffrement
  standard (HTTPS). C'est déjà déclaré dans l'app
  (`ITSAppUsesNonExemptEncryption: false`), Apple ne posera plus la
  question.
- **Classification par âge** :
  - Apple : aucun contenu sensible. Messagerie entre utilisateurs : Oui
    (interne, entre collègues). Accès web libre : Non.
  - Google (questionnaire IARC) : catégorie « Utilitaires, productivité,
    communication ». Les utilisateurs peuvent communiquer : Oui. La
    position est partagée avec d'autres utilisateurs (les responsables) :
    Oui.
- **Public cible (Google)** : 18 ans et plus uniquement.
- **Publicités** : Non.
- **Application gouvernementale / santé / finance** : Non.

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
3. Indiquer les comptes de démonstration (§6).
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

## Annexe — Modèle d'autorisation d'usage du nom et du logo

À imprimer sur papier à en-tête de DEEP CLEAN, signer, scanner en PDF, puis
joindre dans App Store Connect (et garder pour Google). Une version en
anglais est utile pour les vérificateurs : elle suit le texte français.

```
AUTORISATION D'UTILISATION DE MARQUE

Je soussigné(e) [Prénom NOM], Président(e) de la société DEEP CLEAN, SAS au
capital de 600 €, immatriculée au RCS de Manosque sous le numéro
942 773 375, dont le siège est situé [adresse du siège],

autorise Monsieur Boris Corsiez, entrepreneur individuel exerçant sous le
nom commercial KingDream Digital (SIRET [numéro]), à publier et distribuer
sur l'App Store d'Apple et sur Google Play l'application mobile « Deep
Clean », en utilisant le nom « Deep Clean » et le logo de la société DEEP
CLEAN.

Cette application est louée par Monsieur Boris Corsiez à la société DEEP
CLEAN, pour la gestion de ses équipes. La présente autorisation vaut pour
toute la durée du contrat de location.

Fait à [ville], le [date].

[Signature et cachet]

---

TRADEMARK USE AUTHORIZATION

I, the undersigned [First name LAST NAME], President of DEEP CLEAN SAS
(registered in Manosque, France, under number 942 773 375), authorize
Mr Boris Corsiez (KingDream Digital) to publish and distribute the
"Deep Clean" mobile app on the Apple App Store and Google Play, using the
DEEP CLEAN name and logo. The app is licensed by Mr Corsiez to DEEP CLEAN
for its workforce management. This authorization is valid for the whole
term of the license agreement.
```
