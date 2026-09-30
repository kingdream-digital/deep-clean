// S7 — FINALE (51,9 → 60 s)
// La phrase du client, mot à mot sur les temps, au milieu d'éclats de
// l'interface qui flottent en profondeur. Puis tout implose vers le centre :
// impact, le logo blanc éclôt, logotype, rappel de la promesse (qui répond au
// constat du début : papier, WhatsApp, Excel), plateformes et signature.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, shake, onFrame, rng, noise1, clamp } = DC;
  const s = DC.scene("s7", 51.9, 60.01);
  s.style.zIndex = 7;

  s.innerHTML = `
    <div class="s7-bg layer"><i class="s7-glow"></i></div>
    <div class="s7-frags layer"></div>
    <div class="s7-words">
      <div class="s7-line"><span class="w">Une</span> <span class="w">communication</span> <span class="w g">centralisée,</span></div>
      <div class="s7-line"><span class="w g">organisée,</span></div>
      <div class="s7-line"><span class="w">et</span> <span class="w">toujours</span> <span class="w">au</span> <span class="w g">bon</span> <span class="w g">endroit.</span></div>
    </div>
    <i class="s7-core"></i>
    <div class="s7-rings">${"<i></i>".repeat(4)}</div>
    <div class="s7-lockup">
      <div class="s7-mark">${DC.logoSVG({ fill: "#ffffff" })}</div>
      <img class="s7-word" src="assets/brand/wordmark-white.png" alt="Deep Clean">
      <p class="s7-tag"><span>L'application qui remplace le papier, les groupes WhatsApp</span><span>et les tableurs Excel, pour de bon.</span></p>
      <div class="s7-plat"><span>${icon("smartphone", { size: 22 })}iOS</span><span>${icon("smartphone", { size: 22 })}Android</span><span>${icon("monitor", { size: 22 })}Web</span></div>
    </div>
    <div class="s7-credit"><span>Conçue et développée par</span><img src="../application/presentation/assets/kingdream-logo.png" alt="KingDream Digital"></div>
    <i class="s7-black"></i>`;

  tl.fromTo(s.querySelector(".s7-bg"), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out" }, 51.9);

  // --- Éclats d'interface en profondeur (bokeh) ---------------------------------
  const FR = [
    UI.bubble("Reçu, je regarde ça tout de suite 👍", "out", "08:03"),
    UI.bubble("Merci ! Dis-moi si tu as besoin de matériel.", "in", "08:04"),
    UI.toast({ title: "Nouvelle consigne", body: "Une nouvelle consigne a été ajoutée à votre mission.", ic: "clipboard-list" }),
    UI.statusPill("EN COURS", "orange"),
    UI.statusPill("VALIDÉ", "green"),
    UI.statusPill("PLANIFIÉE", "teal"),
    UI.avatarStack(["karim", "ines", "emma"], 56),
    UI.fileChip({ name: "Protocole-désinfection.pdf", meta: "PDF · 240 Ko", kind: "pdf" }),
    UI.appIcon(90),
    `<span class="s7-check">${icon("check", { size: 34, stroke: 3 })}</span>`,
    UI.pill("Aujourd'hui", "teal", "calendar-days"),
    UI.pill("08:00 – 11:00", "grey", "clock"),
    UI.avatar("sophie", 70),
    UI.avatar("MB:violet", 70),
    `<span class="s7-badge">3</span>`,
    UI.bubble("C'est bon, tout est sur place.", "out", "08:05"),
    UI.statusPill("PAYÉE", "green"),
    UI.avatar("nathan", 64),
  ];
  const q = rng(2026);
  const fragBox = s.querySelector(".s7-frags");
  const frags = FR.map((html, i) => {
    const node = el(`<div class="s7-frag"><div class="s7-frag-in">${html}</div></div>`);
    fragBox.appendChild(node);
    // Répartis sur une ellipse autour du texte, profondeur variable.
    const ang = (i / FR.length) * Math.PI * 2 + q() * 0.3;
    const rad = 0.78 + q() * 0.35;
    const d = q();
    return { node, inner: node.firstElementChild, ang, rad, d, spin: (q() - 0.5) * 30, seed: i * 7.3 };
  });
  const CY = 390; // centre du logo final : tout converge vers ce point
  const implode = { p: 0 };
  tl.to(implode, { p: 1, duration: 0.95, ease: "power3.in" }, 54.95);
  onFrame((t) => {
    if (t < 51.9 || t > 56.2) return;
    const life = t - 51.9;
    for (const f of frags) {
      const drift = 1 + life * 0.05 * (1.2 - f.d);
      const k = 1 - implode.p;
      const x = 960 + Math.cos(f.ang + life * 0.04) * 860 * f.rad * drift * k + noise1(t * 0.4 + f.seed, 1) * 18 * k;
      const y = 540 - (540 - CY) * implode.p + Math.sin(f.ang + life * 0.04) * 470 * f.rad * drift * k + noise1(t * 0.4 + f.seed, 2) * 14 * k;
      const scale = (0.95 - f.d * 0.45) * (1 - implode.p * 0.85);
      const blur = f.d * 7 + implode.p * 4;
      const rot = f.spin * 0.2 + implode.p * f.spin * 3;
      f.node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
      f.node.style.filter = `blur(${blur.toFixed(1)}px)`;
      f.node.style.opacity = (clamp((life - 0.1) / 0.6) * (0.35 + (1 - f.d) * 0.5) * (1 - implode.p * implode.p)).toFixed(3);
    }
  });

  // --- La phrase, mot à mot, sur les temps --------------------------------------
  const words = [...s.querySelectorAll(".w")];
  const GROUPS = [
    [52.05, [0, 1]],
    [52.55, [2]],
    [53.05, [3]],
    [53.55, [4, 5, 6]],
    [53.8, [7, 8]],
  ];
  GROUPS.forEach(([t, idx]) => {
    idx.forEach((k, j) => {
      tl.fromTo(words[k], { autoAlpha: 0, y: 60, filter: "blur(16px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out" }, t + j * 0.06);
    });
    cue("word", t, { gain: 0.8 });
  });
  shake(52.55, 4, 0.25);
  shake(53.05, 4, 0.25);
  // Les mots s'aspirent vers le centre.
  // Position dans la scène sans tenir compte des transformations (offset*).
  const stagePos = (node) => {
    let x = node.offsetWidth / 2;
    let y = node.offsetHeight / 2;
    for (let n = node; n && n !== DC.stage; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return [x, y];
  };
  words.forEach((w, i) => {
    const [cx, cy] = stagePos(w);
    const dx = 960 - cx;
    const dy = CY - cy;
    tl.to(w, { x: dx * 0.9, y: dy * 0.9, scale: 0.1, autoAlpha: 0, filter: "blur(8px)", duration: 0.7, ease: "power3.in" }, 55.05 + (i % 3) * 0.04);
  });
  cue("riser", 54.6, { dur: 1.35 });

  // --- Implosion → impact → logo ---------------------------------------------------
  const core = s.querySelector(".s7-core");
  tl.set(core, { autoAlpha: 1, scale: 0 }, 55.5);
  tl.to(core, { scale: 1, duration: 0.45, ease: "power4.in" }, 55.5);
  tl.to(core, { scale: 7, autoAlpha: 0, duration: 0.35, ease: "power3.out" }, 55.98);
  const flash = document.getElementById("flash");
  tl.set(flash, { opacity: 0.45 }, 56.0);
  tl.to(flash, { opacity: 0, duration: 0.25, ease: "power2.out" }, 56.0);

  const mark = s.querySelector(".s7-mark");
  tl.set(mark, { autoAlpha: 1 }, 56.0);
  tl.fromTo(mark, { scale: 0.3, y: 30 }, { scale: 1, y: 0, duration: 1.2, ease: "elastic.out(1, 0.6)", immediateRender: false }, 56.0);
  tl.fromTo(s.querySelector(".s7-glow"), { opacity: 0.25, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.9, ease: "power2.out" }, 56.0);
  s.querySelectorAll(".s7-rings i").forEach((r, i) => {
    const t = 56.0 + i * 0.08;
    tl.set(r, { autoAlpha: 0.7, scale: 0.2 }, t);
    tl.to(r, { scale: 5 + i, autoAlpha: 0, duration: 1.6, ease: "power2.out" }, t);
  });
  shake(56.0, 16, 0.6);
  cue("impact", 56.0, { gain: 1, final: true });

  const word = s.querySelector(".s7-word");
  tl.fromTo(word, { clipPath: "inset(0 50% 0 50%)", scaleX: 1.12, filter: "blur(10px)", autoAlpha: 0 }, { clipPath: "inset(0 0% 0 0%)", scaleX: 1, filter: "blur(0px)", autoAlpha: 1, duration: 0.9, ease: "expo.out" }, 56.35);
  cue("whoosh", 56.3, { gain: 0.5 });
  const tagSpans = s.querySelectorAll(".s7-tag span");
  tl.fromTo(tagSpans, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "expo.out" }, 56.95);
  const plats = s.querySelectorAll(".s7-plat span");
  plats.forEach((p, i) => {
    const t = 57.6 + i * 0.12;
    tl.fromTo(p, { autoAlpha: 0, y: 24, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, t);
    cue("pop", t, { gain: 0.45 });
  });
  const credit = s.querySelector(".s7-credit");
  tl.fromTo(credit, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out" }, 58.2);
  // Reflet final sur le logo, puis fondu au noir.
  tl.fromTo(mark, { filter: "drop-shadow(0 0 0px rgba(34,211,238,0))" }, { filter: "drop-shadow(0 0 40px rgba(34,211,238,0.55))", duration: 1.4, ease: "sine.inOut" }, 57.0);
  tl.fromTo(s.querySelector(".s7-black"), { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power1.in" }, 59.3);
});
