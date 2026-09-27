# CONSIGNE DE COMMUNICATION — TOUJOURS EN FRANÇAIS

Le client communique uniquement en français (souvent par téléphone, avec des
fautes de frappe). Toute communication avec lui doit être en français,
**y compris le raisonnement/réflexion interne affiché**, pas seulement les
réponses finales. Ne jamais basculer en anglais dans les échanges avec lui.

---

# DEEP CLEAN — CRÉATION COMPLÈTE DE L'APPLICATION

Tu vas créer **Deep Clean**, une véritable application mobile professionnelle destinée à une entreprise de nettoyage.

Je ne veux pas une simple maquette, une démonstration ou des écrans statiques.

Je veux une **application réellement fonctionnelle**, avec du vrai code propre, sécurisé, organisé et prêt à évoluer jusqu'à une utilisation réelle en entreprise.

Tu dois construire le projet **de A à Z**, depuis l'initialisation technique jusqu'à une version finale exploitable.

---

# 1. OBJECTIF DE L'APPLICATION

Deep Clean doit permettre à l'entreprise de gérer facilement :

- ses employés ;
- ses chefs d'équipe ;
- ses ressources humaines ;
- ses plannings ;
- ses chantiers ;
- ses missions ;
- ses équipes ;
- ses consignes ;
- ses problèmes sur chantier ;
- ses photos ;
- ses validations ;
- ses notifications ;
- ses informations internes.

L'application doit permettre à toute l'équipe de travailler depuis un seul endroit.

L'objectif principal est que chaque utilisateur puisse **ouvrir l'application et savoir immédiatement ce qu'il doit faire, où il doit aller et s'il y a une information importante**.

---

# 2. UTILISATEURS ET RÔLES

Créer un véritable système de comptes avec permissions.

Les rôles principaux sont :

- **Employé**
- **Chef d'équipe**
- **Superviseur**
- **RH**
- **Directeur**

Prévoir également un **administrateur technique** si nécessaire pour la gestion technique de l'application.

Renommage explicite du client (validé) : le rôle auparavant appelé « Chef de chantier » s'appelle désormais **Chef d'équipe** partout dans l'application (web et mobile) — même rôle, mêmes permissions, seul le nom change. Ne pas confondre avec le chef d'équipe d'UNE mission : ce dernier est un simple employé désigné (optionnel) à la création d'une mission pour encadrer les autres employés affectés à cette mission précise (voir section SUPERVISEUR ci-dessous et section MISSIONS) — un compte au rôle Chef d'équipe n'a besoin d'être renseigné nulle part à la création d'un chantier, seulement (et de façon optionnelle) via la fiche du chantier ensuite.

