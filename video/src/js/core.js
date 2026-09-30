// Noyau de la composition : timeline maîtresse, grille musicale, caméra,
// grain, repères sonores et petits utilitaires partagés par les scènes.
//
// Tout est piloté par UNE timeline GSAP en pause. Le moteur de rendu la
// positionne à l'instant voulu (window.__seek) avant chaque capture : aucune
// animation ne dépend de l'horloge réelle, le rendu est donc déterministe.
(() => {
  gsap.registerPlugin(SplitText, CustomEase, MorphSVGPlugin, DrawSVGPlugin, MotionPathPlugin);

  const BPM = 120;
  const BEAT = 60 / BPM; // 0,5 s — une image sur 30 à 60 i/s tombe pile sur le temps
  const BAR = BEAT * 4; // 2 s
  const DURATION = 60;

  // Courbes maison : une sortie très "Apple" (démarrage vif, arrivée longue et
  // douce) et un rebond discret pour les éléments d'interface.
  CustomEase.create("silk", "M0,0 C0.16,1 0.3,1 1,1");
  CustomEase.create("snap", "M0,0 C0.7,0 0.15,1 1,1");
  CustomEase.create("whip", "M0,0 C0.8,0 0.2,1 1,1");
  CustomEase.create("pop", "M0,0 C0.25,1.5 0.45,1 1,1");

  const master = gsap.timeline({ paused: true, defaults: { ease: "silk", duration: 0.8 } });
  const hooks = [];
  const cues = [];
  const shakes = [];

  const stage = document.getElementById("stage");
  const camera = document.getElementById("camera");
  const shakeEl = document.getElementById("shake");

  /** Repère sonore : consommé par audio/soundtrack.py pour caler le son à l'image près. */
  function cue(type, t, opts = {}) {
    cues.push(Object.assign({ type, t: Math.round(t * 1000) / 1000 }, opts));
  }

  /** Fonction appelée à chaque image, après la timeline (compteurs, particules…). */
  function onFrame(fn) {
    hooks.push(fn);
  }

  function seek(t) {
    // Retour à 0 puis avance jusqu'à t : chaque image est rendue depuis un état
    // connu, quel que soit l'ordre dans lequel les workers les demandent.
    master.seek(0, true);
    master.seek(t, false);
    for (const fn of hooks) fn(t);
  }

  // Générateur pseudo-aléatoire à graine : le "hasard" est identique à chaque rendu.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bruit 1D lissé (value noise) pour les tremblements et dérives organiques.
  function noise1(x, seed = 0) {
    const hash = (n) => {
      const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const beat = (n) => n * BEAT;
  const bar = (n) => n * BAR;

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function icon(name, { size = 24, stroke = 2, cls = "" } = {}) {
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[name]}</svg>`;
  }

  /** Logo goutte en SVG (deux sous-tracés vectorisés depuis le PNG officiel). */
  function logoSVG({ cls = "", fill = "currentColor", id = "" } = {}) {
    const [inner, outer] = window.LOGO_PATHS;
    return `<svg class="logo-svg ${cls}" ${id ? `id="${id}"` : ""} viewBox="0 0 1000 1000" fill="${fill}"><path class="logo-inner" d="${inner}"/><path class="logo-outer" d="${outer}"/></svg>`;
  }

  /** Crée une scène plein cadre, visible uniquement entre start et end. */
  function scene(id, start, end, cls = "") {
    const s = el(`<section class="scene ${cls}" id="${id}"></section>`);
    camera.appendChild(s);
    master.set(s, { autoAlpha: 1 }, start);
    master.set(s, { autoAlpha: 0 }, end);
    return s;
  }

  /** Tremblement de caméra amorti (impacts), additionné aux autres. */
  function shake(t, amp = 14, dur = 0.45, freq = 22) {
    shakes.push({ t, amp, dur, freq });
  }
  onFrame((t) => {
    let x = 0;
    let y = 0;
    let r = 0;
    for (const s of shakes) {
      const dt = t - s.t;
      if (dt < 0 || dt > s.dur) continue;
      const k = Math.pow(1 - dt / s.dur, 2.2);
      x += s.amp * k * noise1(dt * s.freq, 1);
      y += s.amp * k * noise1(dt * s.freq, 2);
      r += s.amp * 0.03 * k * noise1(dt * s.freq, 3);
    }
    shakeEl.style.transform = x || y ? `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg)` : "";
  });

  /** Compteur numérique piloté par l'image (pas d'état caché dans un callback). */
  function counter(node, t0, dur, from, to, fmt = (v) => Math.round(v), ease = "power3.out") {
    const e = gsap.parseEase(ease);
    onFrame((t) => {
      const p = clamp((t - t0) / dur);
      node.textContent = fmt(lerp(from, to, e(p)));
    });
  }

  // Grain : une tuile de bruit à graine fixe qui casse le banding des dégradés
  // sombres une fois compressés en H.264. Mode "static" par défaut (tramage
  // fixe, quasi gratuit à l'encodage) ; "film" le décale 24 fois par seconde
  // comme un vrai grain de pellicule (joli, mais ~10x plus lourd) ; "off".
  const GRAIN = new URLSearchParams(location.search).get("grain") || "static";
  function setupGrain() {
    if (GRAIN === "off") return;
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const r = rng(1337);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() + r() + r() - 1.5) * 150;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const grain = document.getElementById("grain");
    grain.style.backgroundImage = `url(${c.toDataURL()})`;
    if (GRAIN !== "film") return;
    onFrame((t) => {
      const q = rng(Math.floor(t * 24) + 11);
      grain.style.backgroundPosition = `${Math.floor(q() * size)}px ${Math.floor(q() * size)}px`;
    });
  }

  /** Découpe un texte en lignes masquées (SplitText) et renvoie les lignes. */
  function splitLines(node) {
    const split = new SplitText(node, { type: "lines", mask: "lines", linesClass: "sl" });
    return split.lines;
  }

  function splitChars(node, type = "chars") {
    return new SplitText(node, { type: type === "chars" ? "words,chars" : type, charsClass: "sc", wordsClass: "sw" });
  }

  window.DC = {
    BPM,
    BEAT,
    BAR,
    DURATION,
    master,
    stage,
    camera,
    cue,
    onFrame,
    seek,
    rng,
    noise1,
    clamp,
    lerp,
    beat,
    bar,
    el,
    icon,
    logoSVG,
    scene,
    shake,
    counter,
    setupGrain,
    splitLines,
    splitChars,
    cues,
  };
})();
