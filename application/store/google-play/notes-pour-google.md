# Notes pour la Google Play Console — déclarations et accès

Où : Google Play Console → votre app → **Contenu de l'application** (colonne de
gauche, section « Politique et programmes »). Chaque rubrique ci-dessous est un
formulaire à remplir une fois.

## 1. Accès à l'application (« App access »)

Choisir : **Toutes les fonctionnalités ne sont pas disponibles sans restrictions**,
puis ajouter des instructions d'accès :

```
Nom des instructions : Compte de démonstration
Identifiant :           [à créer — compte Employé dédié]
Mot de passe :          [à créer]
Autres instructions :   Application interne réservée aux salariés de Deep Clean : il n'existe pas d'inscription, les comptes sont créés par la RH. Se connecter avec l'identifiant et le mot de passe ci-dessus. Pour voir l'espace RH, utiliser le second compte : identifiant [à créer] / mot de passe [à créer].
```

Comme pour Apple : **comptes dédiés à la validation**, créés sur le vrai serveur
(HTTPS, allumé pendant toute la validation), supprimés ou désactivés ensuite.

## 2. Publicités

**Non**, l'application ne contient pas de publicité.

## 3. Public cible et contenu

- Tranche d'âge : **18 ans et plus** uniquement (application professionnelle).
- « L'application attire-t-elle les enfants ? » : **Non**.

## 4. Classification du contenu (questionnaire IARC)

| Question | Réponse |
|---|---|
| Catégorie | **Utilitaire, productivité, communication ou autre** |
| Violence, contenu sexuel, langage grossier, drogues, jeux d'argent | **Non** à tout |
| Les utilisateurs peuvent-ils échanger entre eux ? | **Oui** (messagerie interne entre collègues) |
| Contenu généré par les utilisateurs | **Oui** (messages, photos, visibles seulement des participants et responsables habilités) |
| Partage de la position avec d'autres utilisateurs | **Oui, par prudence** : la position du pointage est visible des responsables habilités (RH, superviseurs, direction). C'est une simple mention d'information, sans effet sur la publication |
| Achats numériques | **Non** |
| Accès à Internet / navigateur | **Non** (pas de navigateur intégré) |

## 5. Autres déclarations

| Rubrique | Réponse |
|---|---|
| Application gouvernementale | Non |
| Fonctionnalités financières | Aucune (les devis et factures sont ceux de l'entreprise, aucun service financier) |
| Application de santé | Non |
| Application d'actualités | Non |
| Suivi COVID-19 | Non |
| Identifiant de publicité | **Non utilisé** |
| Permissions sensibles (SMS, appels, position en arrière-plan, accès à tous les fichiers) | **Aucune** — rien à justifier |
| Photos et vidéos | Aucune permission d'accès à la galerie : l'app utilise le sélecteur du système |

## 6. Version Android visée

L'application vise l'**API 36 (Android 16)**, exigée par Google pour toute
nouvelle application depuis le 31 août 2026 : rien à faire.

## 7. Pistes de publication (recommandé)

1. **Test interne** (jusqu'à 100 personnes, immédiat, sans validation longue) :
   idéal pour installer l'app sur les téléphones de l'entreprise dès le premier jour.
2. **Test fermé** : élargir à plus de testeurs.
3. **Production** : visible de tous sur le Play Store (connexion obligatoire pour
   utiliser l'app).

> Compte **personnel** créé après novembre 2023 : Google impose un test fermé de
> **12 testeurs pendant 14 jours consécutifs** avant d'ouvrir la production. Un
> compte **organisation** (société, avec numéro D-U-N-S) n'a pas cette obligation.
> Voir `docs/PUBLICATION-STORES.md`, étape 2.

## 8. Fichier à envoyer

Le fichier de l'app est un **.aab** (« Android App Bundle »), produit par
`eas build --platform android --profile production`. Google signe lui-même
l'app finale (« Play App Signing », activé par défaut).
