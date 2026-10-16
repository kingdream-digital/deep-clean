"""Met en page les captures brutes de l'application pour l'App Store et Google Play.

Usage (depuis la racine du dépôt) :
    python3 tools/store-screenshots/compose.py <dossier des captures brutes>

Chaque capture brute (430 × 844 pt à @3x, produite par capture.mjs) est posée
dans un cadre d'iPhone — barre d'état et indicateur d'accueil recomposés —
sur un fond aux couleurs de la charte Deep Clean, avec un titre court.
Sortie : application/presentation/store/ios-NN-*.png (1290 × 2796, iPhone
6,9") et android-NN-*.png (1080 × 2160).
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONTS = os.path.join(ROOT, "application", "presentation", "fonts")
OUT = os.path.join(ROOT, "application", "presentation", "store")

NAVY = (31, 45, 105)
MID = (42, 79, 142)
DROP = (30, 156, 198)
SKY = (191, 227, 244)

# Ordre de la fiche : le volet public d'abord (clients), puis les équipes.
SHOTS = [
    ("04-decouvrir", "decouvrir", "Le propre, en profondeur", "Qui nous sommes, nos services, nos actualités"),
    ("05-devis", "devis", "Un devis gratuit, sans compte", "Réponse sous 24 à 48 h"),
    ("01-accueil-employe", "accueil-employe", "Votre journée en un coup d'œil", "Mission en cours, pointage, heures"),
    ("02-planning", "planning", "Le planning de la semaine", "Chaque mission, son lieu, son équipe"),
    ("03-mission", "mission", "Consignes et fiche de poste", "Tout savoir avant d'arriver sur place"),
    ("06-messagerie-liste", "messagerie", "Toute l'équipe, au même endroit", "Messages, groupes et notifications"),
    ("07-statistiques", "statistiques", "Pilotez l'activité", "Missions, chantiers, signalements"),
]

STATUS_PT, HOME_PT = 54, 34  # barre d'état et indicateur d'accueil d'un iPhone 6,9"


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f"Inter_{weight}.ttf"), size)


def luminance(rgb):
    r, g, b = [c / 255 for c in rgb[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def phone_screen(raw_path):
    """Écran complet (barre d'état + capture + indicateur d'accueil), à @3x."""
    raw = Image.open(raw_path).convert("RGB")
    s = raw.width / 430
    top = raw.getpixel((raw.width // 2, 2))
    bottom = raw.getpixel((raw.width // 2, raw.height - 2))
    W = raw.width
    H = raw.height + int((STATUS_PT + HOME_PT) * s)
    screen = Image.new("RGB", (W, H), top)
    screen.paste(raw, (0, int(STATUS_PT * s)))
    d = ImageDraw.Draw(screen)
    d.rectangle([0, H - int(HOME_PT * s), W, H], fill=bottom)
    ink = (0, 0, 0) if luminance(top) > 0.55 else (255, 255, 255)
    # Heure.
    d.text((int(52 * s), int(29 * s)), "9:41", font=font("600SemiBold", int(17 * s)), fill=ink, anchor="lm")
    # Réseau (4 barres), Wi-Fi (3 arcs), batterie.
    x0, y = W - int(124 * s), int(29 * s)
    for i in range(4):
        h = int((4 + 2.6 * i) * s)
        d.rounded_rectangle([x0 + int(i * 5 * s), y + int(5 * s) - h, x0 + int(i * 5 * s) + int(3.4 * s), y + int(5 * s)], radius=int(1 * s), fill=ink)
    cx, cy = W - int(80 * s), y + int(5 * s)
    for i, r in enumerate((11, 7.5, 4)):
        rr = int(r * s)
        if i < 2:
            d.arc([cx - rr, cy - rr, cx + rr, cy + rr], 225, 315, fill=ink, width=int(2.2 * s))
        else:
            d.pieslice([cx - rr, cy - rr, cx + rr, cy + rr], 225, 315, fill=ink)
    bx = W - int(62 * s)
    d.rounded_rectangle([bx, y - int(6 * s), bx + int(25 * s), y + int(6 * s)], radius=int(3.5 * s), outline=ink, width=int(1.2 * s))
    d.rounded_rectangle([bx + int(2 * s), y - int(4 * s), bx + int(21 * s), y + int(4 * s)], radius=int(2 * s), fill=ink)
    d.rounded_rectangle([bx + int(26.5 * s), y - int(2 * s), bx + int(28 * s), y + int(2 * s)], radius=int(1 * s), fill=ink)
    # Dynamic Island.
    d.rounded_rectangle([W // 2 - int(63 * s), int(11 * s), W // 2 + int(63 * s), int(48 * s)], radius=int(19 * s), fill=(0, 0, 0))
    # Indicateur d'accueil.
    pill = (20, 20, 20) if luminance(bottom) > 0.55 else (240, 240, 240)
    d.rounded_rectangle([W // 2 - int(67 * s), H - int(13 * s), W // 2 + int(67 * s), H - int(8 * s)], radius=int(3 * s), fill=pill)
    return screen


def background(W, H):
    bg = Image.new("RGB", (W, H), NAVY)
    px = bg.load()
    for yy in range(H):
        t = yy / (H - 1)
        c = tuple(int(NAVY[i] + (MID[i] - NAVY[i]) * t) for i in range(3))
        for xx in range(W):
            px[xx, yy] = c
    glow = Image.new("L", (W, H), 0)
    g = ImageDraw.Draw(glow)
    g.ellipse([int(W * 0.45), int(-H * 0.12), int(W * 1.35), int(H * 0.32)], fill=70)
    g.ellipse([int(-W * 0.5), int(H * 0.62), int(W * 0.5), int(H * 1.15)], fill=50)
    glow = glow.filter(ImageFilter.GaussianBlur(W // 8))
    light = Image.new("RGB", (W, H), DROP)
    return Image.composite(light, bg, glow)


def compose(raw_path, title, subtitle, W, H):
    canvas = background(W, H)
    d = ImageDraw.Draw(canvas)
    unit = W / 1290
    d.text((W // 2, int(205 * unit)), title, font=font("700Bold", int(70 * unit)), fill=(255, 255, 255), anchor="mm")
    d.text((W // 2, int(305 * unit)), subtitle, font=font("500Medium", int(42 * unit)), fill=SKY, anchor="mm")

    screen = phone_screen(raw_path)
    avail_h = H - int(420 * unit) - int(40 * unit)
    scale = min((W * 0.80) / screen.width, avail_h / (screen.height + 0.06 * screen.width))
    sw, sh = int(screen.width * scale), int(screen.height * scale)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    bezel = int(sw * 0.032)
    fw, fh = sw + 2 * bezel, sh + 2 * bezel
    x = (W - fw) // 2
    y = int(420 * unit)
    radius = int(fw * 0.13)
    # Ombre portée douce.
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([x, y + int(30 * unit), x + fw, y + fh + int(30 * unit)], radius=radius, fill=140)
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(45 * unit)))
    canvas = Image.composite(Image.new("RGB", (W, H), (10, 14, 34)), canvas, shadow)
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, fw - 1, fh - 1], radius=radius, fill=(18, 20, 28, 255))
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=radius - bezel, fill=255)
    frame.paste(screen, (bezel, bezel), mask)
    canvas.paste(frame, (x, y), frame)
    return canvas


def main():
    raw_dir = sys.argv[1]
    for name in os.listdir(OUT):
        if name.startswith(("ios-", "android-")) and name.endswith(".png"):
            os.remove(os.path.join(OUT, name))
    for i, (raw, slug, title, subtitle) in enumerate(SHOTS, start=1):
        src = os.path.join(raw_dir, f"{raw}.png")
        for prefix, (W, H) in (("ios", (1290, 2796)), ("android", (1080, 2160))):
            img = compose(src, title, subtitle, W, H)
            path = os.path.join(OUT, f"{prefix}-{i:02d}-{slug}.png")
            img.save(path, optimize=True)
            print("✓", os.path.relpath(path, ROOT), img.size)


if __name__ == "__main__":
    main()
