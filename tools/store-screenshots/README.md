# Captures App Store et Google Play

Des **affiches** vives et vendeuses (modèle « A — vif », choisi par le
client) autour de captures de l'application **réelle** (vrai serveur, vraie
base, données de démonstration) : 4 côté clients, 3 côté équipes.
Résultat : `application/presentation/store/ios-NN-*.png` (1290 × 2796,
iPhone 6,9") et `android-NN-*.png` (1080 × 2160).

Règles respectées (App Store, règles 2.3.3 et 2.3.7) : l'app est montrée en
usage (vraies captures, non retouchées), l'écran de connexion n'est pas une
capture, aucun prix, aucune remise, aucune note ni étoile, aucun chiffre
inventé — seulement des arguments vrais (devis gratuit, sans compte, réponse
sous 24 à 48 h, activité assurée…) ; pas de photo de vraies personnes côté
équipes (initiales à la place des photos) ; chaque écran est accessible avec
les comptes de démo.

## 1. Monter la démo

Base PostgreSQL vide et serveur configuré (`application/backend/.env`, avec
`CORS_ORIGINS="http://localhost:8099"`, `PORT=4100`,
`RATE_LIMIT_MAX_REQUESTS=100000`) — voir `docs/REPRISE-SESSION.md` §4.

```bash
cd application/backend
npx prisma db push
npx tsx prisma/seed.ts
npx tsx prisma/seedPresentationDemo.ts     # sans photos de vraies personnes
npx tsx src/server.ts &
```

Rendre les horodatages cohérents avec l'instant de capture (vendredi
16/10/2026, 8 h 40 à Paris — à adapter à la date du jour) :

```sql
-- Pointage en cours de Lucas Petit depuis 7 h 56 (heure de Paris)
UPDATE time_entries SET "clockIn" = '2026-10-16 05:56:00'
  FROM users u WHERE u.id = time_entries."userId" AND u.username = 'lpetit' AND "clockOut" IS NULL;
-- Ce que le script vient de créer est ramené juste avant l'instant de capture
UPDATE notifications SET "createdAt" = "createdAt" - ((now() AT TIME ZONE 'UTC') - timestamp '2026-10-16 06:40' + interval '4 min') WHERE "createdAt" > '2026-10-16 06:40';
UPDATE messages      SET "createdAt" = "createdAt" - ((now() AT TIME ZONE 'UTC') - timestamp '2026-10-16 06:40' + interval '4 min') WHERE "createdAt" > '2026-10-16 06:40';
UPDATE conversations SET "lastMessageAt" = "lastMessageAt" - ((now() AT TIME ZONE 'UTC') - timestamp '2026-10-16 06:40' + interval '4 min') WHERE "lastMessageAt" > '2026-10-16 06:40';
-- Notifications étalées dans le temps, les plus anciennes lues
WITH r AS (SELECT id, row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC, id) rn FROM notifications WHERE "createdAt" > '2026-10-16 06:00')
UPDATE notifications n SET "createdAt" = timestamp '2026-10-16 06:36' - (r.rn - 1) * interval '53 min', "isRead" = (r.rn > 3) FROM r WHERE r.id = n.id;
```

## 2. Application web et captures

```bash
cd application/mobile
EXPO_PUBLIC_API_URL=http://localhost:4100/api/v1 npx expo export -p web --output-dir /tmp/dc-web
python3 -m http.server 8099 --directory /tmp/dc-web &

cd tools/store-screenshots
npm init -y && npm install playwright@1.56.0     # Chromium déjà présent : ne pas lancer « playwright install »
OUT=/tmp/dc-raw node all.mjs                     # ONLY=1,P pour ne refaire que certains écrans
```

`P` = volet public (accueil, services, page d'un service, demande de devis
remplie puis **réellement envoyée** au serveur de démonstration).

`capture.mjs` fige l'heure du navigateur (`NOW`), le fuseau (Europe/Paris)
et la taille d'écran utile d'un iPhone 6,9" (430 × 844 pt, sans barre d'état
ni indicateur d'accueil).

## 3. Affiches

```bash
python3 tools/store-screenshots/posters.py /tmp/dc-raw
```

Les affiches sont des pages HTML/CSS (`posters/NN-*.html`, styles communs
`posters/style.css`, décor `posters/fx.js`) : textes, ordre et mise en page
se modifient là. Polices : `application/presentation/fonts` (Inter, licence
OFL) ; logos : `v2/assets/img`. Rendu par Chromium (`render-posters.mjs`).