Le rôle **Superviseur** a été ajouté en cours de développement (retour explicite du client, validé) : il vient s'intercaler entre le chef d'équipe et la RH/direction. Il gère le planning au quotidien (création, modification, annulation des missions) et valide les pointages avant transmission à la RH — deux responsabilités que le chef d'équipe n'exerce plus lui-même une fois ce rôle introduit (voir plus bas, section CHEF D'ÉQUIPE).

Les permissions doivent être contrôlées côté serveur, jamais uniquement dans l'application mobile.

## EMPLOYÉ

L'employé peut :

- se connecter à son compte ;
- consulter son planning ;
- voir ses missions ;
- voir les horaires ;
- voir les lieux des chantiers ;
- consulter les consignes ;
- recevoir des notifications ;
- signaler un problème ;
- prendre ou envoyer une photo ;
- ajouter un commentaire ;
- confirmer certaines actions ;
- valider une mission lorsque cela est demandé ;
- consulter son historique ;
- modifier son propre mot de passe.

L'employé ne doit jamais pouvoir accéder aux informations auxquelles il n'a pas droit.

## CHEF D'ÉQUIPE

Le chef d'équipe peut :

- consulter les chantiers qui lui sont attribués ;
- consulter son équipe ;
- consulter les plannings ;
- ajouter ou modifier la consigne d'une mission sur ses propres chantiers ;
- démarrer et terminer une mission sur ses propres chantiers (suivi terrain) ;
- ajouter des photos ;
- signaler ou traiter des problèmes ;
- demander des validations ;
- valider une mission terminée sur ses propres chantiers ;
- suivre l'état des missions ;
- modifier son propre mot de passe.

Retour explicite du client (validé) : depuis l'introduction du rôle Superviseur, le chef d'équipe ne crée, ne modifie et n'annule plus lui-même le planning (titre, date, horaires, affectations) — cette responsabilité est désormais réservée au Superviseur, à la RH, à la Direction et à l'admin technique. Il garde uniquement la main sur ses propres chantiers : la consigne d'une mission, le suivi terrain (démarrer/terminer), et la validation d'une mission terminée.

Retour explicite du client (validé), nouvelle évolution : deux droits changent de portée.

- **Signaler un problème (avec photo)** n'est plus réservé à l'employé et au chef d'équipe : c'est désormais ouvert à **tout le monde**, y compris la RH et le Superviseur (qui en étaient exclus jusqu'ici), en plus de la Direction et de l'admin technique qui pouvaient déjà le faire.
- **Démarrer / terminer une mission (suivi terrain)** n'est plus limité aux « propres chantiers » du chef d'équipe : la règle devient **tout le monde SAUF l'employé**. Concrètement, le chef d'équipe peut désormais démarrer/terminer n'importe quelle mission qu'il peut voir (son chantier, ou toute mission où il est affecté — pas seulement celles dont il est responsable ou désigné chef), et le Superviseur, la RH, la Direction et l'admin technique le pouvaient déjà via leur droit de gestion du planning.

## RH

La RH possède un espace spécifique pour gérer les comptes et les informations RH autorisées.

Elle peut notamment :

- créer les comptes utilisateurs ;
- modifier les comptes ;
- attribuer les rôles ;
- activer un compte ;
- désactiver un compte ;
- réactiver un compte ;
- réinitialiser l'accès d'un utilisateur ;
- gérer les employés ;
- gérer les disponibilités ;
- gérer les absences ;
- gérer les informations administratives autorisées.

**La RH est la seule personne autorisée à créer les comptes utilisateurs.**

Retour explicite du client (validé) : la RH peut désormais aussi signaler un problème (avec photo) sur n'importe quel chantier, et démarrer/terminer une mission (suivi terrain) — voir la règle « tout le monde sauf l'employé » dans la section CHEF D'ÉQUIPE ci-dessus.

## SUPERVISEUR

Le superviseur est le rôle central du planning et de la validation des heures au quotidien (retour explicite du client, ajouté en cours de développement).

Il peut notamment :

- créer, modifier et annuler des missions (planning complet, tous chantiers) ;
- affecter les employés et désigner le chef d'équipe d'une mission ;
- ajouter des consignes ;
- gérer la fiche de poste d'une mission (tâches, équipement, consignes de sécurité) ;
- valider une mission terminée ;
- valider ou refuser les pointages de l'équipe avant transmission à la RH ;
- consulter les chantiers, les équipes et les statistiques de suivi ;
- modifier son propre mot de passe.

Le superviseur ne peut ni créer de comptes utilisateurs, ni attribuer les rôles Directeur ou Admin — ces deux rôles restent réservés à la RH (pour les rôles courants) et à l'admin technique (pour Directeur/Admin).

Retour explicite du client (validé) : le superviseur peut désormais aussi signaler un problème (avec photo) sur n'importe quel chantier — il pouvait déjà démarrer/terminer une mission via son droit de gestion complète du planning.

## DIRECTEUR

Le directeur dispose d'une vue globale de l'entreprise, et depuis l'évolution ci-dessous, de la quasi-totalité des permissions de gestion.

Il peut notamment :

- tout ce que peut faire le Superviseur sur le planning : créer, modifier et annuler des missions (planning complet, tous chantiers), affecter les employés et désigner le chef d'équipe d'une mission, gérer la fiche de poste (tâches, équipement, consignes de sécurité) ;
- signaler un problème (avec photo) et démarrer/terminer une mission (suivi terrain) — comme tout le monde sauf l'employé ;
- valider une mission terminée ;
- valider ou refuser les pointages avant transmission à la RH ;
- approuver ou refuser les congés et absences ;
- créer et gérer les chantiers et leurs fiches ;
- publier des actualités/annonces ;
- **modifier un compte utilisateur existant, l'activer, le désactiver, réinitialiser son accès** — sans jamais pouvoir en **créer** un nouveau (toujours réservé à la RH/admin technique), ni agir sur le compte de l'admin technique lui-même ou lui attribuer ce rôle ;
- consulter les équipes, les employés, les chantiers, les plannings, les missions, les problèmes, les validations et le journal d'activité complet de l'entreprise ;
- consulter les statistiques et la vue d'ensemble de l'activité ;
- modifier son propre mot de passe.

Retour explicite du client (validé), nouvelle évolution majeure : le directeur n'était au départ qu'un rôle de consultation. Il dispose désormais de **toutes les permissions de gestion de l'application, à la seule et unique exception de la création de comptes utilisateurs** (« tout sauf créer les comptes »), qui reste réservée à la RH (et à l'admin technique). Il ne peut pas non plus agir sur le compte de l'admin technique — rôle de maintenance technique de l'application, volontairement hors de la hiérarchie métier — ni lui attribuer ce rôle.

---

# 3. CRÉATION DES COMPTES — IMPORTANT

**Il ne doit absolument PAS être possible de créer un compte directement depuis l'application.**

Ne pas afficher :

- « Créer un compte »
- « Inscription »
- « S'inscrire »
- inscription Google ;
- inscription Apple ;
- inscription publique.

L'application est destinée à une utilisation interne par l'entreprise.

### Fonctionnement

1. La RH crée le compte depuis son espace RH.
2. La RH attribue le rôle de l'utilisateur.
3. La RH fournit à l'utilisateur ses informations de connexion.
4. L'utilisateur télécharge l'application.
5. L'utilisateur se connecte avec les informations fournies par la RH.
6. Lors de la première connexion, si un mot de passe temporaire est utilisé, l'utilisateur doit définir son propre mot de passe.
7. L'utilisateur peut ensuite utiliser normalement l'application.

Le mot de passe personnel de l'utilisateur ne doit jamais être visible par la RH.

La RH doit pouvoir **réinitialiser l'accès** sans connaître le mot de passe actuel.

Si un utilisateur rencontre un problème avec son compte, afficher clairement :

**« Pour tout problème de connexion ou de compte, contactez la RH. »**

---

# 4. CONNEXION ET RESTER CONNECTÉ

Créer un écran de connexion simple et premium.

Champs :

- identifiant ;
- mot de passe.

Ajouter une option :

**☑ Rester connecté**

Si l'utilisateur active cette option :

- conserver sa session de manière sécurisée ;
- ne pas demander les identifiants à chaque lancement ;
- restaurer automatiquement la session au démarrage ;
- vérifier que la session est toujours valide ;
- renouveler la session de manière sécurisée si nécessaire.

Ajouter également :

**Se déconnecter**

dans le profil.

La déconnexion doit invalider correctement la session.

Si l'utilisateur n'active pas « Rester connecté », appliquer une durée de session adaptée à la sécurité de l'application.

---

# 5. MODIFICATION DU MOT DE PASSE

L'utilisateur peut modifier son propre mot de passe depuis :

**Profil → Sécurité → Modifier mon mot de passe**

Le nouveau mot de passe doit respecter une politique de sécurité correcte.

Les mots de passe doivent être hashés de manière sécurisée côté serveur.

Ne jamais stocker un mot de passe en clair.

Ne jamais afficher le mot de passe à la RH.

En cas d'oubli ou de problème :

**Utilisateur → RH → Réinitialisation de l'accès par la RH**

---

# 6. SÉCURITÉ

La sécurité doit être intégrée dès la première ligne de code.

Mettre en place notamment :

- HTTPS ;
- authentification sécurisée ;
- hashage sécurisé des mots de passe ;
- tokens/sessions sécurisés ;
- variables d'environnement ;
- validation côté serveur ;
- contrôle des permissions côté serveur ;
- rate limiting ;
- protection contre brute force ;
- protection contre injections ;
- protection XSS ;
- protection des API ;
- protection des fichiers ;
- logs de sécurité ;
- gestion des sessions expirées ;
- gestion des erreurs sans révéler d'informations sensibles.

**Ne jamais faire confiance au frontend.**

Un utilisateur ne doit pas pouvoir accéder aux données d'un autre utilisateur en modifiant simplement un ID.

Toutes les opérations importantes doivent être vérifiées côté backend.

Si un compte est désactivé par la RH, l'utilisateur ne doit plus pouvoir accéder normalement à l'application.

---

# 7. PLANNING

Créer un système de planning complet.

Le responsable autorisé doit pouvoir créer une mission avec :

- chantier ;
- date ;
- heure de début ;
- heure de fin ;
- employés affectés ;
- chef d'équipe ;
- consignes ;
- informations supplémentaires.

Prévoir :

- planning personnel ;
- planning équipe ;
- planning chantier ;
- calendrier ;
- missions à venir ;
- missions terminées ;
- modifications ;
- annulations ;
- absences ;
- remplacements.

---

# 8. NOTIFICATIONS DU PLANNING

C'est une fonctionnalité essentielle.

Lorsqu'un planning change, l'application doit déterminer automatiquement les personnes concernées.

Exemples :

Nouvelle mission :

> « Une nouvelle mission vous a été attribuée. »

Changement d'horaire :

> « L'horaire de votre mission a été modifié. »

Changement de chantier :

> « Le lieu de votre mission a été modifié. »

Annulation :

> « Votre mission a été annulée. »

Nouvelle consigne :

> « Une nouvelle consigne a été ajoutée à votre mission. »

Ne jamais envoyer une notification à quelqu'un qui n'est pas concerné.

Retour explicite du client (validé) : la réciproque est tout aussi absolue. **Peu importe les choix faits — qui a réalisé l'action, quel rôle, quel chemin dans l'application — une personne concernée est toujours notifiée.** Il n'existe et il ne doit jamais exister de réglage, de préférence ou d'option qui permette de désactiver une notification pour quelqu'un qu'elle concerne réellement : ce n'est pas paramétrable, c'est garanti par construction. Concrètement, la détermination des destinataires ne dépend jamais de qui a déclenché l'événement (peu importe que ce soit l'employé, le chef d'équipe, le superviseur, la RH, la direction ou l'admin technique qui modifie une mission, valide un pointage ou signale un problème) — seuls comptent le lien réel avec l'élément concerné (affecté à la mission, responsable du chantier, rôle de validation, etc.).

