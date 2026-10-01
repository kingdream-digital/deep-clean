# Dossier de reprise — où en est le projet, et comment continuer

Ce document existe pour qu'une **nouvelle session Claude** (ou une autre
personne, ou un autre compte) reprenne le travail exactement là où il s'est
arrêté, sans rien redécouvrir et sans rien perdre.

> À lire en premier, avant `CLAUDE.md` et avant de toucher au code.
> Dernière mise à jour : 1er octobre 2026.

---

## 1. État à l'instant T

| | |
|---|---|
| **Branche de travail** | `feat/messagerie-groupe` (poussée sur GitHub) |
| **Commits** | Voir le journal de bord ci-dessous (et `git log`) |
| **`master`** | **Pas touché.** Le site en ligne tourne toujours sur l'ancienne version. |
| **Déployé en ligne ?** | **Non.** Rien n'a été redéployé. |
| **Tests** | 238 backend + 41 mobile, **tous au vert** |
| **En attente de** | La validation du client sur la démo (voir §2) |

### Journal de bord (mis à jour au fil du travail)

> Cette section est actualisée **à chaque lot terminé**, pour qu'une coupure
> ne fasse jamais perdre le fil. Chaque lot est testé, commité et poussé avant
> d'être inscrit ici.

| # | Lot | Statut |
|---|---|---|
| 1 | Messagerie de groupe, appel, partage de documents | ✅ commit `a846301` |
| 2 | Dossier de reprise + captures versionnées | ✅ commits `3f6f952`, `fdf0f82` |
| 3 | Outils d'audit visuel versionnés (`tools/audit-visuel/`) | ✅ commit `dba68b5` |
| 4 | Revue complète de l'application, écran par écran | 🔄 en cours — employé ✅ `8461838`, encadrement ✅ (voir `git log`) |

**Déjà revu et corrigé :**

- *Accueil employé* — le titre des missions était coupé (« Désinfection salles
  de c… ») : passé sur deux lignes dans `MissionCard`, partout dans l'app.
- *Accueil employé* — une mission du matin jamais démarrée était encore
  annoncée « PROCHAINE MISSION » l'après-midi, laissant croire qu'il fallait
  s'y rendre. Elle est maintenant signalée « MISSION NON DÉMARRÉE », et la
  prochaine mission est réellement la suivante à venir.
- *Accueil (tous rôles)* — « Activité récente » n'affichait que des
  notifications de messagerie, qui noyaient toute l'activité métier alors
  qu'elles ont déjà leur onglet. Nouveau filtre d'API `excludeMessages`.
- *Comptes utilisateurs (RH)* — la liste n'affichait que des initiales alors
  que les photos de profil existaient déjà : composant `Avatar` partagé.
- *Menu, Profil, Commercial* — titre affiché deux fois sur téléphone (« Menu »
  dans l'en-tête puis « Menu » en grand juste dessous). Menu n'a plus d'en-tête
  (comme la Messagerie) ; Profil et Commercial gardent la flèche retour sans
  texte. `title` reste renseigné : il nomme l'onglet du navigateur sur web.
- *Planning (semaine)* — la bande des jours était un dégradé qui partait de la
  couleur du fond : coin gauche invisible, seul le coin droit apparaissait,
  comme une carte mal coupée. Fond uni, raccord avec l'en-tête.
- *Dates, partout* — « Jeudi 1 octobre » au lieu de « Jeudi 1er octobre ».
  Toute date avec le jour du mois passe par `utils/frenchDate.ts`
  (`frenchDateFormat()` au lieu de `new Intl.DateTimeFormat("fr-FR", …)`).
- *Cartes de mission* — une mission jamais démarrée dont l'horaire est passé
  restait « PLANIFIÉE » dans Planning et Missions alors que l'accueil la
  signalait « non démarrée ». Règle unique `isMissionOverdue()`
  (`utils/missionFormat.ts`) : badge « Non démarrée » et carte en orange,
  partout. Affichage seulement, le statut en base ne change pas.
- *Cartes de mission* — le badge de statut débordait de la carte quand il ne
  tenait pas à côté de l'équipe (3 personnes + « TERMINÉE », ou « NON
  DÉMARRÉE ») : il passe désormais à la ligne, calé à droite.

**Revue des rôles d'encadrement (RH, superviseur, directeur, chef d'équipe)**
— demande du client : « si tu vois des design pas cohérent change et rend
l'app plus moderne type Apple ».

