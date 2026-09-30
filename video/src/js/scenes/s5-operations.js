// S5 — SUR LE TERRAIN COMME AU BUREAU (33,35 → 44 s)
// Montage rythmé en quatre plans, un par mesure et demie :
//   A. le planning web (vraie capture) synchronisé en direct avec le mobile ;
//   B. le pointage en un geste (photo + GPS) ;
//   C. le signalement photo, suivi jusqu'à sa validation ;
//   D. le temps gagné chaque semaine, en grand.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, shake, onFrame, counter } = DC;
  const s = DC.scene("s5", 33.35, 44.3);
  s.style.zIndex = 5;
  const WHIP = 33.35;

  // ------------------------------------------------------------ A. Web + mobile
  const a = el(`
    <div class="s5-a layer">
      <div class="s5-bg-light layer"><i class="blob b1"></i><i class="blob b2"></i></div>
      <div class="s5-a-head">
        <div class="overline"><span>Et sur ordinateur</span></div>
        <h2 class="title"><span>Tout le planning, <em class="grad-teal">d'un seul coup d'œil.</em></span></h2>
      </div>
      <div class="s5-a-3d">
        ${UI.browser(`<img src="${UI.SHOTS}web-planning.png" alt=""><div class="s5-today"></div><div class="s5-newcell"><b>Bureaux TechCorp</b><span>18:00 – 20:30</span></div>`, "deepclean.app/planning", "s5-browser")}
      </div>
      <div class="s5-a-phone">${UI.phone(`${UI.shotScreen("planning-tour.png")}<div class="s5-ptoast">${UI.toast({ title: "Nouvelle mission", body: "Une nouvelle mission vous a été attribuée.", ic: "briefcase" })}</div>`, "on-light")}</div>
      <div class="s5-sync"><span class="dot"></span>Synchronisé en temps réel</div>
      <svg class="s5-arc" viewBox="0 0 1920 1080"><path id="s5-arc-path" d="M806,540 C980,300 1330,230 1560,330" fill="none" stroke="url(#s5arcg)" stroke-width="4" stroke-linecap="round"/><defs><linearGradient id="s5arcg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><circle class="s5-spark" r="9" fill="#22d3ee"/></svg>
    </div>`);
  s.appendChild(a);

  // Arrivée par le panoramique filé (même mouvement que la sortie de S4).
  tl.fromTo(a, { x: 2300 }, { x: 0, duration: 0.6, ease: "whip" }, WHIP);
  onFrame((t) => {
    const on = t > WHIP && t < WHIP + 0.62;
    s.style.filter = on && document.getElementById("mblur-x-k").getAttribute("stdDeviation") !== "0 0" ? "url(#mblur-x)" : "";
  });

  const b3d = a.querySelector(".s5-a-3d");
  tl.fromTo(b3d, { rotationX: 16, rotationY: -10, y: 60 }, { rotationX: 5, rotationY: -6, y: 0, duration: 1.4, ease: "expo.out" }, 33.7);
  tl.to(b3d, { scale: 1.05, duration: 3, ease: "none" }, 34.3);
  tl.fromTo(a.querySelector(".s5-a-head .overline span"), { yPercent: 120 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 33.9);
  tl.fromTo(a.querySelector(".s5-a-head .title span"), { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: "expo.out" }, 34.0);

  const today = a.querySelector(".s5-today");
  tl.set(today, { autoAlpha: 1 }, 34.8);
  tl.fromTo(today, { scaleY: 0.2 }, { scaleY: 1, duration: 0.5, ease: "expo.out", immediateRender: false }, 34.8);
  cue("tick", 34.8, { gain: 0.6 });

  const newcell = a.querySelector(".s5-newcell");
  tl.set(newcell, { autoAlpha: 1 }, 35.3);
  tl.fromTo(newcell, { scale: 0.4 }, { scale: 1, duration: 0.45, ease: "back.out(2.4)", immediateRender: false }, 35.3);
  cue("pop", 35.3);

  const phone = a.querySelector(".s5-a-phone");
  gsap.set(phone, { scale: 0.86 });
  tl.fromTo(phone, { y: 520, rotation: 8 }, { y: 0, rotation: -4, duration: 0.9, ease: "expo.out" }, 34.3);
  cue("whoosh", 34.3, { gain: 0.5, low: true });

  // L'étincelle voyage du web vers le mobile.
  const arc = a.querySelector(".s5-arc");
  const arcPath = arc.querySelector("path");
  const spark = arc.querySelector(".s5-spark");
  tl.set(arc, { autoAlpha: 1 }, 35.45);
  tl.fromTo(arcPath, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.4, ease: "power2.inOut", immediateRender: false }, 35.45);
  tl.to(arcPath, { drawSVG: "100% 100%", duration: 0.35, ease: "power2.in" }, 35.85);
  tl.to(spark, { motionPath: { path: arcPath, align: arcPath, alignOrigin: [0.5, 0.5] }, duration: 0.45, ease: "power2.inOut" }, 35.45);
  tl.to(spark, { autoAlpha: 0, duration: 0.1 }, 35.9);
  cue("zap", 35.45);

  const ptoast = a.querySelector(".s5-ptoast");
  tl.set(ptoast, { autoAlpha: 1 }, 35.9);
  tl.fromTo(ptoast, { y: -110 }, { y: 0, duration: 0.5, ease: "back.out(1.5)", immediateRender: false }, 35.9);
  cue("notif", 35.9);
  const sync = a.querySelector(".s5-sync");
  tl.set(sync, { autoAlpha: 1 }, 36.25);
  tl.fromTo(sync, { scale: 0.6, y: 20 }, { scale: 1, y: 0, duration: 0.5, ease: "back.out(2)", immediateRender: false }, 36.25);
  cue("pop", 36.25, { gain: 0.6 });

  // ------------------------------------------------------------ B. Pointage
  const b = el(`
    <div class="s5-b layer">
      <div class="s5-bg-light layer"><i class="blob b3"></i></div>
      <div class="s5-copy">
        <div class="overline"><span>Sur le terrain</span></div>
        <h2 class="title"><span class="ln"><span>Pointage</span></span><span class="ln"><span><em class="grad-teal">en un geste.</em></span></span></h2>
        <p class="lead"><span>Photo et position GPS à chaque arrivée,<br>prêts pour la paie. Zéro ressaisie.</span></p>
      </div>
      <div class="punch">
        <div class="punch-top"><div><b class="p-title">Vous n'êtes pas pointé</b><b class="p-title2">En poste depuis 08:02</b><span>Mon historique de pointage</span></div>${icon("arrow-right", { size: 22 })}</div>
        <div class="punch-stats">
          <div><em>Cette semaine</em><b class="p-week">0 min</b></div>
          <div><em>Validées</em><b class="green">0 min</b></div>
          <div><em>En attente</em><b class="orange p-wait">0 min</b></div>
        </div>
        <div class="punch-btn"><i class="p-bg-out"></i><span class="p-in">Pointer mon arrivée</span><span class="p-out">Pointer ma sortie</span><i class="p-ripple"></i></div>
        <div class="punch-proof">
          <span class="proof">${icon("camera", { size: 18 })}Photo prise<i>${icon("check", { size: 13, stroke: 3.4 })}</i></span>
          <span class="proof">${icon("map-pin", { size: 18 })}Position vérifiée<i>${icon("check", { size: 13, stroke: 3.4 })}</i></span>
        </div>
      </div>
      <div class="finger"></div>
    </div>`);
  s.appendChild(b);
  tl.set(b, { autoAlpha: 1 }, 37.0);
  tl.fromTo(b, { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", duration: 0.5, ease: "expo.inOut", immediateRender: false }, 36.9);
  tl.to(a, { x: -500, duration: 0.5, ease: "expo.inOut" }, 36.9);
  cue("whoosh", 36.9, { gain: 0.6 });

  tl.fromTo(b.querySelector(".overline span"), { yPercent: 120 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 37.15);
  tl.fromTo(b.querySelectorAll(".title .ln > span"), { yPercent: 115 }, { yPercent: 0, duration: 0.8, stagger: 0.08, ease: "expo.out" }, 37.2);
  tl.fromTo(b.querySelector(".lead span"), { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: "expo.out" }, 37.45);

  const punch = b.querySelector(".punch");
  tl.fromTo(punch, { y: 80, rotationX: 25, opacity: 0 }, { y: 0, rotationX: 0, opacity: 1, duration: 0.8, ease: "expo.out" }, 37.1);
  const finger = b.querySelector(".finger");
  tl.set(finger, { autoAlpha: 1 }, 37.35);
  tl.fromTo(finger, { x: 180, y: 220, scale: 1.2 }, { x: 0, y: 0, scale: 1, duration: 0.35, ease: "power3.out", immediateRender: false }, 37.35);
  tl.to(finger, { scale: 0.85, duration: 0.08, ease: "power2.in" }, 37.72);
  tl.to(finger, { scale: 1, x: 120, y: 160, autoAlpha: 0, duration: 0.35, ease: "power2.in" }, 37.85);
  const btn = b.querySelector(".punch-btn");
  tl.to(btn, { scale: 0.95, duration: 0.08 }, 37.72);
  tl.to(btn, { scale: 1, duration: 0.3, ease: "back.out(3)" }, 37.8);
  const ripple = b.querySelector(".p-ripple");
  tl.set(ripple, { autoAlpha: 0.5, scale: 0 }, 37.78);
  tl.to(ripple, { scale: 3, autoAlpha: 0, duration: 0.5, ease: "power2.out" }, 37.78);
  cue("tap", 37.78);
  shake(37.78, 5, 0.25);
  // Le bouton bascule : arrivée pointée, sortie proposée.
  tl.to(b.querySelector(".p-bg-out"), { opacity: 1, duration: 0.3, ease: "power2.out" }, 37.9);
  tl.to(btn, { boxShadow: "0 18px 36px -12px rgba(220, 38, 38, 0.25)", duration: 0.3 }, 37.9);
  tl.to(b.querySelector(".p-in"), { yPercent: -120, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, 37.9);
  tl.fromTo(b.querySelector(".p-out"), { yPercent: 120, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.35, ease: "back.out(2)" }, 38.05);
  tl.to(b.querySelector(".p-title"), { yPercent: -100, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, 37.9);
  tl.fromTo(b.querySelector(".p-title2"), { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: "expo.out" }, 38.0);
  counter(b.querySelector(".p-week"), 38.0, 0.9, 0, 482, (v) => `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, "0")}`);
  counter(b.querySelector(".p-wait"), 38.0, 0.9, 0, 2, (v) => `${Math.round(v)} min`);
  b.querySelectorAll(".proof").forEach((p, i) => {
    const t = 38.25 + i * 0.3;
    tl.set(p, { autoAlpha: 1 }, t);
    tl.fromTo(p, { scale: 0.5, y: 14 }, { scale: 1, y: 0, duration: 0.45, ease: "back.out(2.5)", immediateRender: false }, t);
    cue("check", t, { gain: 0.6 });
  });

  // ------------------------------------------------------------ C. Signalement photo
  const c = el(`
    <div class="s5-c layer">
      <div class="s5-bg-dark layer"></div>
      <img class="s5-c-backdrop" src="../site/assets/img/bureaux-1400.webp" alt="">
      <div class="viewfinder">
        <img src="../site/assets/img/bureaux-1400.webp" alt="">
        <div class="vf-ui"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><span class="vf-focus"></span><span class="vf-label">PHOTO</span></div>
        <span class="vf-shutter"><i></i></span>
      </div>
      <div class="report">
        <div class="report-top">
          <img src="../site/assets/img/bureaux-600.webp" alt="">
          <div><i>${icon("triangle-alert", { size: 15, stroke: 2.4 })}SIGNALEMENT</i><b>Sol endommagé dans le couloir.</b><span>Karim B. · Bureaux TechCorp · 09:14</span></div>
        </div>
        <div class="steps">
          ${["Nouveau", "En cours", "Traité", "Validé"].map((st) => `<div class="step"><span class="bullet">${icon("check", { size: 16, stroke: 3.2 })}</span><em>${st}</em></div>`).join("")}
          <i class="steps-line"><b></b></i>
        </div>
      </div>
      <div class="s5-c-copy">
        <div class="overline"><span>Signalements avec photo</span></div>
        <h2 class="title"><span class="ln"><span>Signalé en 10 secondes,</span></span><span class="ln"><span><em class="grad-bright">suivi jusqu'au bout.</em></span></span></h2>
      </div>
    </div>`);
  s.appendChild(c);
  tl.set(c, { autoAlpha: 1 }, 38.95);
  tl.fromTo(c, { clipPath: "circle(0px at 1360px 540px)" }, { clipPath: "circle(1700px at 1360px 540px)", duration: 0.5, ease: "power3.in", immediateRender: false }, 38.95);
  cue("whoosh", 38.95, { gain: 0.6, low: true });

  const vf = c.querySelector(".viewfinder");
  tl.fromTo(vf.querySelector("img"), { scale: 1.25 }, { scale: 1.08, duration: 1.2, ease: "power2.out" }, 38.95);
  tl.fromTo(vf.querySelector(".vf-focus"), { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power3.out" }, 39.15);
  tl.to(vf.querySelector(".vf-focus"), { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1 }, 39.4);
  // Déclencheur + flash.
  tl.to(vf.querySelector(".vf-shutter i"), { scale: 0.8, duration: 0.07, yoyo: true, repeat: 1 }, 39.5);
  const flash = document.getElementById("flash");
  tl.set(flash, { opacity: 0.95 }, 39.55);
  tl.to(flash, { opacity: 0, duration: 0.35, ease: "power2.out" }, 39.55);
  cue("shutter", 39.52);
  // La photo devient la carte de signalement.
  tl.to(vf, { scale: 0.34, x: -330, y: -24, rotation: -3, autoAlpha: 0, duration: 0.45, ease: "expo.inOut" }, 39.6);
  tl.fromTo(c.querySelector(".s5-c-backdrop"), { opacity: 0, scale: 1.1 }, { opacity: 0.22, scale: 1, duration: 0.8, ease: "power2.out" }, 39.6);
  const report = c.querySelector(".report");
  tl.set(report, { autoAlpha: 1 }, 39.7);
  tl.fromTo(report, { scale: 0.8, y: 40 }, { scale: 1, y: 0, duration: 0.6, ease: "back.out(1.6)", immediateRender: false }, 39.7);
  tl.fromTo(c.querySelector(".s5-c-copy .overline span"), { yPercent: 120 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 39.7);
  tl.fromTo(c.querySelectorAll(".s5-c-copy .title .ln > span"), { yPercent: 115 }, { yPercent: 0, duration: 0.8, stagger: 0.08, ease: "expo.out" }, 39.75);
  const steps = [...c.querySelectorAll(".step")];
  const line = c.querySelector(".steps-line b");
  steps.forEach((st, i) => {
    const t = 40.0 + i * 0.3;
    tl.to(st.querySelector(".bullet"), { backgroundColor: i === 3 ? "#16a34a" : "#0e7490", color: "#ffffff", scale: 1.15, duration: 0.18, ease: "power2.out" }, t);
    tl.to(st.querySelector(".bullet"), { scale: 1, duration: 0.25, ease: "back.out(3)" }, t + 0.18);
    tl.to(st.querySelector("em"), { color: "#ffffff", duration: 0.2 }, t);
    if (i > 0) tl.to(line, { scaleX: i / 3, duration: 0.3, ease: "power2.inOut" }, t - 0.3);
    cue("step", t, { gain: 0.7, n: i });
  });

  // ------------------------------------------------------------ D. Le temps gagné
  const d = el(`
    <div class="s5-d layer">
      <div class="s5-bg-dark layer"><i class="s5-halo"></i></div>
      <div class="big-copy">
        <div class="overline"><span>L'essentiel</span></div>
        <div class="big-num"><b class="n1">0</b><span class="to">à</span><b class="n2">0</b><span class="unit">h</span></div>
        <div class="big-sub"><span>récupérées chaque semaine, rien que sur l'encadrement.</span></div>
      </div>
      <div class="kpis">
        <div class="kpi"><b>0</b><span>ressaisie avant la paie</span></div>
        <div class="kpi"><b>3</b><span>formats d'export : Excel, PDF, CSV</span></div>
        <div class="kpi"><b>100 %</b><span>des validations horodatées</span></div>
      </div>
    </div>`);
  s.appendChild(d);
  tl.set(d, { autoAlpha: 1 }, 40.95);
  tl.fromTo(d, { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: "expo.inOut", immediateRender: false }, 40.95);
  tl.to(c, { yPercent: -30, duration: 0.55, ease: "expo.inOut" }, 40.95);
  cue("whoosh", 40.95, { gain: 0.6 });
  tl.fromTo(d.querySelector(".overline span"), { yPercent: 120 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 41.3);
  const num = d.querySelector(".big-num");
  tl.fromTo(num, { scale: 0.7, filter: "blur(18px)", opacity: 0 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.7, ease: "expo.out" }, 41.3);
  counter(d.querySelector(".n1"), 41.35, 1.1, 0, 5, (v) => Math.round(v));
  counter(d.querySelector(".n2"), 41.45, 1.2, 0, 8, (v) => Math.round(v));
  cue("count", 41.35, { dur: 1.3 });
  tl.fromTo(d.querySelector(".big-sub span"), { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out" }, 41.9);
  d.querySelectorAll(".kpi").forEach((k, i) => {
    const t = 42.1 + i * 0.25;
    tl.set(k, { autoAlpha: 1 }, t);
    tl.fromTo(k, { y: 50, scale: 0.9 }, { y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)", immediateRender: false }, t);
    cue("pop", t, { gain: 0.5 });
  });
  shake(41.35, 6, 0.3);

  // Sortie vers S6 : le chiffre fonce vers la caméra.
  tl.to(d.querySelector(".big-copy"), { scale: 3.2, opacity: 0, filter: "blur(16px)", duration: 0.7, ease: "power3.in" }, 43.35);
  tl.to(d.querySelector(".kpis"), { y: 200, opacity: 0, duration: 0.5, ease: "power3.in" }, 43.35);
  cue("riser", 42.3, { dur: 1.7 });
});