Prévoir :

- notifications push ;
- notifications internes ;
- centre de notifications ;
- compteur de notifications non lues ;
- historique ;
- lecture/non-lecture.

---

# 9. CHANTIERS

Créer une fiche pour chaque chantier.

Une fiche chantier peut contenir :

- nom ;
- adresse ;
- informations ;
- équipe ;
- chef d'équipe ;
- planning ;
- missions ;
- consignes ;
- photos ;
- problèmes ;
- validations ;
- historique.

Les accès doivent dépendre du rôle de l'utilisateur.

---

# 10. PROBLÈMES SUR CHANTIER

Permettre à un employé ou chef d'équipe autorisé de signaler un problème directement depuis une mission.

Il doit pouvoir :

- écrire le problème ;
- prendre une photo ;
- sélectionner plusieurs photos ;
- ajouter un commentaire ;
- envoyer le signalement.

Exemple :

> « Sol endommagé dans le couloir. »

avec une photo jointe.

Créer un système de suivi :

**Nouveau → En cours → Traité → Validé**

Conserver l'historique du problème.

---

# 11. PHOTOS ET FICHIERS

Les photos doivent être stockées de manière sécurisée.

Ne pas rendre les fichiers privés accessibles avec une URL publique permanente.

Les accès aux photos doivent être contrôlés.