- *Accueil* — les tuiles « En un coup d'œil » se mettaient à 3 ou 4 de front
  sur téléphone : libellés coupés en plein mot (« Chantie / rs »). Deux par
  ligne au plus sous 600 px ; une tuile seule prend la ligne, en long.
  Libellés précisés (« Comptes actifs sur 12 », « Employés actifs sur 6 »).
- *Accueil superviseur* — il recevait le tableau de bord de l'**employé**
  (branche manquante dans `useDashboardData.ts`) : « Mes signalements » qui
  comptait toute l'entreprise, et une mission d'un autre présentée comme la
  sienne avec « Prévenez votre chef d'équipe ». Il a maintenant le sien :
  missions du jour, non démarrées de la semaine, pointages à valider,
  signalements ouverts.
- *Accueil, mini-planning* — noms de chantiers coupés en 9 px (« Cow… ») :
  pastilles à la couleur du chantier sur téléphone, noms gardés sur grand écran.
- *Accueil, accès rapide* — Planning et Missions retirés : déjà dans la barre
  d'onglets.
- *Pointage* — « Vous n'êtes pas pointé » (masculin pour tout le monde) →
  « Vous n'êtes pas en poste », pendant de « En poste ». Visite guidée :
  « Vous êtes prêt / prête » → « Tout est prêt », « vous seule » → neutre.
