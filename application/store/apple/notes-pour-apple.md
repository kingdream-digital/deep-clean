# Notes pour l'équipe de validation d'Apple (App Review)

Où : App Store Connect → votre app → version 1.0.0 → **Informations de validation de l'app**
(« App Review Information »). Ces informations ne sont **pas publiques**.

## 1. Coordonnées (à remplir)

Apple appelle ou écrit à cette personne si la validation bloque.

```
Prénom :     [à remplir]
Nom :        [à remplir]
Téléphone :  [à remplir, avec l'indicatif +33]
E-mail :     [à remplir]
```

## 2. Compte de démonstration (« Connexion requise » : cochée)

Apple doit pouvoir se connecter. **Ne jamais donner un vrai compte de salarié.**
Faire créer par la RH (ou le compte administrateur) **deux comptes dédiés** sur le
**vrai serveur**, avec un mot de passe long, puis les **supprimer ou désactiver**
dès que l'app est validée :

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Employé | [à créer] | [à créer] |
| RH | [à créer] | [à créer] |

Le serveur doit être **allumé et joignable en HTTPS** pendant toute la validation
(compter 1 à 3 jours) : sinon Apple refuse l'app (« impossible de se connecter »).

## 3. Texte à coller dans « Notes » (en anglais)

```
Deep Clean is the internal workforce-management app of Deep Clean, a cleaning company in France. It is used by the company's employees, team leaders, supervisors, HR and management.

ACCOUNTS
There is no public sign-up, by design. Accounts are created by the company's HR department from the HR area of the app: employees receive a username and a temporary password from HR and choose their own password at first login. For this reason there is no "Create account" button and no third-party sign-in. We intend to distribute the app as an UNLISTED app (employees install it from a direct link).

DEMO ACCOUNTS (production server, demo data)
Employee - username: [USERNAME] / password: [PASSWORD]
HR - username: [USERNAME] / password: [PASSWORD]

WHERE TO LOOK
1. Log in as the Employee: Home (current shift, clock in/out), Planning, Missions -> open a mission (job sheet with checklist, "Signaler un problème" to report an issue), Menu -> "Mes heures" (hours), Messagerie (internal chat and notifications).
2. Log in as HR: Menu -> "Comptes utilisateurs" (HR creates accounts for colleagues), "Validation des heures", "Validation des congés".

PERMISSIONS (each one is only requested when the user taps the related action)
- Camera: proof photo when an employee clocks in/out, photos attached to problem reports and messages, profile picture.
- Location (When In Use only): read once at clock-in/out as proof of presence at the work site. The app never tracks location continuously or in the background.
- Photos: only pictures the user picks (system picker).
- Face ID: optional, to unlock an already saved session.
- Notifications: new / changed / cancelled mission, new instruction.

DATA AND PRIVACY
No ads, no tracking, no analytics or crash-reporting SDK, no in-app purchase. Photos attached to problem reports are deleted automatically after 14 days. The privacy policy, support page and account-deletion page are linked in App Store Connect.

ACCOUNT DELETION
Accounts are provisioned and managed by the employer, not self-created. A user who wants their account deleted asks the HR department (process described on the account-deletion page and in the privacy policy); HR deactivates the account immediately and the data is deleted within one month, except records the employer must keep by law (payroll and working-time records).

The app needs a connection to the company server (HTTPS). If you cannot log in, please contact us before rejecting the build.
```

Remplacer `[USERNAME]` et `[PASSWORD]` par les deux comptes de la section 2.

## 4. Risque connu : suppression de compte dans l'app

La règle 5.1.1(v) d'Apple demande, pour une app qui « permet de créer un compte »,
un moyen de **demander la suppression du compte depuis l'app**. Ici, les comptes
sont créés par la RH (pas d'inscription), et la suppression passe par la RH : c'est
expliqué dans les notes ci-dessus, et c'est un cas courant pour les apps
d'entreprise. **Mais Apple peut tout de même demander un bouton dans l'app.**

Si c'est le cas : on ajoute dans *Profil* un bouton « Demander la suppression de
mon compte » qui prévient la RH (petite évolution : une route serveur, une
notification, un écran, des tests). À demander à Claude le moment venu — ce n'est
pas nécessaire avant d'avoir la réponse d'Apple.

## 5. Distribution non répertoriée (recommandée)

Voir `docs/PUBLICATION-STORES.md`, étape 7 : une fois l'app **soumise** à la
validation, ajouter dans ces notes la phrase « We intend to distribute this app as
an unlisted app » (déjà présente dans le texte ci-dessus), puis envoyer le
formulaire de demande d'Apple.
