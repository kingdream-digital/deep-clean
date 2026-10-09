#!/usr/bin/env python3
"""Compose les visuels des fiches App Store / Google Play.

À partir des captures brutes de l'application (captures-stores.mjs), produit :
  - les captures « boutique » : fond aux couleurs de Deep Clean, légende courte
    en français, capture en carte arrondie ;
  - la bannière Google Play (1024 x 500) ;
  - les icônes aux tailles exigées par les deux stores.

Usage :
    python3 composer-visuels-stores.py <dossier brutes> <dossier sortie>

<dossier brutes> contient iphone/01-accueil.png … et android/01-accueil.png …
(les noms des fichiers doivent correspondre aux clés de LEGENDES).
Les polices Inter sont celles de l'application (paquet `fonts-inter`).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RACINE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.normpath(os.path.join(RACINE, "..", "..", "application", "mobile"))
POLICES = "/usr/share/fonts/opentype/inter"

# Légendes : courtes, vraies (chaque phrase décrit ce que l'écran montre réellement).
LEGENDES = {
    "01-accueil": "Votre journée\nen un coup d'œil",
    "02-planning": "Un planning\ntoujours à jour",
    "03-mission": "Toutes les consignes\ndu chantier",
    "04-heures": "Pointez et suivez\nvos heures",
    "05-signalement": "Signalez un problème\nen quelques secondes",
    "06-messagerie": "Échangez avec\ntoute l'équipe",
    "07-notifications": "Soyez prévenu\nimmédiatement",
    "08-direction": "Pilotez l'activité\nde l'entreprise",
}

# Couleurs de la marque (voir mobile/src/theme/colors.ts : rampe « accent »).
TEAL_PROFOND = (8, 70, 92)
TEAL = (14, 116, 144)
TEAL_CLAIR = (24, 152, 182)


def police(nom, taille):
    return ImageFont.truetype(os.path.join(POLICES, nom), taille)


def fond_degrade(largeur, hauteur, flou=0.08, opacite_halo=46):
    """Dégradé diagonal doux + halo clair en haut à droite."""
    y, x = np.mgrid[0:hauteur, 0:largeur]
    t = (x / largeur * 0.45 + y / hauteur * 0.55)[..., None]
    a = np.array(TEAL_PROFOND, dtype=float)
    b = np.array(TEAL, dtype=float)
    c = np.array(TEAL_CLAIR, dtype=float)
    bas = np.where(t < 0.55, a + (b - a) * (t / 0.55), b + (c - b) * ((t - 0.55) / 0.45))
    image = Image.fromarray(np.clip(bas, 0, 255).astype("uint8"), "RGB").convert("RGBA")
    halo = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(halo)
    r = int(largeur * 0.55)
    d.ellipse((largeur - r, -r // 2, largeur + r // 3, r), fill=(255, 255, 255, opacite_halo))
    halo = halo.filter(ImageFilter.GaussianBlur(largeur * flou))
    return Image.alpha_composite(image, halo)


def carte_arrondie(capture, largeur_cible, hauteur_cible):
    """Capture redimensionnée, coins arrondis, fin liseré clair et ombre portée."""
    capture = capture.convert("RGB").resize((largeur_cible, hauteur_cible), Image.LANCZOS)
    rayon = int(largeur_cible * 0.075)
    masque = Image.new("L", capture.size, 0)
    ImageDraw.Draw(masque).rounded_rectangle((0, 0, capture.width - 1, capture.height - 1), rayon, fill=255)
    carte = Image.new("RGBA", capture.size, (0, 0, 0, 0))
    carte.paste(capture, (0, 0), masque)
    ImageDraw.Draw(carte).rounded_rectangle(
        (0, 0, capture.width - 1, capture.height - 1), rayon, outline=(255, 255, 255, 70), width=max(2, largeur_cible // 360)
    )
    marge = int(largeur_cible * 0.12)
    ombre = Image.new("RGBA", (capture.width + 2 * marge, capture.height + 2 * marge), (0, 0, 0, 0))
    forme = Image.new("RGBA", capture.size, (0, 0, 0, 120))
    ombre.paste(forme, (marge, marge + int(largeur_cible * 0.025)), masque)
    ombre = ombre.filter(ImageFilter.GaussianBlur(largeur_cible * 0.03))
    return carte, ombre, marge


def composer(capture_brute, legende, largeur, hauteur, sortie):
    toile = fond_degrade(largeur, hauteur)
    d = ImageDraw.Draw(toile)

    # Légende : bloc de deux lignes réservé, texte centré dans le bloc.
    taille = int(largeur * 0.082)
    f = police("Inter-ExtraBold.otf", taille)
    interligne = int(taille * 1.14)
    haut_legende = int(hauteur * 0.052)
    lignes = legende.split("\n")
    bloc = interligne * 2
    y = haut_legende + (bloc - interligne * len(lignes)) // 2
    for ligne in lignes:
        l = d.textlength(ligne, font=f)
        d.text(((largeur - l) / 2, y), ligne, font=f, fill=(255, 255, 255, 255))
        y += interligne

    haut_carte = haut_legende + bloc + int(hauteur * 0.03)
    bas_marge = int(hauteur * 0.022)
    h_cible = hauteur - haut_carte - bas_marge
    brute = Image.open(capture_brute)
    l_cible = int(round(h_cible * brute.width / brute.height))
    carte, ombre, marge = carte_arrondie(brute, l_cible, h_cible)
    x = (largeur - l_cible) // 2
    toile.alpha_composite(ombre, (x - marge, haut_carte - marge))
    toile.alpha_composite(carte, (x, haut_carte))
    toile.convert("RGB").save(sortie, "PNG", optimize=True)


def banniere_play(sortie):
    """Bannière Google Play 1024 x 500 : goutte + logo + accroche."""
    largeur, hauteur = 1024, 500
    toile = fond_degrade(largeur, hauteur, flou=0.2, opacite_halo=34)
    marque = Image.open(os.path.join(MOBILE, "assets", "brand", "mark-white.png")).convert("RGBA")
    h_marque = 300
    marque = marque.resize((int(marque.width * h_marque / marque.height), h_marque), Image.LANCZOS)
    toile.alpha_composite(marque, (96, (hauteur - h_marque) // 2))
    titre = Image.open(os.path.join(MOBILE, "assets", "brand", "title-white.png")).convert("RGBA")
    l_titre = 470
    titre = titre.resize((l_titre, int(titre.height * l_titre / titre.width)), Image.LANCZOS)
    x_texte = 96 + marque.width + 64
    y_titre = 170
    toile.alpha_composite(titre, (x_texte, y_titre))
    d = ImageDraw.Draw(toile)
    d.rectangle((x_texte, y_titre + titre.height + 26, x_texte + 64, y_titre + titre.height + 30), fill=(255, 255, 255, 200))
    d.text((x_texte, y_titre + titre.height + 48), "L'application de vos équipes", font=police("Inter-SemiBold.otf", 34), fill=(255, 255, 255, 255))
    toile.convert("RGB").save(sortie, "PNG", optimize=True)


def icones(dossier):
    os.makedirs(dossier, exist_ok=True)
    source = Image.open(os.path.join(MOBILE, "assets", "icon.png")).convert("RGB")
    source.save(os.path.join(dossier, "icone-app-store-1024.png"), "PNG", optimize=True)  # Apple : sans transparence
    play = source.resize((512, 512), Image.LANCZOS).convert("RGBA")  # Google Play : PNG 32 bits
    play.save(os.path.join(dossier, "icone-google-play-512.png"), "PNG", optimize=True)


def main(brutes, sortie):
    formats = {
        "iphone": ("apple/iphone-6.9-pouces", 1290, 2796),
        "android": ("google-play/telephone", 1080, 1920),
    }
    for cle, (sous_dossier, largeur, hauteur) in formats.items():
        dest = os.path.join(sortie, sous_dossier)
        os.makedirs(dest, exist_ok=True)
        for nom, legende in LEGENDES.items():
            composer(os.path.join(brutes, cle, nom + ".png"), legende, largeur, hauteur, os.path.join(dest, nom + ".png"))
            print("✓", os.path.join(sous_dossier, nom + ".png"))
    os.makedirs(os.path.join(sortie, "google-play"), exist_ok=True)
    banniere_play(os.path.join(sortie, "google-play", "banniere-1024x500.png"))
    print("✓ google-play/banniere-1024x500.png")
    icones(os.path.join(sortie, "icones"))
    print("✓ icones/")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
