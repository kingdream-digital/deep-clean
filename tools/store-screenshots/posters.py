"""Fabrique les captures App Store et Google Play : les affiches de posters/
(HTML/CSS, modèle « vif ») autour des vraies captures de l'application.

Usage (depuis la racine du dépôt), après capture.mjs / all.mjs :
    python3 tools/store-screenshots/posters.py <dossier des captures brutes>

1. Chaque capture brute reçoit sa barre d'état et son indicateur d'accueil
   (compose.phone_screen) et devient screens/<nom>.png.
2. Les affiches posters/NN-*.html sont rendues en PNG 1290 × 2796
   (render-posters.mjs, Chromium de Playwright).
3. Sortie : application/presentation/store/ios-NN-*.png (1290 × 2796) et
   android-NN-*.png (1080 × 2160, rapport maximal 2:1 de Google Play).
"""
import os
import shutil
import subprocess
import sys
import tempfile
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import compose  # noqa: E402

OUT = os.path.join(ROOT, "application", "presentation", "store")
FONTS = os.path.join(ROOT, "application", "presentation", "fonts")
BRAND = os.path.join(ROOT, "v2", "assets", "img")

# Capture brute (all.mjs) → nom utilisé par les affiches.
SCREENS = {
    "public-accueil": "public-accueil",
    "public-services": "public-services",
    "public-services-bas": "public-services-bas",
    "public-service": "public-service",
    "public-service-pieces": "public-service-pieces",
    "public-devis-rempli": "public-devis-rempli",
    "public-envoye": "public-envoye",
    "01-accueil-employe": "equipe-accueil",
    "02-planning": "equipe-planning",
    "03-mission": "equipe-mission",
    "06-messagerie-liste": "equipe-messagerie",
    "07-statistiques": "equipe-statistiques",
}


def android(ios_png, path):
    """1080 × 2160 : l'affiche entière, sur un fond tiré d'elle-même (flou)."""
    poster = Image.open(ios_png).convert("RGB")
    W, H = 1080, 2160
    bg = poster.resize((W, int(poster.height * W / poster.width)), Image.LANCZOS)
    top = (bg.height - H) // 2
    bg = bg.crop((0, top, W, top + H)).filter(ImageFilter.GaussianBlur(40))
    h = H
    w = int(poster.width * h / poster.height)
    bg.paste(poster.resize((w, h), Image.LANCZOS), ((W - w) // 2, 0))
    bg.save(path, optimize=True)


def main():
    raw = os.path.abspath(sys.argv[1])
    stage = tempfile.mkdtemp(prefix="deepclean-posters-")
    os.makedirs(os.path.join(stage, "screens"))
    for source, name in SCREENS.items():
        compose.phone_screen(os.path.join(raw, f"{source}.png")).save(os.path.join(stage, "screens", f"{name}.png"))
    shutil.copytree(FONTS, os.path.join(stage, "fonts"))
    os.makedirs(os.path.join(stage, "brand"))
    for logo in ("logo-horizontal.svg", "logo-embleme.svg", "goutte.svg"):
        shutil.copy(os.path.join(BRAND, logo), os.path.join(stage, "brand", logo))
    posters = os.path.join(stage, "posters")
    shutil.copytree(os.path.join(HERE, "posters"), posters)
    subprocess.run(["node", os.path.join(HERE, "render-posters.mjs"), posters], check=True, cwd=HERE)

    for name in os.listdir(OUT):
        if name.startswith(("ios-", "android-")) and name.endswith(".png"):
            os.remove(os.path.join(OUT, name))
    for name in sorted(os.listdir(posters)):
        if not name.endswith(".png"):
            continue
        ios = os.path.join(OUT, f"ios-{name}")
        Image.open(os.path.join(posters, name)).convert("RGB").save(ios, optimize=True)
        android(ios, os.path.join(OUT, f"android-{name}"))
        print("✓", f"ios-{name}", "+", f"android-{name}")
    shutil.rmtree(stage)


if __name__ == "__main__":
    main()
