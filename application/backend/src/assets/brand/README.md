# Logo pour les PDF générés

Fichiers tirés du logo officiel fourni par le client (cercle aux vagues,
goutte bleue, « DEEPCLEAN » marine et bleu clair, « SERVICE DE NETTOYAGE »).
Ils ont été vectorisés (potrace) puis exportés en PNG légers. Les sources
vectorielles sont dans `mobile/assets/brand/logo-*.svg`.

- `drop.png` : la goutte (240 px de haut) ;
- `title.png` : « DEEPCLEAN » (1200 × 168) ;
- `tagline.png` : « SERVICE DE NETTOYAGE » (1200 × 59).

Couleurs du logo : marine `#1F2D69`, bleu clair `#1E9CC6` (voir
`src/utils/pdfBrand.ts`).
- `emblem.png` : le médaillon (cercle, vagues, goutte), 480 × 480, ~12 Ko —
  le logo de l'icône de l'app, en tête et en pied de chaque PDF. Généré avec
  sharp à partir des tracés de `mobile/src/components/brandArtwork.ts`
  (mêmes couleurs que `BrandEmblem`).
