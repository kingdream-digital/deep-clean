"""Génère src/js/generated.js : tracé vectoriel du logo goutte + icônes Lucide.

Le logo n'existe qu'en PNG dans le dépôt (application/presentation/assets/
mark-ink.png) : on le vectorise avec potrace pour pouvoir l'animer (morphing,
masques, tracé), puis on normalise les deux sous-tracés dans une boîte de
1000 unités. Les icônes viennent de lucide-static (licence ISC).

Pré-requis : potrace (apt), svgelements + Pillow (pip), lucide-static (npm,
installé dans video/work/). Usage : python3 tools/build_assets.py
"""
import json
import pathlib
import re
import subprocess
import tempfile

from PIL import Image
from svgelements import SVG, Matrix, Path

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parent
MARK = REPO / "application/presentation/assets/mark-ink.png"
LUCIDE = ROOT / "work/node_modules/lucide-static/icons"

ICONS = """message-circle messages-square users building-2 clipboard-list bell bell-ring
paperclip lock lock-open shield-check calendar-days map-pin camera check check-check clock
file-text euro briefcase trending-up send user hard-hat sparkles droplet smartphone monitor
file-spreadsheet sticky-note phone image arrow-right circle-check triangle-alert receipt
handshake file-pen-line badge-check layout-dashboard fingerprint scan-line navigation timer
user-plus user-round-cog crown chart-column mail landmark circle-alert hourglass file-check
refresh-cw zap star megaphone flag list-checks""".split()


def trace_logo():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        alpha = Image.open(MARK).split()[3]
        alpha = alpha.resize((alpha.width * 2, alpha.height * 2), Image.LANCZOS)
        alpha.point(lambda v: 0 if v > 128 else 255, "1").save(tmp / "mark.pbm")
        subprocess.run(["potrace", str(tmp / "mark.pbm"), "-s", "-o", str(tmp / "mark.svg"),
                        "-t", "20", "-O", "0.4", "--flat"], check=True)
        path = [e for e in SVG.parse(str(tmp / "mark.svg")).elements() if isinstance(e, Path)][0]
    path.reify()
    x0, y0, x1, y1 = path.bbox()
    scale = 1000.0 / max(x1 - x0, y1 - y0)
    ox, oy = (1000 - (x1 - x0) * scale) / 2, (1000 - (y1 - y0) * scale) / 2
    out = []
    for sub in path.as_subpaths():
        p = Path(sub)
        p *= Matrix(f"translate({ox},{oy}) scale({scale}) translate({-x0},{-y0})")
        p.reify()
        # Arrondi à 0.1 unité : invisible à l'écran, fichier 3x plus léger.
        out.append(re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.1f}", p.d()))
    # Le sous-tracé intérieur (branche gauche) d'abord, l'extérieur ensuite.
    out.sort(key=len)
    return out


def load_icons():
    icons = {}
    for name in ICONS:
        svg = (LUCIDE / f"{name}.svg").read_text()
        inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
        icons[name] = re.sub(r"\s+", " ", inner).strip()
    return icons


def main():
    logo = trace_logo()
    icons = load_icons()
    js = ("// Fichier généré par tools/build_assets.py — ne pas modifier à la main.\n"
          "// Icônes : Lucide (https://lucide.dev), licence ISC.\n"
          f"window.LOGO_PATHS = {json.dumps(logo)};\n"
          f"window.ICONS = {json.dumps(icons, ensure_ascii=False, indent=0)};\n")
    (ROOT / "src/js/generated.js").write_text(js)
    print("logo subpaths:", [len(d) for d in logo], "icons:", len(icons))


if __name__ == "__main__":
    main()