Prévoir :

- compression/optimisation des images ;
- téléchargement sécurisé ;
- suppression ;
- contrôle des permissions ;
- stockage sécurisé.

---

# 12. VALIDATIONS

Créer un système de validation.

Exemples :

- validation d'une mission ;
- validation d'une fin de chantier ;
- validation d'un problème traité ;
- confirmation d'une modification importante.

Chaque validation doit conserver :

- utilisateur ;
- date ;
- heure ;
- action validée.

---

# 13. TABLEAU DE BORD

Créer un tableau de bord adapté au rôle.

### Employé

Afficher principalement :

- mission actuelle ;
- prochaine mission ;
- planning du jour ;
- notifications ;
- consignes importantes.

### Chef d'équipe

Afficher :

- chantiers ;
- équipe ;
- planning ;
- missions ;
- problèmes ;
- validations.

### RH

Afficher :

- employés ;
- disponibilités ;
- absences ;
- comptes utilisateurs ;
- informations RH autorisées.

### Directeur

Afficher :

- activité globale ;
- équipes ;
- chantiers ;
- planning ;
- missions ;
- problèmes ;
- validations ;
- statistiques.

---

# 14. DESIGN

Je veux un design **premium, moderne, minimaliste et professionnel**.

Je vais fournir le logo officiel de Deep Clean.

