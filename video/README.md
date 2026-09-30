# Deep Clean — vidéo motion design (60 s)

Film de présentation de l'application **Deep Clean** (mobile + web), pensé comme
un showreel : 60 secondes, 1920 × 1080, 60 images/s, bande-son synthétisée et
calée à l'image près.

Rendus finaux (H.264 + AAC, lisibles partout) :

- `Deep-Clean-Motion-Design.mp4` — version de référence, 1080p à 60 i/s ;
- `Deep-Clean-Motion-Design-720p.mp4` — version légère (720p à 30 i/s) pour
  WhatsApp, l'e-mail ou les réseaux sociaux.

## Déroulé

| Temps | Scène | Ce qu'on voit |
|---|---|---|
| 0 → 6 s | **Le constat** | Papier, Excel, SMS, groupes WhatsApp s'accumulent ; « Tout est éparpillé. » — puis une raclette nettoie littéralement l'écran. |
| 6 → 12 s | **Révélation** | Une goutte tombe et devient le logo (morphing vectoriel), ondes, reflet ; « Une seule app. Tous les métiers. En temps réel. » ; le logo devient l'icône de l'app, qu'on ouvre. |
| 12 → 26 s | **Communication** | « De l'employé à la direction, tout se dit ici. » Conversation en direct, discussions individuelles et de groupe, échanges par équipe / chantier / mission, consignes liées aux missions, notifications ciblées, partage de documents. |
| 26 → 34 s | **Les rôles** | Cinq téléphones (vraies captures) : Employé, Chef d'équipe, Superviseur, RH, Direction — « Chacun voit exactement ce qui le concerne », accès sécurisés gérés par la RH. |
| 34 → 44 s | **Terrain & bureau** | Planning web synchronisé en temps réel avec le mobile, pointage en un geste (photo + GPS), signalement photo suivi jusqu'à sa validation, « 5 à 8 h récupérées chaque semaine ». |
| 44 → 52 s | **Commercial** | Prospect → Client → Devis → Chantier → Facture ; devis calculé ligne par ligne jusqu'au tampon ACCEPTÉ, facture PAYÉE sans ressaisie. |
| 52 → 60 s | **Finale** | « Une communication centralisée, organisée et toujours au bon endroit. » — implosion, logo, promesse, plateformes, signature KingDream Digital. |

## Comment c'est fabriqué

- `index.html` + `src/` : la composition. Une **timeline GSAP unique en pause**
  (`src/js/core.js`) ; chaque scène (`src/js/scenes/s1…s7`) y ajoute ses
  animations à des instants absolus, calés sur une grille musicale à 120 BPM
  (un temps = 0,5 s, une mesure = 2 s).
- Les interfaces sont soit les **vraies captures** de l'application
  (`application/presentation/shots/`), soit reconstruites en HTML/CSS à
  l'identique (`src/js/ui.js` : bulles, notifications, cartes mission…) pour
  pouvoir les animer élément par élément. Couleurs et typo (Inter) reprises de
  `application/mobile/src/theme`.
- Le logo goutte est vectorisé depuis le PNG officiel (`tools/build_assets.py`,
  potrace) pour permettre le morphing ; icônes Lucide (licence ISC).
- `render.js` ouvre la composition dans Chromium (Playwright), positionne la
  timeline image par image et capture chaque image : rendu déterministe, fluide
  quelle que soit la machine.
- `audio/soundtrack.py` synthétise toute la bande-son (aucun sample, aucun
  droit tiers) : musique Rém – Si♭ – Fa – Do à 120 BPM avec résolution en Ré
  majeur, et plus de 130 effets sonores placés sur les repères (`DC.cue`)
  déclarés par les scènes.

## Refaire le rendu

Prérequis : Node 18+, Python 3.10+ avec `numpy scipy imageio-ffmpeg`
(`pip install numpy scipy imageio-ffmpeg`), Chromium (celui de Playwright).

```bash
cd video
npm install
node render.js cues                 # repères son → out/cues.json
python3 audio/soundtrack.py         # → out/soundtrack.wav
node render.js frames --workers 4   # → out/frames/*.jpg (3 600 images, ~6 min)
node render.js encode               # → Deep-Clean-Motion-Design.mp4
node render.js encode --light       # → Deep-Clean-Motion-Design-720p.mp4
```

Le grain qui évite les bandes dans les dégradés sombres est un tramage fixe
par défaut. `VIDEO_QUERY=grain=film node render.js frames` le rend animé
comme un vrai grain de pellicule — plus organique, mais le fichier pèse alors
près de dix fois plus lourd (≈ 400 Mo au lieu de ≈ 45 Mo).

Outils de travail :

```bash
node render.js stills 6.2 14 27.5   # images fixes à des instants précis
node render.js sheet 12 26 0.5      # planche contact d'une scène
npx http-server .. -p 8080          # puis http://localhost:8080/video/ : lecteur
                                    # (espace = lecture/pause, ←/→ = ±1 s, ?t=12.5)
```

Si Chromium n'est pas au chemin par défaut : `CHROME_PATH=/chemin/vers/chrome`.
