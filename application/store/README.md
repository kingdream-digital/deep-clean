# Dossier de publication — App Store et Google Play

Tout ce qu'il faut pour envoyer **Deep Clean** sur l'App Store (Apple) et sur Google
Play (Android). **Commencer par le guide : [`docs/PUBLICATION-STORES.md`](../../docs/PUBLICATION-STORES.md).**

```
store/
├── apple/
│   ├── fiche-app-store.md             textes de la fiche (nom, description, mots-clés…) + âge
│   ├── confidentialite-app-store.md   réponses « Confidentialité de l'app »
│   └── notes-pour-apple.md            notes et compte de démonstration pour la validation
├── google-play/
│   ├── fiche-google-play.md           textes de la fiche + contacts + visuels à téléverser
│   ├── securite-des-donnees.md        réponses « Sécurité des données »
│   └── notes-pour-google.md           accès, classification, déclarations, pistes de test
└── visuels/
    ├── icones/                        icône App Store 1024 × 1024 · icône Google Play 512 × 512
    ├── apple/iphone-6.9-pouces/       8 captures 1290 × 2796 (avec légende)
    ├── google-play/telephone/         8 captures 1080 × 1920 (avec légende)
    ├── google-play/banniere-1024x500.png
    └── captures-sans-legende/         les mêmes captures, brutes, aux mêmes tailles
```

Les trois pages web exigées par les stores (politique de confidentialité, assistance,
suppression de compte) sont dans [`../mobile/public/`](../mobile/public/) : elles sont
publiées avec le site web de l'app.

## Refaire les visuels

Les captures sont de **vrais écrans de l'application** (jeu de démonstration, initiales à
la place des portraits). Pour les refaire après une évolution de l'interface :

1. Lancer l'environnement de développement (`docs/REPRISE-SESSION.md`, §4) et retirer les
   portraits de démonstration : `UPDATE users SET "avatarKey" = NULL;`
2. `cd tools/audit-visuel && node captures-stores.mjs iphone && node captures-stores.mjs android`
3. `python3 composer-visuels-stores.py sortie/captures-stores/brutes <dossier de sortie>`
   (légendes et couleurs : en tête de `composer-visuels-stores.py`).

Les captures proviennent de l'affichage web de l'application à la taille d'un téléphone
(même code que l'app native). Pour un rendu 100 % natif (barre d'état du téléphone), les
remplacer, une fois l'app installée via TestFlight / Test interne, par de vraies captures
d'appareil aux mêmes tailles.

## Vérifier avant d'envoyer

```bash
cd application/mobile
npm run verifier:publication -- --en-ligne
```
