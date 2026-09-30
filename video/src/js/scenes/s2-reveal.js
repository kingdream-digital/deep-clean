// S2 — RÉVÉLATION (5 → 12 s)
// Derrière la raclette : un univers propre. Une goutte tombe, se transforme
// en logo (morphing vectoriel), ondes à l'impact, reflet spéculaire, puis le
// logotype et la promesse en trois temps. Le logo redevient ensuite l'icône
// de l'app sur un téléphone, qu'on "ouvre" : raccord direct avec S3.
window.SCENES.push(() => {
  const { master: tl, el, cue, shake, onFrame } = DC;
  const s = DC.scene("s2", 5.0, 12.4);
  s.style.zIndex = 2;

  const [innerD, outerD] = window.LOGO_PATHS;
  // Cercle en 4 courbes de Bézier (même centre que la panse de la goutte).
  const circle = (cx, cy, r) => {
    const k = 0.5523 * r;
    return `M${cx},${cy - r} C${cx + k},${cy - r} ${cx + r},${cy - k} ${cx + r},${cy} C${cx + r},${cy + k} ${cx + k},${cy + r} ${cx},${cy + r} C${cx - k},${cy + r} ${cx - r},${cy + k} ${cx - r},${cy} C${cx - r},${cy - k} ${cx - k},${cy - r} ${cx},${cy - r} Z`;
  };

  s.innerHTML = `
    <div class="s2-bg layer"></div>
    <div class="s2-glow"></div>
    <div class="s2-ripples">${"<i></i>".repeat(3)}</div>
    <svg class="s2-drop" viewBox="0 0 100 140"><defs><linearGradient id="s2dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0b5a70"/></linearGradient></defs>
      <path d="M50,4 C62,34 88,62 88,92 A38,38 0 1,1 12,92 C12,62 38,34 50,4 Z" fill="url(#s2dg)"/><ellipse cx="36" cy="88" rx="8" ry="14" fill="#fff" opacity=".55"/></svg>
    <div class="s2-lockup">
      <div class="s2-mark">
        <svg class="logo-svg" viewBox="0 0 1000 1000">
          <defs>
            <linearGradient id="s2g" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="#14a7c7"/><stop offset="0.45" stop-color="#0e7490"/><stop offset="1" stop-color="#0a4d61"/></linearGradient>
            <linearGradient id="s2shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <clipPath id="s2clip"><path d="${innerD}"/><path d="${outerD}"/></clipPath>
          </defs>
          <path class="s2-inner" d="${innerD}" fill="url(#s2g)"/>
          <path class="s2-outer" d="${outerD}" fill="url(#s2g)"/>
          <g clip-path="url(#s2clip)"><rect class="s2-shine" x="-400" y="-200" width="260" height="1400" fill="url(#s2shine)" transform="rotate(18)"/></g>
        </svg>
      </div>
      <img class="s2-word" src="assets/brand/wordmark-ink.png" alt="Deep Clean">
      <div class="s2-over">Application mobile &amp; web</div>
    </div>
    <div class="s2-lines">
      <div class="s2-line"><span>Une <em class="grad-teal">seule app.</em></span></div>
      <div class="s2-line"><span>Tous les <em class="grad-teal">métiers.</em></span></div>
      <div class="s2-line"><span>En <em class="grad-teal">temps réel.</em></span></div>
    </div>`;

  const lockup = s.querySelector(".s2-lockup");
  const over = s.querySelector(".s2-over");
  gsap.set(lockup, { transformOrigin: "960px 450px" });
  const mark = s.querySelector(".s2-mark");
  const outer = s.querySelector(".s2-outer");
  const inner = s.querySelector(".s2-inner");

  // La goutte tombe…
  const drop = s.querySelector(".s2-drop");
  tl.fromTo(drop, { y: -520, scaleY: 1.4, autoAlpha: 1 }, { y: 0, scaleY: 1.1, duration: 0.3, ease: "power1.in" }, 5.7);
  tl.set(drop, { autoAlpha: 0 }, 6.0);
  cue("drop", 5.72);

  // …et devient le logo.
  tl.set(mark, { autoAlpha: 1 }, 6.0);
  tl.fromTo(outer, { morphSVG: circle(500, 640, 110) }, { morphSVG: outerD, duration: 0.75, ease: "expo.out" }, 6.0);
  tl.fromTo(inner, { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 80%" }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, 6.08);
  tl.fromTo(mark, { scale: 0.62 }, { scale: 1, duration: 1.1, ease: "elastic.out(1, 0.55)" }, 6.0);
  // Règle suivie partout : un élément qui apparaît en cours de scène est
  // caché en CSS, rendu visible par un set() à son instant, puis animé par
  // to() — ainsi la timeline reste juste quand on la rembobine image par image.
  s.querySelectorAll(".s2-ripples i").forEach((r, i) => {
    const t = 6.0 + i * 0.09;
    tl.set(r, { autoAlpha: 0.75, scale: 0.15 }, t);
    tl.to(r, { scale: 3.4 + i * 0.6, autoAlpha: 0, duration: 1.4, ease: "power2.out" }, t);
  });
  tl.fromTo(s.querySelector(".s2-glow"), { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power2.out" }, 6.0);
  tl.to(s.querySelector(".s2-glow"), { autoAlpha: 0.55, duration: 1.2, ease: "sine.inOut" }, 6.6);
  tl.fromTo(s.querySelector(".s2-shine"), { x: -200 }, { x: 1250, duration: 0.9, ease: "power2.inOut" }, 6.45);
  shake(6.0, 12, 0.55);
  cue("impact", 6.0);

  // Logotype : ouverture depuis le centre + resserrement de l'approche.
  const word = s.querySelector(".s2-word");
  tl.fromTo(word, { clipPath: "inset(0 50% 0 50%)", scaleX: 1.14, filter: "blur(10px)", autoAlpha: 0 }, { clipPath: "inset(0 0% 0 0%)", scaleX: 1, filter: "blur(0px)", autoAlpha: 1, duration: 0.8, ease: "expo.out" }, 6.5);
  cue("whoosh", 6.45, { gain: 0.5 });
  const overSplit = DC.splitChars(over);
  tl.fromTo(overSplit.chars, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.016, ease: "power3.out" }, 6.8);

  // Le bloc logo monte, la promesse arrive en trois temps.
  tl.to(lockup, { y: -310, scale: 0.5, duration: 0.65, ease: "expo.inOut" }, 7.8);
  tl.to(s.querySelector(".s2-glow"), { autoAlpha: 0, duration: 0.5, ease: "power2.out" }, 7.8);
  tl.to(over, { autoAlpha: 0, duration: 0.3 }, 7.8);
  const lines = [...s.querySelectorAll(".s2-line span")];
  lines.forEach((line, i) => {
    const t = 8.0 + i * 0.5;
    tl.fromTo(line, { yPercent: 110, rotation: 3 }, { yPercent: 0, rotation: 0, duration: 0.7, ease: "expo.out" }, t);
    cue("tick", t, { gain: 0.7 });
  });
  tl.to(lines, { yPercent: -115, duration: 0.4, stagger: 0.05, ease: "power2.in" }, 9.95);
  cue("whoosh", 9.95, { gain: 0.6 });

  // Le logo revient au centre et devient l'icône de l'application.
  tl.to(word, { autoAlpha: 0, y: 20, duration: 0.3, ease: "power2.in" }, 9.95);
  tl.to(lockup, { y: 80.5, scale: 0.148, duration: 0.65, ease: "expo.inOut" }, 10.0);
  tl.to(mark, { autoAlpha: 0, duration: 0.12 }, 10.9);

  // --- Téléphone "héros", partagé avec S3 et S4 -------------------------------
  const heroStage = el(`<div class="hero-stage"></div>`);
  DC.camera.appendChild(heroStage);
  const home = `
    <div class="scr scr-home">
      <div class="home-wall"></div>
      <div class="home-clock"><b>9:41</b><span>Mercredi 30 septembre</span></div>
      <div class="home-app">${UI.appIcon(92, "home-icon")}<span>Deep Clean</span></div>
      <i class="home-tap"></i>
      <div class="home-dock"></div>
    </div>
    <div class="scr scr-splash"><div class="splash-logo">${DC.logoSVG({ fill: "#fff" })}</div></div>`;
  const phoneEl = el(`<div class="hero-phone">${UI.phone(`<div class="screens">${home}</div>`, "on-light")}</div>`);
  heroStage.appendChild(phoneEl);
  const screens = phoneEl.querySelector(".screens");

  tl.set(heroStage, { autoAlpha: 1 }, 10.4);
  tl.fromTo(phoneEl, { scale: 2.4, autoAlpha: 0, rotationX: 0, rotationY: 0 }, { scale: 0.86, autoAlpha: 1, duration: 0.75, ease: "expo.out" }, 10.5);
  cue("whoosh", 10.5, { gain: 0.8, low: true });

  const icon = phoneEl.querySelector(".home-icon");
  const tap = phoneEl.querySelector(".home-tap");
  tl.fromTo(icon, { scale: 0.9 }, { scale: 1, duration: 0.3, ease: "power2.out" }, 11.0);
  tl.to(icon, { scale: 0.86, duration: 0.1, ease: "power2.out" }, 11.25);
  tl.to(icon, { scale: 1, duration: 0.25, ease: "back.out(3)" }, 11.35);
  tl.set(tap, { scale: 0.2, autoAlpha: 0.6 }, 11.25);
  tl.to(tap, { scale: 2.2, autoAlpha: 0, duration: 0.5, ease: "power2.out" }, 11.25);
  cue("tap", 11.25);

  // Ouverture de l'app : l'icône s'agrandit jusqu'à remplir l'écran.
  const splash = phoneEl.querySelector(".scr-splash");
  tl.set(splash, { autoAlpha: 1, clipPath: "inset(384px 149px 406px 149px round 22px)" }, 11.45);
  tl.to(splash, { clipPath: "inset(0px 0px 0px 0px round 54px)", duration: 0.5, ease: "expo.inOut" }, 11.45);
  tl.fromTo(splash.querySelector(".splash-logo"), { scale: 0.34 }, { scale: 1, duration: 0.5, ease: "expo.inOut" }, 11.45);
  cue("open", 11.45);

  DC.hero = { stage: heroStage, phone: phoneEl, screens };
});
