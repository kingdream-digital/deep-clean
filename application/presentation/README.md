# Présentation Deep Clean

Deck de vente au format PDF 16:9 (20 pages), généré depuis `index.html`.

## Régénérer le PDF

```bash
npm install playwright
node render.js
```

`render.js` photographie chaque page de `index.html` en 3840 × 2160 puis
assemble les images dans `Deep-Clean-Presentation-KingDream.pdf`. Les
captures d'écran réelles de l'application sont dans `shots/` (téléphone en
390 × 844, ordinateur en 1440 × 900, prises avec les données de démo et une
horloge réglée sur un jeudi à 6 h 45 pour montrer une journée en cours).