- *Listes de personnes* (Comptes, Équipes, Mon équipe, Dossiers d'heures) —
  une carte par personne → liste groupée façon iOS (`components/GroupedList.tsx`),
  rangée par rôle et par nom (`groupByRole`, `utils/roleLabels.ts`), avec les
  photos (Dossiers d'heures affichait des initiales).
- *Titres* — l'écran porte le nom du lien du Menu (`navigation/screenTitles.ts`) :
  « Équipes » / « Mon équipe » au lieu de « Comptes », « Mes chantiers »,
  « Validation des congés » (le Menu affichait deux fois « Congés & absences »),
  « Mes absences ».
- *Menu* — sous-titres raccourcis, plus aucun n'est coupé.
- *Écrans vides* — « Rien à afficher » + la même idée en petit → un vrai titre
  (« Aucun pointage à valider », « Aucune notification »…), réglé une fois dans
  `StateView`.
- *Chantiers* — plus de grand bandeau vide quand il n'y a pas de photo.
- *Problèmes* — le problème en titre, le lieu en dessous (l'adresse passait
  avant, sur trois lignes, et coupait le titre).
- *Congés* — soldes en « 0,08 » et non « 0.08 » (`utils/leaveDays.ts`).
- *Commercial* — « DeepClean » → « Deep Clean ».
- *En-têtes* — titres dans la police de l'app (Inter), réglage commun
  `navigation/stackScreenOptions.ts` au lieu de cinq copies.
- *Ordinateur, planning d'équipe* — les missions non démarrées sont signalées
  (orange + icône), comme sur téléphone.

Captures avant/après : `docs/captures-revue-ecrans/`.

**Essayé puis écarté :** la police Inter dans la barre d'onglets du bas. La
barre a une hauteur fixe qui ne laisse que 10 px au libellé : le bas des
lettres était coupé (« Plannina »). On garde la police système, comme les
apps d'Apple, plutôt que de toucher à la hauteur de la barre (risque sur
iPhone et Android).

**Reste à passer en revue :** détail d'une mission, fiche chantier, fiche de
compte, pointage, congés (formulaires), module commercial, statistiques,
états d'erreur et de chargement, mode hors connexion.

### Ce qui bloque la mise en ligne

**Uniquement l'accord du client.** Il a demandé explicitement :
« rend moi une démo avant que je valide et pousse vers le redéploiement ».
La démo lui a été envoyée sous forme de page web avec les captures avant/après.

**Ne jamais pousser sur `master` ni redéployer sans son « c'est bon ».**

---

## 2. Ce qui a été fait dans cette session

### Demandes explicites du client (toutes faites)

1. **Messagerie de groupe** — créer un groupe nommé, y mettre plusieurs
   collègues, écrire à tout le monde en même temps.
2. **Bouton téléphone en haut à droite** d'une conversation — appel direct à
   deux, choix du participant dans un groupe.
3. **Partage de document** — PDF joint à un message, en plus des photos.

### Corrections trouvées en faisant tourner l'application pour de vrai

| Problème | Statut |
|---|---|
| Barre latérale web qui écrasait tout sur un téléphone (un mot par ligne) | Corrigé — barre d'onglets du bas sous 900 px |
| Boutons flottants « + » illisibles en mode sombre, **dans toute l'app** | Corrigé — nouveau token `accentFill` |
| Badge de l'onglet Messagerie qui comptait double (10 pour 5 messages) | Corrigé — compteur `unreadCountExcludingMessages` |
| Photos de profil absentes de la messagerie alors qu'elles existaient | Corrigé — composant `Avatar` partagé |
| Conversation étalée d'un bord à l'autre sur grand écran | Corrigé — colonne de lecture 860 px |
| Ligne vide dans une fiche de poste qui bloquait tout l'enregistrement | Corrigé — `utils/validation.ts::stringList` |
| **15 tests déjà cassés avant cette session** | Corrigés (voir §6) |

### Fichiers créés

```
application/backend/src/db/migrateMessagesToConversations.ts   reprise des anciens fils
application/backend/src/utils/validation.ts                     stringList() — lignes vides ignorées
application/mobile/src/components/Avatar.tsx                    avatar photo/initiales + avatar de groupe
application/mobile/src/utils/roleLabels.ts                       libellés des rôles, source unique
application/mobile/src/screens/inbox/NewGroupScreen.tsx          création d'un groupe
application/mobile/src/screens/inbox/ConversationInfoScreen.tsx  fiche du fil / du groupe
application/mobile/src/screens/inbox/AddParticipantsScreen.tsx   ajout de participants
application/mobile/src/screens/inbox/RenameGroupScreen.tsx       renommage du groupe
```

La documentation technique détaillée est dans
`application/docs/ARCHITECTURE.md`, section **« Messagerie interne »** —
elle a été réécrite entièrement et fait foi.

### Captures montrées au client

Les captures avant/après envoyées pour validation sont conservées dans
`docs/captures-messagerie-groupe/` (elles survivent ainsi à la session et au
compte sur lequel la démo avait été publiée) :

| Fichier | Ce qu'il montre |
|---|---|
| `avant-fil.jpg` / `apres-fil-groupe.jpg` | Conversation : avant (à deux) / après (groupe, document PDF, bouton d'appel) |
| `avant-accueil-telephone.jpg` / `apres-accueil-telephone.jpg` | L'app sur téléphone : écrasée par la barre latérale / lisible |
| `avant-liste-bureau.jpg` / `apres-bureau-fil.jpg` | Grand écran : pleine largeur / colonne de lecture centrée |
| `apres-liste.jpg` | Liste des conversations avec photos et groupes |
| `apres-nouveau-message.jpg`, `apres-creation-groupe.jpg`, `apres-infos-groupe.jpg` | Parcours de création et de gestion d'un groupe |
| `apres-sombre-fil.jpg`, `apres-sombre-missions.jpg` | Mode sombre après correction du contraste |

---

## 3. Décisions prises (ne pas les refaire autrement sans raison)

- **Un groupe = 3 personnes minimum** (le créateur + 2). À deux, c'est une
  conversation directe : en créer un « groupe » doublonnerait le fil existant.
- **404 et jamais 403** quand quelqu'un essaie d'accéder à un fil dont il
  n'est pas membre : on ne révèle même pas que le fil existe. C'est la
  convention de tout le projet.
- **Documents : PDF uniquement** (+ photos). C'est le seul format dont le
  serveur peut vérifier le **contenu réel** (signature `%PDF-`) et non le type
  déclaré par le client, qui est falsifiable. *Le client a été prévenu et peut
  demander Word/Excel — il faudra alors valider la signature ZIP et le
  `[Content_Types].xml`, pas juste accepter l'extension.*
- **Les colonnes `recipientId` / `isRead` / `readAt` de `messages` sont
  conservées** en base le temps de valider la reprise des anciens fils. Elles
  ne sont **plus ni lues ni écrites**. On pourra les supprimer dans quelques
  semaines, une fois la mise en ligne confirmée stable.
- **La reprise des anciens fils est automatique au démarrage du serveur**
  (sous verrou PostgreSQL, idempotente), volontairement : oubliée après un
  redéploiement, les conversations existantes disparaîtraient de l'écran des
  utilisateurs.
- **`accent` ≠ `accentFill`** : `accent` sert au texte/icône sur fond neutre
  (valeur très vive en mode sombre) ; `accentFill` sert aux **aplats** portant
  du contenu clair. Ne jamais mettre `colors.accent` en `backgroundColor` sous
  du texte `onAccent`. C'est écrit dans `mobile/src/theme/colors.ts`.

---

## 4. Remonter l'environnement de développement (environnement neuf)

Testé et fonctionnel dans un conteneur vierge. ~5 minutes.

```bash
# 1. PostgreSQL local (pas de Docker nécessaire si postgres est installé)
PGBIN=/usr/lib/postgresql/16/bin
mkdir -p /tmp/pgdata && chown -R postgres:postgres /tmp/pgdata
su postgres -c "$PGBIN/initdb -D /tmp/pgdata -U postgres --auth=trust"
su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -o '-p 5432 -k /tmp' start"
psql -h localhost -U postgres -c "ALTER USER postgres PASSWORD 'postgres';" \
  -c "CREATE DATABASE deep_clean;" -c "CREATE DATABASE deep_clean_test;"

# 2. Dépendances
cd application/backend && npm ci
cd ../mobile && npm ci

# 3. Backend : créer .env (jamais committé)
cd ../backend
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deep_clean?schema=public
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET : openssl rand -base64 48
# CORS_ORIGINS="http://localhost:8081"
# RATE_LIMIT_MAX_REQUESTS=100000   (sinon les tests Playwright épuisent le quota)
cp .env.test.example .env.test   # puis remplacer le port 5433 par 5432
echo 'UPLOAD_DIR="uploads-test"' >> .env.test

npx prisma generate
npx prisma db push                                   # base de dev
npx dotenv -e .env.test -- prisma db push            # base de test
npx tsx prisma/seed.ts                               # compte admin technique
npx tsx prisma/seedPresentationDemo.ts               # jeu de démo complet

# 4. Lancer
npx tsx src/server.ts &                              # API sur :4000
cd ../mobile && echo 'EXPO_PUBLIC_API_URL="http://localhost:4000/api/v1"' > .env
CI=1 BROWSER=none npx expo start --web --port 8081 & # app sur :8081
```

### Comptes de démo

Mot de passe commun : `DemoClean2026!`

| Identifiant | Rôle |
|---|---|
| `mdupont` | RH |
| `jlefevre` | Directeur |
| `ytraore` | Superviseur |
| `kbenali`, `smartin` | Chef d'équipe |
| `lpetit`, `erousseau`, `ngirard`, `csimon` | Employé |

Le seed de démo **ne met pas de numéro de téléphone**. Pour démontrer le
bouton d'appel, en ajouter :

```sql
UPDATE users SET phone='+33 6 12 34 56 78' WHERE username='mdupont';
```

---

## 5. Pièges rencontrés (vous feront gagner des heures)

- **Metro en mode CI ne recharge pas les fichiers, et son cache disque survit
  au redémarrage.** `CI=1` évite un plantage de React Native DevTools sous
  root, mais désactive la surveillance des fichiers. Après chaque modification
  du code mobile, relancer **avec `--clear`** :
  `CI=1 BROWSER=none npx expo start --web --port 8081 --clear`.
  Sans cette option, Metro ressert le bundle d'avant la modification et on
  croit vérifier le nouveau code. En cas de doute, observer les requêtes
  réellement émises par la page (`page.on("request", …)`) : c'est ainsi que le
  piège a été repéré.
- **Les tests backend doivent tourner en série.** `npm test` inclut
  `--runInBand`. Un `npx jest` nu fait tourner les suites en parallèle, elles
  se vident la base entre elles et ~130 tests échouent sans raison réelle.
- **React Navigation garde les écrans précédents montés dans le DOM** (en
  `pointer-events: none`). Un `getByText(...).first()` de Playwright tombe
  souvent sur l'occurrence d'un écran **invisible**, et le clic expire. Il
  faut ne cliquer que sur l'élément qui recevrait vraiment le clic :

  ```js
  // Renvoie le point cliquable du texte réellement visible
  const point = await page.evaluate(({ text }) => {
    const candidates = [...document.querySelectorAll("div,span")].filter((el) => {
      if ((el.textContent || "").trim() !== text || el.children.length > 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    });
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x, y };
    }
    return null;
  }, { text });
  await page.mouse.click(point.x, point.y);
  ```

- **Le mode sombre ne suit pas le réglage du système** : c'est volontaire
  (demande du client, l'app est claire par défaut). Pour tester le sombre,
  forcer avant le chargement de la page :
  `localStorage.setItem("deepclean.themePreference", "dark")`.
- **La visite guidée (onboarding) bloque les captures** : elle se relance tant
  qu'elle n'est pas marquée vue **par utilisateur**. La neutraliser avant le
  premier rendu : `localStorage.setItem("deepclean.onboardingSeen." + userId, "1")`.
- **`pkill -f "expo start"` dans la même commande que `npx expo start` tue
  la commande elle-même** (le motif figure dans sa propre ligne de commande).
  Arrêter Metro dans un appel séparé, avec le motif `"[e]xpo start"`.
- **`page.mouse.wheel()` ne fait défiler que ce qui est sous la souris** :
  `page.mouse.move(195, 600)` d'abord, sinon la capture reste en haut.
- **Chromium pour Playwright est déjà installé** dans l'environnement :
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, à lancer avec
  `--no-sandbox`. Ne pas lancer `playwright install`.

---

## 6. Les 15 tests qui étaient déjà cassés, et pourquoi

Ils ne l'étaient pas à cause du nouveau travail : des **règles métier avaient
changé sur demande du client sans que les tests suivent**. Corrigés en alignant
les tests sur les règles validées, jamais l'inverse :

| Test | Règle réelle (qui fait foi) |
|---|---|
| `missions`, `stats` | Une mission exige **au moins un employé affecté** |
| `problems` | Le **chef d'équipe ne crée plus le planning** — c'est le superviseur |
| `problems` | La **RH peut signaler un problème** (elle en était exclue à l'origine) |
| `standards` | Un employé ne voit les standards **que des chantiers dont il est membre** |
| `missions` | Accès refusé à une mission non visible = **404**, pas 403 |
| `missions` | Celui qui **reste** affecté n'est pas renotifié par une modification |

**Leçon pour la suite :** quand le client fait évoluer une règle, mettre à jour
les tests dans la foulée. Sinon la suite devient rouge et on ne sait plus ce
qui est un vrai bug.

---

## 7. Mise en ligne, le jour où le client valide

```bash
# 1. Passer le travail sur master
git checkout master && git pull origin master
git merge feat/messagerie-groupe
git push origin master
```

2. Dans **Coolify** (`http://141.253.112.12:8000`) : redéployer **le backend**,
   puis **le web** (Actions → Redeploy pour chacun).

3. **Obligatoire, une seule fois**, dans le Terminal du backend sur Coolify :

   ```bash
   npx prisma db push
   ```

   Crée les tables `conversations` et `conversation_participants`. Sans cette
   commande, la messagerie ne fonctionne plus.

4. La **reprise des anciennes conversations est automatique** au démarrage
   suivant. Pour la relancer à la main si besoin :
   `npx tsx src/db/migrateMessagesToConversations.ts`

5. Vérifier après coup : ouvrir la messagerie avec un compte qui avait déjà des
   conversations — elles doivent être là, avec leur historique et leurs non-lus.

Le détail de l'infrastructure (serveur, pare-feu, variables, pièges Coolify
déjà rencontrés) est dans **`docs/DEPLOYMENT.md`**.

---

## 8. Pistes pour la suite (rien n'est engagé)

Par ordre d'intérêt pour le client, à lui faire valider avant de démarrer :

1. **Documents Word/Excel** dans la messagerie, si le client le demande
   (validation de signature à faire sérieusement, cf. §3).
2. **Accusé de lecture** dans un groupe (« lu par 3 personnes ») — la donnée
   existe déjà (`lastReadAt` par participant), il ne manque que l'affichage.
3. **Suppression des colonnes legacy** `recipientId`/`isRead`/`readAt` de la
   table `messages`, une fois la mise en ligne stable.
4. **Messages en temps réel** (websockets) à la place du sondage toutes les
   5 secondes, si le volume d'échanges augmente.
5. **Photo de groupe** personnalisable (actuellement : avatars des membres
   superposés).

---

## 9. Règles de travail avec ce client

- **Toujours en français**, y compris le raisonnement affiché. Il écrit au
  téléphone, souvent avec des fautes de frappe : répondre simplement, sans
  jargon, phrases courtes.
- **Il valide avant toute mise en ligne.** Lui montrer des **captures
  d'écran réelles** de l'application qui tourne (il a demandé explicitement :
  « des photo de ce que tu a changer et des rendu, pas de vidéo »).
- **Ne jamais livrer de faux boutons ni de fonctionnalités simulées**
  (`CLAUDE.md` §27). Tout ce qui est montré doit marcher pour de vrai.
- Ses retours successifs sont consignés dans `application/CLAUDE.md` avec la
  mention « retour explicite du client (validé) » : **cette liste fait foi**,
  y compris quand elle contredit un ancien choix technique.
