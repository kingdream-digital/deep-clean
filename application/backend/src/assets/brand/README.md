# Logo pour les PDF générés

`logo-mark.png` est une version recadrée et réduite de
`mobile/assets/brand/mark-ink.png` (le pictogramme noir, pour un fond
clair), utilisée par `modules/timesheets/timesheets.export.ts` pour l'en-tête
des PDF générés côté serveur. Régénérée avec :

```bash
node -e "
const sharp = require('sharp');
sharp('../mobile/assets/brand/mark-ink.png')
  .trim()
  .resize({ width: 240, height: 240, fit: 'inside' })
  .png({ compressionLevel: 9, palette: true })
  .toFile('src/assets/brand/logo-mark.png');
"
```

Ne jamais utiliser directement le fichier source (`mobile/assets/brand/mark-ink.png`,
~100 Ko) ou `logo.png`/`pharse sous logo.png` à la racine du dépôt (souvent
la version presque blanche, invisible sur un fond de page clair) : `logo-mark.png`
est recadré (marges transparentes retirées) et compressé pour que chaque PDF
reste léger malgré le logo embarqué sur chaque page.
