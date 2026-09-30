// S1 — LE CONSTAT (0 → 6 s)
// Les outils d'avant s'accumulent à l'écran (groupes de discussion, SMS,
// tableur, papier, post-it, appels manqués…) de plus en plus vite ; des mots
// claquent sur les temps ; puis une raclette nettoie littéralement l'écran
// pour révéler l'univers Deep Clean. Clin d'œil au métier du client.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, onFrame, shake, rng, noise1, clamp, counter } = DC;
  const s = DC.scene("s1", 0, 5.95);
  s.style.zIndex = 5;

  s.innerHTML = `
    <div class="s1-bg layer"></div>
    <div class="s1-space layer"></div>
    <div class="s1-grime layer"></div>
    <div class="s1-words layer"></div>`;
  const space = s.querySelector(".s1-space");
  const words = s.querySelector(".s1-words");

  // Fragments : [x, y, profondeur 0 (proche) → 1 (loin), rotation, apparition, html]
  const frags = [
    [360, 250, 0.15, -4, 0.1, `
      <div class="f-notif">
        <span class="f-app">${icon("message-circle", { size: 22, stroke: 2.2 })}</span>
        <div><div class="f-notif-top"><b>Groupe « Équipe Nettoyage »</b><span>maintenant</span></div>
        <div class="f-notif-body">Karim : quelqu'un a le planning de demain ??</div></div>
        <span class="f-badge"><em class="s1-unread">12</em></span>
      </div>`],
    [1500, 215, 0.35, 5, 0.35, `<div class="f-bubble"><b style="color:#53bdeb">Karim</b>Qui a les clés du chantier ??<span>07:02</span></div>`],
    [1340, 690, 0.1, -3, 0.55, `
      <div class="f-excel">
        <div class="f-excel-bar">${icon("file-spreadsheet", { size: 18 })}planning_v7_FINAL(2).xlsx</div>
        <div class="f-excel-fx"><i>fx</i>=SI(B4="";"???";B4)</div>
        <table>
          <tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
          <tr><th>1</th><td>Nom</td><td>Lundi</td><td>Mardi</td><td>Chantier</td></tr>
          <tr><th>2</th><td>Karim</td><td>7h-9h</td><td class="y">??</td><td>Clinique</td></tr>
          <tr><th>3</th><td>Inès</td><td class="r">#REF!</td><td>14h-16h</td><td>Tilleuls</td></tr>
          <tr><th>4</th><td>Nathan</td><td>18h</td><td class="y">annulé?</td><td>TechCorp</td></tr>
          <tr><th>5</th><td>Sophie</td><td class="y">7h ou 8h</td><td>—</td><td class="r">#N/A</td></tr>
        </table>
      </div>`],
    [560, 760, 0.3, 3, 0.75, `<div class="f-sms"><em>SMS · +33 6 •• •• 42 17</em>Planning modifié demain, tu commences à 6h. Pas 7h. Enfin je crois</div>`],
    [240, 560, 0.55, -8, 0.95, `
      <div class="f-paper">
        <b>FEUILLE DE POINTAGE — SEM. 39</b>
        <p><span>Lundi</span><i>7h05 – 9h</i></p>
        <p><span>Mardi</span><i>7h – 9h15 ?</i></p>
        <p><span>Mercredi</span><i class="x">14h – 16h</i></p>
        <p><span>Jeudi</span><i>—</i></p>
        <span class="f-stain"></span>
      </div>`],
    [1700, 470, 0.5, 6, 1.1, `<div class="f-call">${icon("phone", { size: 20, stroke: 2.2 })}<div><b>3 appels manqués</b><span>Chef d'équipe</span></div></div>`],
    [900, 150, 0.6, -2, 1.25, `<div class="f-bubble"><b style="color:#f15c6d">Inès</b>Je suis malade demain, qqn peut me remplacer ?<span>07:09</span></div>`],
    [1640, 900, 0.45, 9, 1.4, `<div class="f-sticky">Rappeler le syndic !!!<br><small>+ produits vitres</small></div>`],
    [700, 470, 0.75, -3, 1.52, `
      <div class="f-mail">${icon("mail", { size: 18 })}<div><b>RE: RE: TR: Planning semaine 40</b><span>(version corrigée) ${icon("paperclip", { size: 13 })} planning_v8.xlsx</span></div></div>`],
    [1080, 900, 0.25, 4, 1.64, `
      <div class="f-photo"><img src="../site/assets/img/salle-de-bain-600.webp" alt=""><div>c'est normal ça ?? ${icon("image", { size: 13 })}</div><span>23:47</span></div>`],
    [300, 910, 0.65, -5, 1.74, `<div class="f-voice">${icon("phone", { size: 16 })}<span class="f-wave">${Array.from({ length: 22 }, (_, i) => `<i style="height:${6 + Math.abs(Math.sin(i * 1.7)) * 20}px"></i>`).join("")}</span>0:47</div>`],
    [1180, 330, 0.85, 3, 1.84, `<div class="f-bubble"><b style="color:#a5d6a7">Nathan</b>C'est quelle adresse déjà ?<span>07:14</span></div>`],
    [980, 620, 0.9, 0, 1.92, `<div class="f-99">99+</div>`],
    [140, 360, 0.8, 6, 2.25, `<div class="f-bubble small"><b style="color:#ffb74d">Sophie</b>Le client n'était pas au courant…<span>07:21</span></div>`],
    [1790, 640, 0.8, -6, 2.75, `<div class="f-99 small">24</div>`],
    [520, 110, 0.9, 2, 3.25, `<div class="f-bubble small"><b style="color:#53bdeb">Karim</b>Vous avez eu la nouvelle consigne ?<span>07:26</span></div>`],
    [1420, 1010, 0.85, -3, 3.75, `<div class="f-99 small">7</div>`],
  ];

  const items = frags.map(([x, y, d, rot, tIn, html], i) => {
    const wrap = el(`<div class="f-wrap"><div class="f-inner">${html}</div></div>`);
    space.appendChild(wrap);
    const inner = wrap.firstElementChild;
    const scale = 1.6 - d * 0.75;
    const blur = d > 0.5 ? (d - 0.5) * 7 : 0;
    inner.style.filter = blur ? `blur(${blur.toFixed(1)}px) brightness(${1 - d * 0.35})` : "";
    // Apparition "pop" + légère rotation qui se pose.
    tl.fromTo(inner, { scale: 0.4, autoAlpha: 0, rotation: rot * 3 }, { scale, autoAlpha: 1, rotation: rot, duration: 0.42, ease: "back.out(2.2)" }, tIn);
    cue(["ping", "buzz", "sms", "ping", "pop"][i % 5], tIn, { pan: (x - 960) / 960, gain: 0.5 + (1 - d) * 0.5 });
    return { wrap, x, y, d, seed: i * 13.7 };
  });

  // Dérive + travelling avant : chaque fragment s'écarte du centre d'autant
  // plus vite qu'il est proche (parallaxe), avec un flottement organique.
  const cx = 960;
  const cy = 540;
  onFrame((t) => {
    if (t > 6) return;
    const zoom = 1 + 0.07 * t + 0.02 * t * t;
    for (const it of items) {
      const k = 1 + (zoom - 1) * (1.3 - it.d);
      const stress = t > 4 ? (t - 4) * 5 : 0;
      const wx = noise1(t * 0.6 + it.seed, 1) * 14 + noise1(t * 9 + it.seed, 4) * stress;
      const wy = noise1(t * 0.5 + it.seed, 2) * 12 + noise1(t * 9 + it.seed, 5) * stress;
      const x = cx + (it.x - cx) * k + wx;
      const y = cy + (it.y - cy) * k + wy;
      it.wrap.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
    }
  });
  counter(s.querySelector(".s1-unread"), 0.1, 4.2, 12, 147, (v) => Math.round(v), "power1.in");

  // Les fragments s'effacent un peu derrière les mots, sans disparaître.
  tl.to(space, { opacity: 0.5, duration: 0.3, ease: "power2.out" }, 1.95);

  // Mots martelés sur chaque temps.
  const beats = [
    [2.0, "Papier."],
    [2.5, "Excel."],
    [3.0, "SMS."],
    [3.5, "Groupes WhatsApp."],
  ];
  beats.forEach(([t, text], i) => {
    const w = el(`<div class="s1-word">${text}</div>`);
    words.appendChild(w);
    tl.fromTo(w, { autoAlpha: 0, scale: 1.35, filter: "blur(14px)" }, { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 0.2, ease: "power4.out" }, t);
    tl.to(w, { scale: 0.97, duration: 0.3, ease: "none" }, t + 0.2);
    tl.set(w, { autoAlpha: 0 }, i < beats.length - 1 ? beats[i + 1][0] : 4.0);
    shake(t, 7, 0.3);
    cue("hit", t, { gain: 0.8 });
  });

  // "Tout est éparpillé." — et les lettres du dernier mot s'éparpillent vraiment.
  const final = el(`<div class="s1-final"><span class="s1-a">Tout est</span> <span class="s1-b">éparpillé.</span></div>`);
  words.appendChild(final);
  const split = DC.splitChars(final.querySelector(".s1-b"));
  tl.fromTo(final.querySelector(".s1-a"), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power4.out" }, 4.0);
  tl.fromTo(split.chars, { autoAlpha: 0, y: 60, rotation: 0 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.02, ease: "power4.out" }, 4.05);
  const r = rng(99);
  split.chars.forEach((c) => {
    tl.to(c, { x: (r() - 0.5) * 160, y: (r() - 0.5) * 120, rotation: (r() - 0.5) * 50, duration: 1.2, ease: "power2.in" }, 4.45);
  });
  shake(4.0, 16, 0.5);
  cue("hit", 4.0, { gain: 1, big: true });
  tl.to(space, { opacity: 0.8, scale: 1.04, duration: 1, ease: "power1.in" }, 4.0);

  // Grain de saleté "vitre sale" : taches, traînées, poussières (canvas à graine).
  (() => {
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext("2d");
    const q = rng(4242);
    for (let i = 0; i < 260; i++) {
      const x = q() * 1920;
      const y = q() * 1080;
      const rad = 20 + q() * 140;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.04 + q() * 0.08;
      grd.addColorStop(0, `rgba(170,160,140,${a})`);
      grd.addColorStop(1, "rgba(170,160,140,0)");
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.strokeStyle = "rgba(200,195,180,0.05)";
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 2 + q() * 10;
      g.beginPath();
      const x = q() * 1920;
      g.moveTo(x, q() * 300);
      g.bezierCurveTo(x + (q() - 0.5) * 80, 400, x + (q() - 0.5) * 120, 700, x + (q() - 0.5) * 60, 700 + q() * 380);
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(230,225,210,${0.05 + q() * 0.18})`;
      g.beginPath();
      g.arc(q() * 1920, q() * 1080, 0.5 + q() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
    s.querySelector(".s1-grime").style.backgroundImage = `url(${c.toDataURL()})`;
  })();
  tl.fromTo(s.querySelector(".s1-grime"), { opacity: 0.35 }, { opacity: 0.9, duration: 1.5, ease: "power1.in" }, 3.5);

  // --- La raclette (5,0 → 5,9 s) ---------------------------------------------
  // S1 est rogné à gauche de la lame : ce qui est "nettoyé" laisse voir S2.
  const squeegee = el(`
    <div class="squeegee">
      <div class="sq-sheen"></div>
      <div class="sq-blade"><i class="sq-metal"></i><i class="sq-rubber"></i><i class="sq-wet"></i></div>
      <div class="sq-handle"><span>${DC.logoSVG({ fill: "#fff" })}</span></div>
      <div class="sq-drops"></div>
    </div>`);
  DC.camera.appendChild(squeegee);
  squeegee.style.zIndex = 50;
  const drops = squeegee.querySelector(".sq-drops");
  const dr = rng(7);
  for (let i = 0; i < 26; i++) {
    const size = 5 + dr() * 13;
    drops.appendChild(el(`<i style="top:${-80 + dr() * 1240}px;left:${4 + dr() * 16}px;width:${size}px;height:${size * 1.15}px"></i>`));
  }
  const wipe = { x: -260 };
  const TILT = 9; // degrés
  const slope = Math.tan((TILT * Math.PI) / 180) * 540;
  tl.set(squeegee, { autoAlpha: 1 }, 5.0);
  tl.to(wipe, { x: 2200, duration: 0.9, ease: "power2.inOut" }, 5.0);
  tl.set(squeegee, { autoAlpha: 0 }, 5.95);
  onFrame((t) => {
    if (t < 5 || t > 6) {
      s.style.clipPath = "";
      return;
    }
    const top = wipe.x + slope;
    const bottom = wipe.x - slope;
    s.style.clipPath = `polygon(${top.toFixed(1)}px 0, 1920px 0, 1920px 1080px, ${bottom.toFixed(1)}px 1080px)`;
    squeegee.style.transform = `translate3d(${wipe.x.toFixed(1)}px,0,0) rotate(${TILT}deg)`;
  });
  cue("squeegee", 5.0, { dur: 0.9 });
  cue("riser", 4.0, { dur: 1.75 });
});