Utilise ce logo et son identité visuelle comme base.

Je veux une qualité visuelle comparable aux applications haut de gamme.

Inspiration générale :

- simplicité d'Apple ;
- excellente hiérarchie visuelle ;
- boutons élégants ;
- coins arrondis ;
- animations fluides ;
- micro-interactions ;
- transitions naturelles ;
- typographie moderne ;
- espaces bien équilibrés ;
- cartes propres ;
- icônes cohérentes.

Ne copie pas Apple.

Je veux uniquement retrouver ce niveau de finition.

L'application doit être agréable à utiliser aussi bien pour un employé que pour un directeur.

---

# 15. NAVIGATION

Créer une navigation mobile simple.

Prévoir notamment :

**Accueil**

**Planning**

**Missions**

**Notifications**

**Profil**

Les éléments supplémentaires doivent apparaître selon le rôle de l'utilisateur.

Par exemple :

- Équipe ;
- Chantiers ;
- RH ;
- Administration.

Ne pas afficher des fonctionnalités inutiles à un employé.

---

# 16. EXPÉRIENCE UTILISATEUR

L'application doit être extrêmement simple.

Un utilisateur doit pouvoir comprendre immédiatement :

**Où je dois aller ?**

**Quand ?**

**Qu'est-ce que je dois faire ?**

**Y a-t-il une information importante ?**

Limiter les clics inutiles.

Prévoir des animations légères et rapides.

Ne jamais sacrifier les performances pour les animations.

---

# 17. GESTION DES ERREURS

Prévoir tous les états importants :

- chargement ;
- succès ;
- erreur ;
- aucune donnée ;
- absence de connexion ;
- serveur indisponible ;
- session expirée ;
- accès refusé.

Les erreurs techniques sensibles ne doivent jamais être affichées à l'utilisateur.

Afficher des messages simples et compréhensibles.

En cas de problème de compte, orienter l'utilisateur vers la RH.

---

# 18. MODE HORS CONNEXION

Prévoir une architecture permettant un fonctionnement partiel hors connexion.

L'utilisateur pourra notamment consulter certaines données déjà chargées.

Les actions réalisées hors connexion pourront être synchronisées lorsque la connexion revient.

Prévoir une gestion correcte des conflits de synchronisation.

---

# 19. BASE DE DONNÉES

Créer une base de données propre et évolutive.

Prévoir notamment :

- users ;
- roles ;
- permissions ;
- employees ;
- sites/chantiers ;
- missions ;
- schedules/plannings ;
- notifications ;
- problems ;
- photos/files ;
- validations ;
- activity logs.

Les relations doivent être propres et sécurisées.

---

# 20. BACKEND ET API

Créer un backend propre.

L'API doit gérer :

- authentification ;
- utilisateurs ;
- rôles ;
- planning ;
- missions ;
- chantiers ;
- problèmes ;
- photos ;
- validations ;
- notifications.

Chaque endpoint sensible doit vérifier :

1. utilisateur connecté ;
2. rôle ;
3. permission ;
4. propriété des données.

La création, modification, activation, désactivation et réinitialisation des comptes doit être protégée par les permissions RH appropriées.

---

# 21. JOURNAL D'ACTIVITÉ

Créer un système de logs permettant de savoir qui a effectué les actions importantes.

Exemples :

- création d'une mission ;
- modification d'un planning ;
- création d'un compte ;
- modification d'un compte ;
- désactivation d'un compte ;
- signalement d'un problème ;
- validation ;
- suppression ;
- modification importante.

Enregistrer notamment :

- utilisateur ;
- action ;
- date ;
- heure ;
- élément concerné.

---

# 22. PERFORMANCE

L'application doit être rapide.

Prévoir :

- chargement rapide ;
- cache intelligent ;
- pagination ;
- images optimisées ;
- requêtes optimisées ;
- chargement progressif ;
- animations légères.

L'application doit rester fluide sur des smartphones différents.

---

# 23. TESTS

Créer des tests pour les fonctions importantes.

Tester notamment :

