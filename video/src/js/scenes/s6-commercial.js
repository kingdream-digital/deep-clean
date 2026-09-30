// S6 — COMMERCIAL (44 → 52 s) : "un vrai suivi, du devis jusqu'à la facture".
// Le pipeline Prospect → Client → Devis → Chantier → Facture s'allume sur les
// temps, puis un devis se construit ligne par ligne (totaux calculés), passe
// par tous ses statuts jusqu'au tampon ACCEPTÉ, et la facture qui en découle
// finit PAYÉE — sans aucune ressaisie.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, shake, counter } = DC;
  const s = DC.scene("s6", 43.9, 52.4);
  s.style.zIndex = 6;

  const eur = (v) => `${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;

  s.innerHTML = `
    <div class="s6-bg layer"><i class="s6-aurora a1"></i><i class="s6-aurora a2"></i><div class="s6-grid layer"></div></div>
    <div class="s6-head">
      <div class="overline"><span>Nouveau · module commercial</span></div>
      <h2 class="title"><span>Du premier contact <em class="grad-bright">jusqu'à la facture.</em></span></h2>
    </div>
    <div class="pipe">
      <svg class="pipe-line" viewBox="0 0 1500 20"><path d="M60,10 L1440,10" stroke="rgba(255,255,255,0.12)" stroke-width="4" stroke-linecap="round"/><path class="pipe-fill" d="M60,10 L1440,10" stroke="url(#s6pipe)" stroke-width="4" stroke-linecap="round"/><defs><linearGradient id="s6pipe" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#5eead4"/></linearGradient></defs></svg>
      <i class="pipe-spark"></i>
    </div>
    <div class="quote">
      <div class="q-head">
        <div><em>DEV-2026-0004</em><b>Coworking Le Phare</b><span>Entretien quotidien espace coworking</span></div>
        <div class="q-status">${["Brouillon", "À valider", "Validé", "Envoyé", "Accepté"].map((st, i) => `<span class="qs qs-${i}">${st}</span>`).join("")}</div>
      </div>
      <div class="q-lines">
        <div class="q-line"><div><b>Entretien quotidien espace coworking</b><span>Quotidienne · 22 / mois</span></div><strong>54,00 €</strong></div>
        <div class="q-line"><div><b>Vitrerie mensuelle</b><span>Mensuelle · 1 / mois</span></div><strong>60,00 €</strong></div>
      </div>
      <div class="q-totals">
        <div><span>Sous-total HT</span><b class="q-ht">0,00 €</b></div>
        <div><span>TVA (20 %)</span><b class="q-tva">0,00 €</b></div>
        <div class="q-ttc"><span>Total TTC</span><b class="q-total">0,00 €</b></div>
      </div>
      <div class="q-mail">${icon("send", { size: 17 })}Envoyé par e-mail · PDF joint</div>
      <div class="stamp stamp-ok">Accepté</div>
    </div>
    <div class="invoice">
      <div class="i-top"><span class="i-ic">${icon("receipt", { size: 26 })}</span><div><em>FAC-2026-0001</em><b>Syndic Résidence Les Tilleuls</b></div></div>
      <div class="i-amount">0,00 €</div>
      <div class="i-status">${["À préparer", "Envoyée", "Payée"].map((st, i) => `<span class="is is-${i}">${st}</span>`).join("")}</div>
      <p>Générée depuis le devis accepté.<br><b>Aucune ressaisie.</b></p>
      <div class="stamp stamp-paid">Payée</div>
    </div>`;

  // Impact d'entrée (second "drop" de la musique).
  tl.fromTo(s.querySelector(".s6-bg"), { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, 43.9);
  const leak = document.getElementById("leak");
  tl.set(leak, { opacity: 0.9 }, 44.0);
  tl.to(leak, { opacity: 0, duration: 0.9, ease: "power2.out" }, 44.0);
  shake(44.0, 12, 0.5);
  cue("impact", 44.0, { gain: 0.85 });

  tl.fromTo(s.querySelector(".s6-head .overline span"), { yPercent: 120 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, 43.98);
  tl.fromTo(s.querySelector(".s6-head .title span"), { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: "expo.out" }, 44.04);

  // Pipeline : un nœud par temps.
  const STEPS = [
    ["user-plus", "Prospect"],
    ["handshake", "Client"],
    ["file-pen-line", "Devis"],
    ["building-2", "Chantier"],
    ["receipt", "Facture"],
  ];
  const pipe = s.querySelector(".pipe");
  const nodes = STEPS.map(([ic, label], i) => {
    const n = el(`<div class="node"><span class="node-c"><i class="node-glow"></i>${icon(ic, { size: 34, stroke: 1.9 })}</span><b>${label}</b><em>0${i + 1}</em></div>`);
    n.style.left = `${60 + i * 345 - 70}px`;
    pipe.appendChild(n);
    return n;
  });
  const fill = s.querySelector(".pipe-fill");
  const spark = s.querySelector(".pipe-spark");
  tl.fromTo(fill, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 2.0, ease: "none" }, 44.5);
  tl.fromTo(spark, { x: 60 }, { x: 1440, duration: 2.0, ease: "none" }, 44.5);
  tl.set(spark, { autoAlpha: 1 }, 44.5);
  tl.to(spark, { autoAlpha: 0, duration: 0.2 }, 46.5);
  nodes.forEach((n, i) => {
    const t = 44.5 + i * 0.5;
    tl.fromTo(n, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "expo.out" }, 44.3 + i * 0.06);
    const c = n.querySelector(".node-c");
    tl.to(c, { backgroundColor: "#0e7490", borderColor: "#22d3ee", color: "#ffffff", duration: 0.2, ease: "power2.out" }, t);
    tl.fromTo(c, { scale: 1 }, { scale: 1.18, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, t);
    tl.to(n.querySelector(".node-glow"), { opacity: 1, duration: 0.3 }, t);
    tl.to(n.querySelector("b"), { color: "#ffffff", duration: 0.2 }, t);
    cue("step", t, { gain: 0.75, n: i });
  });

  // Devis : arrive, se remplit, les totaux se calculent.
  const quote = s.querySelector(".quote");
  tl.set(quote, { autoAlpha: 1 }, 46.7);
  tl.fromTo(quote, { y: 140, rotationX: 22, scale: 0.92 }, { y: 0, rotationX: 0, scale: 1, duration: 0.8, ease: "expo.out", immediateRender: false }, 46.7);
  cue("whoosh", 46.7, { gain: 0.55 });
  s.querySelectorAll(".q-line").forEach((l, i) => {
    const t = 47.0 + i * 0.25;
    tl.set(l, { autoAlpha: 1 }, t);
    tl.fromTo(l, { x: -30 }, { x: 0, duration: 0.45, ease: "expo.out", immediateRender: false }, t);
    cue("tick", t, { gain: 0.5 });
  });
  counter(s.querySelector(".q-ht"), 47.4, 0.7, 0, 114, eur);
  counter(s.querySelector(".q-tva"), 47.5, 0.7, 0, 22.8, eur);
  counter(s.querySelector(".q-total"), 47.6, 0.8, 0, 136.8, eur);
  cue("count", 47.4, { dur: 0.9 });

  // Statuts du devis, sur les temps : Brouillon → À valider → Validé → Envoyé → Accepté.
  const qs = [...s.querySelectorAll(".qs")];
  tl.set(qs[0], { autoAlpha: 1 }, 46.7);
  [48.0, 48.5, 49.0, 49.5].forEach((t, i) => {
    tl.to(qs[i], { yPercent: -100, autoAlpha: 0, duration: 0.2, ease: "power2.in" }, t);
    tl.set(qs[i + 1], { autoAlpha: 1 }, t + 0.1);
    tl.fromTo(qs[i + 1], { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t + 0.1);
    cue("tick", t + 0.1, { gain: 0.6 });
  });
  const mail = s.querySelector(".q-mail");
  tl.set(mail, { autoAlpha: 1 }, 49.1);
  tl.fromTo(mail, { x: -20 }, { x: 0, duration: 0.4, ease: "expo.out", immediateRender: false }, 49.1);
  tl.fromTo(mail.querySelector(".ic"), { x: -30, y: 12, rotation: -20 }, { x: 0, y: 0, rotation: 0, duration: 0.4, ease: "back.out(2)", immediateRender: false }, 49.1);
  cue("send", 49.05);
  const stampOk = s.querySelector(".stamp-ok");
  tl.set(stampOk, { autoAlpha: 1 }, 49.55);
  tl.fromTo(stampOk, { scale: 2.6, rotation: -24, opacity: 0 }, { scale: 1, rotation: -12, opacity: 1, duration: 0.22, ease: "power4.in", immediateRender: false }, 49.55);
  shake(49.77, 10, 0.35);
  cue("stamp", 49.77);

  // Facture générée depuis le devis, puis payée.
  const inv = s.querySelector(".invoice");
  tl.set(inv, { autoAlpha: 1 }, 50.0);
  tl.fromTo(inv, { x: 260, rotation: 6, scale: 0.9 }, { x: 0, rotation: 0, scale: 1, duration: 0.7, ease: "expo.out", immediateRender: false }, 50.0);
  cue("whoosh", 50.0, { gain: 0.5 });
  counter(s.querySelector(".i-amount"), 50.15, 0.8, 0, 1209.6, eur);
  const is = [...s.querySelectorAll(".is")];
  tl.set(is[0], { autoAlpha: 1 }, 50.0);
  [50.5, 51.0].forEach((t, i) => {
    tl.to(is[i], { yPercent: -100, autoAlpha: 0, duration: 0.2, ease: "power2.in" }, t);
    tl.set(is[i + 1], { autoAlpha: 1 }, t + 0.1);
    tl.fromTo(is[i + 1], { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t + 0.1);
    cue("tick", t + 0.1, { gain: 0.6 });
  });
  const stampPaid = s.querySelector(".stamp-paid");
  tl.set(stampPaid, { autoAlpha: 1 }, 51.05);
  tl.fromTo(stampPaid, { scale: 2.6, rotation: 20, opacity: 0 }, { scale: 1, rotation: 9, opacity: 1, duration: 0.22, ease: "power4.in", immediateRender: false }, 51.05);
  shake(51.27, 10, 0.35);
  cue("stamp", 51.27);

  // Sortie : tout recule dans la profondeur.
  const all = [s.querySelector(".s6-head"), pipe, quote, inv];
  tl.to(all, { scale: 0.86, opacity: 0, filter: "blur(10px)", duration: 0.4, stagger: 0.03, ease: "power3.in" }, 51.55);
  cue("riser", 51.2, { dur: 0.75, soft: true });
});
