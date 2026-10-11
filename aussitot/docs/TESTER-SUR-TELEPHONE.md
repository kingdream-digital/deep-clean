# Tester Aussitôt sur téléphone

Même méthode que pour Deep Clean : Aussitôt tourne sur votre serveur (Coolify), et l'application s'ouvre sur le téléphone avec **Expo Go**, en scannant un QR code. Aussitôt s'installe **à côté** de Deep Clean, dans un projet Coolify séparé : Deep Clean n'est pas touché.

Compter 20 à 30 minutes la première fois (dont 10 à 15 minutes de construction automatique).

## Ce qu'il faut

- Le serveur de Deep Clean (Oracle Cloud + Coolify, voir `docs/DEPLOYMENT.md` à la racine du dépôt).
- L'application **Expo Go** sur le téléphone, connectée au même compte Expo que le serveur (comme pour Deep Clean).
- Facultatif : une clé d'API Anthropic pour l'assistant ([console.anthropic.com](https://console.anthropic.com)).

Dans ce guide, l'adresse du serveur est `141.253.112.12` (celle de Deep Clean). Les adresses en `sslip.io` sont gratuites et pointent automatiquement vers le serveur : n'importe quel nom avant l'IP fonctionne.

## Étape 1 — Mettre le serveur d'essai en ligne (Coolify, une seule fois)

1. Ouvrir Coolify : `http://141.253.112.12:8000`.
2. **Projects → + Add** : créer un projet **« Aussitôt »** (séparé de celui de Deep Clean).
3. Dans ce projet : **+ New → Private Repository (with Deploy Key)**, choisir **la même clé** que Deep Clean, puis le dépôt `kingdream-digital/deep-clean`.
   - **Branch** : `claude/deep-clean-voice-chat-euxhm0` (la branche d'Aussitôt ; `master` une fois la branche fusionnée)
   - **Build Pack** : `Docker Compose`
   - **Base Directory** : `/aussitot`
   - **Docker Compose Location** : `/docker-compose.coolify.yml`
4. **Domaines** (un champ par service, dans la page de la ressource) :

   | Service | Domaine |
   | --- | --- |
   | `web` (l'application dans un navigateur) | `http://aussitot.141.253.112.12.sslip.io:80` |
   | `api` | `http://api-aussitot.141.253.112.12.sslip.io:4000` |
   | `mailpit` (boîte mail de test) | `http://mail-aussitot.141.253.112.12.sslip.io:8025` |

   Le nombre après les deux-points est le port **à l'intérieur** du conteneur : les adresses publiques restent `http://aussitot.141.253.112.12.sslip.io`, etc. Rien à ouvrir dans le pare-feu : tout passe par le port 80, comme Deep Clean.

5. **Environment Variables** :

   | Variable | Valeur |
   | --- | --- |
   | `APP_PUBLIC_URL` | `http://aussitot.141.253.112.12.sslip.io` |
   | `API_PUBLIC_URL` | `http://api-aussitot.141.253.112.12.sslip.io` |
   | `ANTHROPIC_API_KEY` | votre clé (facultatif : sans elle, l'assistant est indiqué comme non activé) |

   Les variables `SERVICE_PASSWORD_…` et `SERVICE_HEX_…` sont des **secrets générés par Coolify** : ne pas les modifier. `DEMO_SEED=1` charge une entreprise de démonstration au premier démarrage (mettre `0` pour un serveur vide).

6. **Deploy**, puis attendre le statut **Running** (la première construction prend 10 à 15 minutes).
7. Vérifier dans un navigateur :
   - `http://api-aussitot.141.253.112.12.sslip.io/ready` affiche `{"status":"ready","database":true,"redis":true}` ;
   - `http://aussitot.141.253.112.12.sslip.io` affiche l'écran de connexion d'Aussitôt.

**Connexion de démonstration** : code entreprise `deep-clean`, identifiant `bcorsiez` (administrateur), mot de passe `DemoAussitot2026!`. Autres comptes : `mdupuis` (RH), `ytraore` (superviseur), `kbenali` (chef d'équipe), `lpetit` (employé) — même mot de passe.

## Étape 2 — Ouvrir l'application sur le téléphone (Expo Go)

Sur le serveur, en SSH (comme pour le serveur Expo de Deep Clean) :

```bash
# Une seule fois : une copie de travail séparée, sur la branche d'Aussitôt
# (le dossier ~/deep-clean de Deep Clean n'est pas modifié)
git -C ~/deep-clean fetch origin
git -C ~/deep-clean worktree add --track -b claude/deep-clean-voice-chat-euxhm0 ~/aussitot-essai origin/claude/deep-clean-voice-chat-euxhm0

# Une seule fois : être connecté au même compte Expo que l'application Expo Go du téléphone
cd ~/aussitot-essai/aussitot/apps/app && npx expo login

# À chaque fois : dans une session tmux, pour que le serveur reste allumé après la déconnexion
tmux new -s aussitot
bash ~/aussitot-essai/aussitot/infra/essai/expo-go.sh http://api-aussitot.141.253.112.12.sslip.io
```

Le script récupère la dernière version du code, installe ce qui manque, vérifie que l'API répond, puis affiche un **QR code**. Il utilise le port 8082 : le serveur Expo de Deep Clean (8081) peut continuer à tourner.

- **Android** : ouvrir Expo Go → « Scan QR code ».
- **iPhone** : viser le QR code avec l'appareil photo.

Pour quitter tmux sans arrêter le serveur : `Ctrl + B`, puis `D`. Pour y revenir : `tmux attach -t aussitot`.

### Ce qui fonctionne dans Expo Go

Tout, sauf deux fonctions qui demandent la version installée de l'application :

| Fonction | Expo Go | Remarque |
| --- | --- | --- |
| Accueil, planning, ventes, devis, factures et leurs PDF, clients, équipe, notifications, réglages, identité visuelle | oui | |
| Assistant (à l'écrit) | oui | avec `ANTHROPIC_API_KEY` |
| Dictée vocale | non | l'app l'indique et propose d'écrire ; voir « Aller plus loin » |
| Notifications push | non | le centre de notifications et le temps réel fonctionnent |

### Voir les emails envoyés

Sur le serveur d'essai, aucun email ne part réellement : devis, factures et relances arrivent dans la boîte de test, avec leur PDF et le logo de l'entreprise. Ouvrir `http://mail-aussitot.141.253.112.12.sslip.io` : identifiant `aussitot`, mot de passe = valeur de `SERVICE_PASSWORD_MAILPIT` (Coolify → Environment Variables). Pour envoyer de vrais emails, renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `MAIL_FROM_ADDRESS`.

## Après une modification du code

Comme pour Deep Clean, Coolify ne redéploie pas tout seul :

1. Coolify → ressource Aussitôt → **Redeploy** (les migrations de la base s'appliquent automatiquement).
2. Sur le serveur : `tmux attach -t aussitot`, `Ctrl + C`, puis relancer le script (il récupère le nouveau code).

## Aller plus loin

### La dictée vocale sur téléphone

- **Android, version installable de développement** (une fois, compte Expo gratuit) :

  ```bash
  cd ~/aussitot-essai/aussitot/apps/app
  npx eas-cli init                                            # relie le projet à votre compte Expo
  npx eas-cli build --profile development --platform android  # lien vers l'APK à installer sur le téléphone
  DEV_CLIENT=1 bash ~/aussitot-essai/aussitot/infra/essai/expo-go.sh http://api-aussitot.141.253.112.12.sslip.io
  ```

  On ouvre ensuite l'application installée « Aussitôt » au lieu d'Expo Go, et on scanne le même QR code. iPhone : il faut un compte Apple Developer (99 $/an).

- **Un vrai nom de domaine en HTTPS** (par exemple `aussitot.votre-domaine.fr`) : le navigateur du téléphone (Chrome sur Android, Safari sur iPhone) donne alors accès à la dictée vocale, sans rien installer. Les adresses `sslip.io` ne permettent pas d'obtenir un certificat HTTPS de façon fiable, et le micro du navigateur exige HTTPS.

### Créer votre propre entreprise de test

Dans Coolify → ressource Aussitôt → service `api` → **Terminal** :

```bash
node -e "fetch('http://localhost:4000/v1/platform/organizations',{method:'POST',headers:{'content-type':'application/json','x-platform-token':process.env.PLATFORM_ADMIN_TOKEN},body:JSON.stringify({slug:'mon-entreprise',name:'Mon Entreprise',admin:{firstName:'Prénom',lastName:'Nom'}})}).then(r=>r.json()).then(r=>console.log(r.admin?.user?.username, r.admin?.temporaryPassword ?? r))"
```

La commande affiche l'identifiant et le mot de passe temporaire de l'administrateur ; à la première connexion, il choisit son mot de passe.

## Dépannage

| Problème | Solution |
| --- | --- |
| Le déploiement échoue | Coolify → Deployments → lire le journal ; vérifier Base Directory (`/aussitot`) et Docker Compose Location, qui reviennent parfois à leur valeur par défaut (même souci que pour Deep Clean). |
| `/ready` ne répond pas | Vérifier le domaine du service `api` (avec `:4000`) et le statut Running. |
| L'app affiche « Pas de connexion internet » | Ouvrir l'adresse `/ready` dans le navigateur du téléphone ; vérifier `API_PUBLIC_URL` et l'adresse passée au script. |
| Le QR code ne s'ouvre pas | Même compte Expo sur le serveur (`npx expo login`) et dans Expo Go ; relancer le script. |
| Deux tunnels refusés en même temps | Arrêter un moment le serveur Expo de Deep Clean, ou l'inverse. |
| Recharger la démonstration de zéro | Coolify → ressource → supprimer les volumes (base de données), puis Redeploy : **toutes** les données d'essai sont effacées. |

Rappel : ce serveur d'essai utilise des mots de passe de démonstration publics et le protocole HTTP. Il sert aux essais, avec des données fictives ; un service réel se déploie en HTTPS (voir [DEPLOIEMENT.md](DEPLOIEMENT.md)).
