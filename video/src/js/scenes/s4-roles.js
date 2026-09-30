// S4 — LES RÔLES (26 → 34 s)
// Ouverture à l'iris vers un décor sombre. Le téléphone héros prend la place
// centrale (Superviseur) et quatre autres téléphones se déploient derrière lui
// comme un jeu de cartes : Employé, Chef d'équipe, RH, Direction — chacun avec
// sa vraie capture d'écran. Balayage lumineux rôle par rôle sur les temps,
// puis les cadenas : accès sécurisés, gérés par la RH.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, shake } = DC;
  const hero = DC.hero;
  const s = DC.scene("s4", 25.95, 34.2);
  s.style.zIndex = 4;

  s.innerHTML = `
    <div class="s4-bg layer"><i class="s4-glow g1"></i><i class="s4-glow g2"></i><div class="s4-floor"></div></div>
    <div class="s4-head">
      <div class="overline s4-over"><span>Accès adapté au rôle de chacun</span></div>
      <h2 class="s4-title title"><span class="t1">Chacun voit exactement <em class="grad-bright">ce qui le concerne.</em></span></h2>
      <h2 class="s4-title title"><span class="t2">${icon("lock", { size: 56, stroke: 2.4 })} Accès sécurisés, <em class="grad-bright">gérés par la RH.</em></span></h2>
    </div>
    <div class="s4-stage"></div>
    <div class="s4-labels"></div>`;
  const stage3d = s.querySelector(".s4-stage");
  // Les cadenas passent devant le téléphone héros (qui vit au-dessus des scènes).
  const front = DC.scene("s4-front", 25.95, 34.2);
  front.style.zIndex = 11;
  const labels = s.querySelector(".s4-labels");

  // Iris : le décor sombre s'ouvre depuis le téléphone.
  const bg = s.querySelector(".s4-bg");
  tl.fromTo(bg, { clipPath: "circle(0px at 1340px 546px)" }, { clipPath: "circle(2300px at 1340px 546px)", duration: 0.75, ease: "power3.in" }, 25.95);
  cue("whoosh", 25.95, { gain: 0.7, low: true });

  // Les rôles, dans l'ordre hiérarchique. Le Superviseur (centre) est le héros.
  const ROLES = [
    ["user", "Employé", "Sait quoi faire, où et quand", "home.png", -680, 24, 0.54],
    ["hard-hat", "Chef d'équipe", "Pilote le terrain, sur ses chantiers", "missions.png", -345, 12, 0.6],
    ["calendar-days", "Superviseur", "Organise le planning, valide les heures", "planning-tour.png", 0, 0, 0.66],
    ["user-round-cog", "RH", "Gère les comptes et les personnes", "staff-hours.png", 345, -12, 0.6],
    ["chart-column", "Direction", "Vue globale de toute l'entreprise", "commercial-dashboard.png", 680, -24, 0.54],
  ];
  const PHONE_Y = -60;
  const phones = ROLES.map(([, , , shot, x, rotY, scale], i) => {
    if (i === 2) {
      // Le héros change d'écran et rejoint le centre.
      const scr = el(`<div class="scr scr-role">${UI.shotScreen(shot)}</div>`);
      hero.screens.appendChild(scr);
      tl.set(scr, { autoAlpha: 1 }, 26.25);
      tl.fromTo(scr, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, 26.25);
      tl.to(hero.phone, { x: 0, y: PHONE_Y, scale, rotationY: 0, rotationX: 0, rotationZ: 0, duration: 0.9, ease: "expo.inOut" }, 25.95);
      return hero.phone;
    }
    const p = el(`<div class="s4-phone">${UI.phone(UI.shotScreen(shot), "on-dark")}</div>`);
    stage3d.appendChild(p);
    // Distribution "en éventail" depuis l'arrière du téléphone central.
    const t = 26.55 + [0, 0.1, 0, 0.1, 0.2][i] + (i > 2 ? 0.05 : 0);
    tl.set(p, { autoAlpha: 1 }, t);
    tl.fromTo(
      p,
      { x: 0, y: PHONE_Y, scale: scale * 0.8, rotationY: 0, z: -200 },
      { x, y: PHONE_Y + Math.abs(x) * 0.02, scale, rotationY: rotY, z: -Math.abs(x) * 0.25, duration: 0.9, ease: "expo.out", immediateRender: false },
      t
    );
    cue("deal", t, { pan: x / 700, gain: 0.7 });
    return p;
  });

  // Étiquettes sous chaque téléphone.
  const tags = ROLES.map(([ic, name, line, , x], i) => {
    const tag = el(`<div class="s4-tag"><span class="s4-role">${icon(ic, { size: 22, stroke: 2.2 })}${name}</span><em>${line}</em></div>`);
    tag.style.left = `${960 + x - 150}px`;
    labels.appendChild(tag);
    const t = 27.0 + i * 0.1;
    tl.set(tag, { autoAlpha: 1 }, t);
    tl.fromTo(tag, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "expo.out", immediateRender: false }, t);
    return tag;
  });

  // Titre.
  tl.fromTo(s.querySelector(".s4-over span"), { yPercent: 120 }, { yPercent: 0, duration: 0.7, ease: "expo.out" }, 26.3);
  const t1 = s.querySelector(".t1");
  tl.fromTo(t1, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: "expo.out" }, 26.4);

  // Balayage : chaque rôle s'illumine sur un temps.
  const DIM = 0.42;
  ROLES.forEach((_, i) => {
    const t = 28.0 + i * 0.5;
    phones.forEach((p, j) => {
      const target = p === hero.phone ? p.querySelector(".phone") : p.firstElementChild;
      tl.to(target, { filter: `brightness(${j === i ? 1.08 : DIM})`, duration: 0.25, ease: "power2.out" }, t);
    });
    tags.forEach((tag, j) => tl.to(tag, { opacity: j === i ? 1 : 0.35, duration: 0.25, ease: "power2.out" }, t));
    tl.fromTo(tags[i].querySelector(".s4-role"), { scale: 1 }, { scale: 1.12, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, t);
    cue("tick", t, { gain: 0.75, pan: ROLES[i][4] / 700 });
  });
  phones.forEach((p) => {
    const target = p === hero.phone ? p.querySelector(".phone") : p.firstElementChild;
    tl.to(target, { filter: "brightness(1)", duration: 0.35, ease: "power2.out" }, 30.5);
  });
  tl.to(tags, { opacity: 1, duration: 0.35, ease: "power2.out" }, 30.5);

  // Deuxième titre + cadenas qui se ferment sur chaque téléphone.
  tl.to(t1, { yPercent: -110, duration: 0.45, ease: "power3.in" }, 30.4);
  const t2 = s.querySelector(".t2");
  tl.fromTo(t2, { yPercent: 140 }, { yPercent: 0, duration: 0.8, ease: "expo.out" }, 30.75);
  phones.forEach((p, i) => {
    const lock = el(`<div class="s4-lock"><span class="shackle"></span><span class="body">${icon("check", { size: 18, stroke: 3.2 })}</span></div>`);
    const x = 960 + ROLES[i][4];
    lock.style.left = `${x - 34}px`;
    front.appendChild(lock);
    const t = 30.9 + i * 0.12;
    tl.set(lock, { autoAlpha: 1 }, t);
    tl.fromTo(lock, { scale: 0.3, y: 20 }, { scale: 1, y: 0, duration: 0.45, ease: "back.out(2.2)", immediateRender: false }, t);
    tl.fromTo(lock.querySelector(".shackle"), { y: -12 }, { y: 0, duration: 0.18, ease: "power4.in", immediateRender: false }, t + 0.3);
    cue("lock", t + 0.46, { pan: ROLES[i][4] / 700 });
  });
  shake(31.9, 6, 0.3);

  // Sortie : panoramique filé vers la gauche (flou de mouvement directionnel).
  const WHIP = 33.35;
  const movers = [stage3d, labels, s.querySelector(".s4-head"), front];
  tl.to(movers, { x: -2300, duration: 0.6, ease: "whip" }, WHIP);
  tl.to(hero.phone, { x: -2300, duration: 0.6, ease: "whip" }, WHIP);
  tl.set(hero.stage, { autoAlpha: 0 }, 34.0);
  const blurK = document.getElementById("mblur-x-k");
  const mb = { v: 0 };
  tl.to(mb, { v: 60, duration: 0.3, ease: "power2.in" }, WHIP);
  tl.to(mb, { v: 0, duration: 0.3, ease: "power2.out" }, WHIP + 0.3);
  DC.onFrame((t) => {
    const on = t > WHIP && t < WHIP + 0.62 && mb.v > 2;
    blurK.setAttribute("stdDeviation", `${on ? mb.v.toFixed(1) : 0} 0`);
    const f = on ? "url(#mblur-x)" : "";
    s.style.filter = f;
    front.style.filter = f;
    hero.stage.style.filter = f;
  });
  cue("whip", WHIP);
});
