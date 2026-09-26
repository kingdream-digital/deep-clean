# Présentation Deep Clean

Deck de vente au format PDF, généré depuis `index.html` via Playwright.

## Régénérer le PDF

```bash
npm install playwright
node render.js
```

Cela produit `Deep-Clean-Presentation-KingDream.pdf` dans ce dossier, à partir de `index.html` (mise en page) et des polices/images dans `fonts/`, `assets/` et `shots/` (captures d'écran réelles de l'application).
