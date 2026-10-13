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
| Éditeur (compte développeur) | **DEEP CLEAN**, SAS au capital de 600 € — SIREN 942 773 375 — RCS Manosque — TVA FR54942773375 |
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

## 2. Comptes à créer (au nom de DEEP CLEAN)

Les deux stores exigent, pour une société, un **numéro D-U-N-S** (gratuit).

1. **Numéro D-U-N-S** : demande gratuite via l'outil d'Apple
   (developer.apple.com → « D-U-N-S Number Lookup »). Compter quelques jours.
2. **Apple Developer Program**, inscription en tant qu'**organisation**
   (99 €/an) : developer.apple.com/programs/enroll. Il faut :
   - le D-U-N-S ;
   - le site `deep-clean.fr` en ligne ;
   - une adresse email sur le domaine ;
   - une personne habilitée à engager la société (le président).
3. **Google Play Console**, compte **organisation** (25 $ une fois) :
   play.google.com/console, avec le même D-U-N-S.
   - Un compte organisation n'est **pas** soumis à l'obligation des
     « 12 testeurs pendant 14 jours » imposée aux comptes personnels.
4. **Expo** (gratuit) : le compte qui lance les builds (`eas login`).
5. **Firebase** (gratuit), pour les notifications Android : voir §8.

> Conseil : créer les comptes Apple et Google au nom de Deep Clean, puis
> inviter KingDream Digital comme membre (rôle « Admin » chez Apple, ou
> accès « Administrateur » dans la Play Console). L'entreprise reste
> propriétaire de son application.

---

## 3. Mode de distribution recommandé

### iPhone : « distribution non répertoriée » (lien direct)

Apple refuse souvent, sur l'App Store public, les applications réservées
aux salariés d'une seule entreprise. Apple prévoit pour ce cas la
**distribution non répertoriée** :
- l'app passe la vérification Apple normalement ;
- elle n'apparaît ni dans les recherches ni dans les catégories ;
- les salariés l'installent depuis un **lien direct** sur leur iPhone
  personnel, sans configuration particulière.

Marche à suivre :
1. Envoyer la version 1.0 en vérification normalement (§10).
2. En même temps, remplir la demande sur
   developer.apple.com/contact/request/unlisted-app.

### Android : publication normale (production)

Google accepte une app interne en publication publique : elle reste
inutilisable sans compte créé par la RH. Le lien Play Store est envoyé aux
salariés. On peut aussi commencer par un « test fermé » limité à une liste
d'adresses email.

---

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
Deep Clean est l'application interne de l'entreprise de nettoyage DEEP CLEAN. Elle réunit toute l'équipe — employés, chefs d'équipe, superviseurs, RH et direction — au même endroit.

Application réservée aux collaborateurs : les comptes sont créés par le service RH, il n'est pas possible de s'inscrire depuis l'application.

En ouvrant l'application, chacun sait immédiatement où aller, quand, et ce qu'il doit faire.

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

Un problème de connexion ? Contactez la RH.
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

**Note pour les vérificateurs** (en anglais, à coller tel quel) :
```
Deep Clean is the internal workforce app of DEEP CLEAN, a French cleaning company (SIREN 942 773 375). Accounts are created only by the company's HR department: there is no public sign-up, by design. Please use the demo accounts provided.

Employee account: today's missions, weekly schedule, clock-in/clock-out, problem reporting with photos, notifications and internal team messaging. Manager account: schedule management, validation of completed missions and timesheets.

Camera and location are used only when the user clocks in or out, as proof of presence on the job site. Location is never used in the background. Face ID is optional, for quick re-login. The app is in French.
```

---

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
5. Envoyer en vérification (généralement 24 à 48 h). Demander ensuite la
   distribution non répertoriée (§3).

**Google (Play Console)** :
1. Créer l'app (nom, langue, application gratuite).
2. Tableau de bord → « Configurer l'application » : accès aux applications
   (§6), annonces (Non), classification (§7), public cible (18+),
   sécurité des données (§7), application gouvernementale (Non).
3. Fiche Play Store principale : textes (§4) et visuels (§5).
4. Production → créer une release, envoyer le `.aab`, puis envoyer en
   examen (quelques heures à quelques jours).

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
