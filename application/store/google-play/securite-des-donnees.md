# Sécurité des données (Google Play) — réponses à donner

Où : Google Play Console → votre app → **Contenu de l'application** → **Sécurité
des données** (« Data safety »). Ces réponses sont affichées publiquement sur la
fiche du Play Store : elles doivent rester **exactes**. Elles reflètent les
données réellement enregistrées par l'application (`backend/prisma/schema.prisma`).

## Questions générales

| Question de Google | Réponse |
|---|---|
| Votre app collecte-t-elle ou partage-t-elle des types de données obligatoires ? | **Oui** |
| Toutes les données collectées sont-elles chiffrées pendant leur transfert ? | **Oui** (HTTPS) — vrai à condition que le serveur soit en `https://` ; le garde-fou `npm run verifier:publication` l'impose |
| Proposez-vous aux utilisateurs un moyen de demander la suppression de leurs données ? | **Oui** — adresse de la page : `https://VOTRE-DOMAINE/suppression-de-compte.html` |
| Suppression de compte : l'utilisateur peut-il créer un compte dans l'app ? | **Non** : les comptes sont créés par la RH de l'entreprise (aucune inscription). La demande de suppression passe par la RH, expliquée sur la page ci-dessus. |

## Types de données

Colonnes : **Collectée** = envoyée au serveur de l'entreprise · **Partagée** = transmise
à un tiers (voir plus bas : *Non* partout) · **Finalités** = ce qu'il faut cocher.

| Catégorie Google | Type | Collectée | Partagée | Obligatoire ? | Finalités |
|---|---|---|---|---|---|
| Informations personnelles | **Nom** | Oui | Non | Obligatoire | Fonctionnement de l'appli ; Gestion du compte |
| Informations personnelles | **Adresse e-mail** | Oui | Non | Facultative | Fonctionnement de l'appli ; Gestion du compte |
| Informations personnelles | **Identifiants utilisateur** | Oui | Non | Obligatoire | Fonctionnement de l'appli ; Gestion du compte |
| Informations personnelles | **Adresse** (chantiers, clients professionnels) | Oui | Non | Facultative | Fonctionnement de l'appli |
| Informations personnelles | **Numéro de téléphone** | Oui | Non | Facultative | Fonctionnement de l'appli ; Gestion du compte |
| Santé et remise en forme | **Informations de santé** (type d'absence : arrêt maladie, accident du travail) | Oui | Non | Facultative | Fonctionnement de l'appli |
| Position | **Position approximative** | Oui | Non | Facultative | Fonctionnement de l'appli ; Prévention de la fraude, sécurité et conformité |
| Position | **Position précise** | Oui | Non | Facultative | Fonctionnement de l'appli ; Prévention de la fraude, sécurité et conformité |
| Photos et vidéos | **Photos** | Oui | Non | Facultative | Fonctionnement de l'appli |
| Messages | **Autres messages dans l'appli** | Oui | Non | Facultative | Fonctionnement de l'appli |
| Fichiers et documents | **Fichiers et documents** (PDF) | Oui | Non | Facultative | Fonctionnement de l'appli |
| Activité dans l'appli | **Autres actions** (journal des actions importantes) | Oui | Non | Obligatoire | Fonctionnement de l'appli ; Prévention de la fraude, sécurité et conformité |
| Identifiants d'appareil ou autres | **Identifiants d'appareil ou autres** (identifiant de notification) | Oui | Non | Facultative | Fonctionnement de l'appli |

La position est demandée au pointage : l'utilisateur peut refuser et utiliser le
« pointage différé » (d'où « Facultative »). Les types d'absence « congé
maternité / paternité » ne correspondent à aucune catégorie propre chez Google :
ils sont couverts par « Informations de santé » ci-dessus.

## Ce qui n'est PAS collecté (ne pas cocher)

Informations financières · Historique de navigation · Contacts · Agenda ·
Audio · Fichiers audio · Informations sur l'appli et ses performances (aucun
rapport de plantage ni outil d'analyse) · Données de santé liées à des capteurs.

## « Partagée : Non » — pourquoi

Les données ne sont transmises à aucun tiers à des fins propres. Les seuls
intermédiaires techniques (hébergeur Oracle à Paris ; service de notifications
d'Expo, puis Google ; service d'envoi d'e-mails ; plateforme de facture
électronique Super PDP) traitent les données **pour le compte de l'entreprise** :
Google ne considère pas ce cas comme un « partage ».

## À retenir

- Si un outil de statistiques, de publicité ou de rapport de plantage est ajouté un
  jour, **ce formulaire doit être mis à jour avant** la mise à jour de l'app.
- Google compare ce formulaire aux permissions de l'app : elles sont déjà
  alignées (pas de micro, pas de position en arrière-plan, pas d'accès à tous les
  fichiers).