- connexion ;
- permissions ;
- API ;
- planning ;
- notifications ;
- missions ;
- photos ;
- validations ;
- sécurité ;
- gestion des erreurs.

Tester également les tentatives d'accès non autorisées.

Tester notamment qu'un employé ne peut pas :

- créer un compte ;
- modifier le compte d'un autre utilisateur ;
- accéder aux données RH ;
- accéder aux données d'un autre employé ;
- modifier un planning sans permission.

---

# 24. ARCHITECTURE DU CODE

Organiser correctement le projet.

Séparer clairement :

**Mobile / Frontend**

**Backend / API**

**Base de données**

**Authentification**

**Notifications**

**Stockage**

**Sécurité**

**Tests**

Ne pas mettre toute l'application dans quelques gros fichiers.

Le code doit être modulaire et facilement maintenable.

---

# 25. ÉVOLUTIVITÉ

Construire l'application pour permettre d'ajouter plus tard :

- messagerie interne ;
- géolocalisation ;
- signature client ;
- feuilles d'heures ;
- gestion des congés ;
- statistiques avancées ;
- rapports de chantier ;
- documents ;
- espace client ;
- facturation ;
- pointage ;
- QR code ;
- système de présence.

Ne pas développer ces fonctionnalités maintenant si elles ne sont pas nécessaires, mais prévoir une architecture compatible.

---

# 26. PRODUCTION

Le projet doit pouvoir être préparé pour une vraie mise en production.

Prévoir :

- environnement développement ;
- environnement production ;
- variables d'environnement ;
- build ;
- gestion des erreurs ;
- logs ;
- sauvegardes ;
- sécurité ;
- documentation ;
- configuration mobile.

L'application devra pouvoir être préparée pour une distribution **Android et iOS**.

---

# 27. RÈGLE ABSOLUE

Je veux que tu travailles comme une **équipe professionnelle de développement mobile**.

Ne fais pas seulement une interface jolie.

Construis :

**une vraie application + un vrai backend + une vraie base de données + une vraie authentification + de vraies permissions + de vraies notifications + une vraie sécurité.**

Tout ce qui est créé doit être fonctionnel.

Si une technologie ou une architecture doit être choisie, choisis une solution moderne, stable, maintenable et adaptée à une application mobile professionnelle.

Ne mets jamais de secrets directement dans le code.

Ne simule pas une sécurité qui n'existe pas réellement.

Ne crée pas de faux boutons qui ne fonctionnent pas.

Ne remplis pas l'application avec de fausses fonctionnalités pour donner l'impression qu'elle est terminée.

---

# 28. MÉTHODE DE TRAVAIL

Construis Deep Clean progressivement mais **sans perdre la vision globale de l'application**.

Commence par :

1. créer le projet ;
2. mettre en place l'architecture ;
3. configurer la base de données ;
4. mettre en place l'authentification ;
5. créer les rôles et permissions ;
6. créer le backend/API ;
7. créer la navigation mobile ;
8. créer le système de planning ;
9. créer les missions ;
10. créer les chantiers ;
11. créer les signalements/photos ;
12. créer les validations ;
13. créer les notifications ;
14. créer les dashboards par rôle ;
15. sécuriser et tester l'ensemble ;
16. préparer la production.

À chaque étape, le code doit rester fonctionnel.

Avant de considérer le projet terminé, vérifie que les différentes parties communiquent réellement entre elles.

---

# 29. LIVRABLE FINAL

À la fin, je veux obtenir :

- le code complet ;
- une architecture propre ;
- une application mobile fonctionnelle ;
- un backend fonctionnel ;
- une base de données fonctionnelle ;
- une authentification sécurisée ;
- les rôles et permissions ;
- le système de comptes géré par la RH ;
- le planning ;
- les missions ;
- les chantiers ;
- les notifications ;
- les signalements avec photos ;
- les validations ;
- les dashboards ;
- les tests ;
- la documentation d'installation ;
- les instructions de lancement ;
- les instructions de build Android/iOS.

**Deep Clean doit être pensée comme une vraie application professionnelle destinée à être utilisée quotidiennement par une entreprise de nettoyage, et non comme un prototype.**

**La RH est le point central de la gestion des comptes. Aucun utilisateur ne peut créer son propre compte. En cas de problème de compte, l'utilisateur doit contacter la RH.**
