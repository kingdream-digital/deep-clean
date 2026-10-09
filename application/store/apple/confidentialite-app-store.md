# Confidentialité de l'app (App Store Connect) — réponses à donner

Où : App Store Connect → votre app → **Confidentialité de l'app** (« App Privacy »).
Ces réponses sont affichées publiquement sur la fiche de l'app : elles doivent
rester **exactes**. Elles reflètent les données réellement enregistrées par
l'application (schéma de la base `backend/prisma/schema.prisma`).

## Les deux grandes questions

| Question d'Apple | Réponse |
|---|---|
| Collectez-vous des données de cette app ? | **Oui** |
| Utilisez-vous des données pour le suivi publicitaire (« tracking ») ? | **Non** — aucun suivi, aucune publicité, aucun outil d'analyse tiers |

## Types de données à cocher

Pour **chaque** ligne : *Associée à l'identité de l'utilisateur* = **Oui** ·
*Utilisée pour le suivi* = **Non** · *Finalité* = **Fonctionnalités de l'app**
(« App Functionality »).

| Catégorie Apple | Type | Ce que l'app enregistre |
|---|---|---|
| Coordonnées | **Nom** | Prénom et nom des salariés ; contacts de clients et prospects |
| Coordonnées | **Adresse e-mail** | E-mail du salarié (facultatif) ; contacts clients |
| Coordonnées | **Numéro de téléphone** | Téléphone du salarié (facultatif) ; contacts clients |
| Coordonnées | **Adresse physique** | Adresses des chantiers et des clients (professionnels) |
| Santé et remise en forme | **Santé** | Type d'absence « arrêt maladie » / « accident du travail » (aucun détail médical) |
| Informations sensibles | **Informations sensibles** | Type d'absence « congé maternité / paternité / adoption » |
| Localisation | **Position précise** | Position GPS relevée à l'arrivée et au départ lors du pointage |
| Contenu de l'utilisateur | **Photos ou vidéos** | Photo de pointage, photos de signalements, photos de la messagerie, photo de profil |
| Contenu de l'utilisateur | **Autre contenu de l'utilisateur** | Messages, commentaires, consignes, documents PDF |
| Identifiants | **Identifiant utilisateur** | Identifiant de connexion et identifiant interne du compte |
| Identifiants | **Identifiant de l'appareil** | Identifiant de notification (« push token ») du téléphone |
| Données d'utilisation | **Autres données d'utilisation** | Journal des actions importantes (qui a fait quoi, quand) |
| Autres données | **Autres types de données** | Adresse IP et type d'appareil dans les sessions de connexion (sécurité) |

> Pourquoi « Santé » et « Informations sensibles » : un type d'absence « arrêt
> maladie » est une donnée de santé au sens du RGPD, et « congé maternité » révèle
> une situation familiale. Mieux vaut les déclarer que risquer une déclaration
> incomplète. À faire valider par la RH / le juriste de l'entreprise.

## Ce qui n'est PAS collecté (ne pas cocher)

Informations financières (aucun paiement dans l'app ; les devis et factures sont
ceux de l'entreprise envers ses clients) · Contacts du téléphone (le carnet
d'adresses n'est jamais lu) · Historique de navigation · Historique de recherche ·
Achats · Données de diagnostic (aucun rapport de plantage n'est envoyé) · Audio ·
Contenu de jeu · Données corporelles.

## Biométrie (Face ID)

Face ID / Touch ID sert uniquement à déverrouiller une session déjà enregistrée :
iOS ne renvoie à l'app qu'un « oui / non ». **Aucune donnée biométrique n'est
collectée** : ne rien cocher à ce sujet.

## À retenir

- Si un outil de statistiques, de publicité ou de rapport de plantage est ajouté
  un jour, **cette déclaration doit être mise à jour avant** la mise à jour de l'app.
- Le fichier `PrivacyInfo.xcprivacy` embarqué dans l'app (généré depuis
  `app.json` → `ios.privacyManifests`) déclare le « non-suivi » et les API à raison
  requise. La liste détaillée des données collectées n'y est volontairement pas
  répétée : la déclaration faisant foi pour le public est celle d'App Store Connect.
