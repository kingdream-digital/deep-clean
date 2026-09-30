// S3 — COMMUNICATION (12 → 26 s) : le message clé du client.
// "De l'employé à la direction, Deep Clean centralise toute la communication."
// Le téléphone héros glisse à droite et vit sa vie (conversation qui arrive,
// liste des discussions, mission + consigne, notifications, documents) pendant
// qu'à gauche la liste des fonctionnalités se construit, une par mesure.
window.SCENES.push(() => {
  const { master: tl, el, icon, cue, onFrame } = DC;
  const { phone: phoneEl, screens } = DC.hero;
  const s = DC.scene("s3", 11.95, 26.6);
  s.style.zIndex = 3;
  const front = DC.scene("s3-front", 11.95, 26.6);
  front.style.zIndex = 12;

  // ---------------------------------------------------------------- décor + texte
  s.innerHTML = `
    <div class="s3-bg layer"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><div class="s3-dots layer"></div></div>
    <div class="s3-copy">
      <div class="overline s3-over"><span>Communication centralisée</span></div>
      <h1 class="s3-title display">De l'employé<br>à la direction,<br><span class="grad-teal">tout se dit ici.</span></h1>
      <p class="s3-lead lead">Deep Clean centralise toute la communication de l'entreprise, au bon endroit.</p>
      <div class="s3-feats"><i class="s3-rail"><b></b></i></div>
    </div>`;

  // Fondu du décor depuis celui de S2 (très proche) : pas de saut de lumière.
  tl.fromTo(s.querySelector(".s3-bg"), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 11.95);
  const blobs = [...s.querySelectorAll(".blob")];
  onFrame((t) => {
    if (t < 11.9 || t > 26.7) return;
    blobs.forEach((b, i) => {
      const x = Math.sin(t * 0.35 + i * 2.1) * 60;
      const y = Math.cos(t * 0.3 + i * 1.3) * 40;
      b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    });
  });

  // Entrée du titre : lignes masquées qui montent, décalées.
  const over = s.querySelector(".s3-over span");
  tl.fromTo(over, { yPercent: 120 }, { yPercent: 0, duration: 0.7, ease: "expo.out" }, 12.35);
  const titleLines = DC.splitLines(s.querySelector(".s3-title"));
  tl.fromTo(titleLines, { yPercent: 115 }, { yPercent: 0, duration: 0.9, stagger: 0.1, ease: "expo.out" }, 12.45);
  const lead = s.querySelector(".s3-lead");
  tl.fromTo(lead, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "silk" }, 12.95);
  cue("whoosh", 12.4, { gain: 0.45 });

  // Le titre s'efface vers le haut, place aux fonctionnalités.
  tl.to(titleLines, { yPercent: -115, duration: 0.45, stagger: 0.05, ease: "power3.in" }, 15.55);
  tl.to(lead, { autoAlpha: 0, y: -20, duration: 0.35, ease: "power2.in" }, 15.6);

  // ------------------------------------------------------ liste des fonctionnalités
  const FEATS = [
    ["messages-square", "Messagerie individuelle et de groupe", "Un tap pour écrire à n'importe quel collègue."],
    ["users", "Par équipe, chantier ou mission", "Chaque échange est rangé au bon endroit."],
    ["clipboard-list", "Consignes liées aux missions", "Toujours à jour, visibles avant d'arriver."],
    ["bell-ring", "Notifications ciblées", "Chacun ne reçoit que ce qui le concerne."],
    ["paperclip", "Partage de documents", "Photos, PDF, protocoles : tout reste attaché."],
  ];
  const featsBox = s.querySelector(".s3-feats");
  const rows = FEATS.map(([ic, label, sub], i) => {
    const row = el(`<div class="feat"><span class="feat-ic"><i class="feat-on"></i>${icon(ic, { size: 30, stroke: 2 })}</span><div><b>${label}</b><em>${sub}</em></div></div>`);
    row.style.top = `${i * 118}px`;
    featsBox.appendChild(row);
    return row;
  });
  const rail = s.querySelector(".s3-rail b");
  tl.fromTo(s.querySelector(".s3-rail"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 16.0);
  rows.forEach((row, i) => {
    const t = 16 + i * 2;
    tl.fromTo(row, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.7, ease: "expo.out" }, t);
    tl.fromTo(row.querySelector(".feat-ic"), { scale: 0.5 }, { scale: 1, duration: 0.6, ease: "back.out(2.5)" }, t + 0.05);
    tl.to(row.querySelector(".feat-on"), { opacity: 1, duration: 0.4, ease: "power2.out" }, t);
    tl.to(row.querySelector(".feat-ic"), { color: "#ffffff", duration: 0.4, ease: "power2.out" }, t);
    if (i > 0) {
      const prev = rows[i - 1];
      tl.to(prev, { opacity: 0.38, duration: 0.4, ease: "power2.out" }, t);
      tl.to(prev.querySelector(".feat-on"), { opacity: 0, duration: 0.4, ease: "power2.out" }, t);
      tl.to(prev.querySelector(".feat-ic"), { color: "#0e7490", duration: 0.4, ease: "power2.out" }, t);
    }
    tl.to(rail, { height: i * 118 + 32, duration: 0.6, ease: "expo.out" }, t);
    cue("feature", t, { gain: 0.8 });
  });

  // ------------------------------------------------------------------ téléphone
  // Pose "héros" : glisse à droite, pivote légèrement vers le texte.
  tl.to(phoneEl, { x: 380, y: 6, scale: 0.9, rotationY: -16, rotationX: 5, rotationZ: 1.2, duration: 1.1, ease: "expo.inOut" }, 11.95);
  cue("whoosh", 11.95, { gain: 0.6, low: true });
  const phoneBody = phoneEl.querySelector(".phone");
  onFrame((t) => {
    if (t < 12 || t > 26.8) return;
    const k = DC.clamp((t - 12.6) / 0.8) * DC.clamp((26.4 - t) / 0.4);
    phoneBody.style.transform = `translateY(${(Math.sin(t * 1.6) * 9 * k).toFixed(2)}px) rotateY(${(Math.sin(t * 0.8) * 2.5 * k).toFixed(2)}deg)`;
  });

  // ---- Écran 1 : conversation (les bulles arrivent, le fil défile)
  const chat = el(`
    <div class="scr scr-chat screen">
      ${UI.statusBar()}
      <div class="chat-head">${icon("arrow-right", { size: 22, cls: "back" })}${UI.avatar("MB:violet", 40)}<div><b>Marc Bellamy</b><span><i></i>Chef d'équipe · en ligne</span></div>${icon("phone", { size: 20, cls: "call" })}</div>
      <div class="chat-body"><div class="msgs"></div></div>
      <div class="chat-input"><span class="clip">${icon("paperclip", { size: 20 })}</span><span class="field">Votre message…</span><span class="send">${icon("send", { size: 18, stroke: 2.2 })}</span></div>
      ${UI.tabBar("Messagerie", 3)}
    </div>`);
  // Placé sous l'écran d'accueil et l'écran de lancement : l'icône qui s'ouvre
  // (S2) reste au-dessus jusqu'à son fondu, puis révèle la conversation.
  screens.insertBefore(chat, screens.firstChild);
  const msgs = chat.querySelector(".msgs");
  const MSGS = [
    [12.75, "out", "Oui, je viens de commencer le nettoyage du hall.", "08:02"],
    [13.75, "in", "Parfait. La RH a ajouté une nouvelle consigne pour la véranda, regarde côté mission.", "08:03", 13.3],
    [14.5, "out", "Reçu, je regarde ça tout de suite 👍", "08:03"],
    [15.4, "in", "Merci ! Dis-moi si tu as besoin de matériel en plus.", "08:04", 15.0],
    [24.55, "file", ["Protocole-désinfection.pdf", "PDF · 240 Ko", "pdf"], "09:12"],
    [24.95, "file", ["Photo-couloir-avant.jpg", "JPG · 1,2 Mo", "img"], "09:12"],
    [25.35, "file", ["Planning-semaine-40.xlsx", "XLSX · 88 Ko", "xls"], "09:13"],
  ];
  const typingNodes = [];
  const nodes = MSGS.map(([t, side, text, time, typingAt]) => {
    let node;
    if (side === "file") {
      const [name, meta, kind] = text;
      node = el(`<div class="bubble out file-msg">${UI.fileChip({ name, meta, kind })}<span class="bubble-time">${time}${icon("check-check", { size: 15, stroke: 2.2 })}</span></div>`);
    } else node = el(UI.bubble(text, side, time));
    msgs.appendChild(node);
    let typingNode = null;
    if (typingAt) {
      typingNode = el(UI.typing("in"));
      typingNode.classList.add("floating");
      typingNodes.push(typingNode);
    }
    return { t, side, node, typingAt, typingNode };
  });
  // Placement : les bulles sont toutes dans la mise en page ; on décale le fil
  // vers le bas de la hauteur des bulles pas encore arrivées, puis on remonte
  // à chaque nouvelle bulle (comme une vraie messagerie).
  typingNodes.forEach((tn) => msgs.appendChild(tn));
  const GAP = 10;
  const tail = (from) => nodes.slice(from).reduce((h, n) => h + n.node.offsetHeight + GAP, 0);
  gsap.set(msgs, { y: tail(0) });
  nodes.forEach((n, i) => {
    const origin = n.side === "in" ? "0% 100%" : "100% 100%";
    if (n.typingNode) {
      // L'indicateur "en train d'écrire" apparaît là où la réponse va arriver.
      const tn = n.typingNode;
      tn.style.top = `${n.node.offsetTop}px`;
      tl.set(tn, { autoAlpha: 1, scale: 0.6, transformOrigin: "0% 100%" }, n.typingAt);
      tl.to(tn, { scale: 1, duration: 0.3, ease: "back.out(2)" }, n.typingAt);
      tl.to(msgs, { y: tail(i) - tn.offsetHeight - GAP, duration: 0.35, ease: "expo.out" }, n.typingAt);
      tn.querySelectorAll("i").forEach((dot, k) => {
        tl.to(dot, { y: -5, duration: 0.18, repeat: 3, yoyo: true, ease: "sine.inOut" }, n.typingAt + 0.05 + k * 0.08);
      });
      tl.set(tn, { autoAlpha: 0 }, n.t);
    }
    tl.set(n.node, { autoAlpha: 1, transformOrigin: origin }, n.t);
    tl.fromTo(n.node, { scale: 0.55, y: 18 }, { scale: 1, y: 0, duration: 0.45, ease: "back.out(1.7)", immediateRender: false }, n.t);
    tl.to(msgs, { y: tail(i + 1), duration: 0.45, ease: "expo.out" }, n.t);
    cue(n.side === "in" ? "receive" : "send", n.t);
  });
  // Pendant la saisie, le bouton d'envoi s'allume.
  const send = chat.querySelector(".send");
  [12.35, 14.1].forEach((t) => {
    tl.to(send, { backgroundColor: "#0e7490", color: "#fff", duration: 0.15 }, t);
    tl.to(send, { backgroundColor: "#e4e9f0", color: "#94a0af", duration: 0.2 }, t + 0.45);
  });
  // Les pièces jointes : barre de progression puis coche verte.
  nodes
    .filter((n) => n.side === "file")
    .forEach((n) => {
      tl.to(n.node.querySelector(".file-bar i"), { scaleX: 1, duration: 0.45, ease: "power2.inOut" }, n.t + 0.1);
      tl.to(n.node.querySelector(".file-ok"), { scale: 1, duration: 0.35, ease: "back.out(3)" }, n.t + 0.55);
      cue("check", n.t + 0.55, { gain: 0.6 });
    });

  tl.set(chat, { autoAlpha: 1 }, 11.95);
  tl.set(screens.querySelector(".scr-home"), { autoAlpha: 0 }, 11.95);
  tl.to(screens.querySelector(".scr-splash"), { autoAlpha: 0, scale: 1.08, duration: 0.35, ease: "power2.out" }, 12.05);

  // ---- Écran 2 : liste des discussions (individuelles + groupes)
  const ROWS = [
    [UI.avatarStack(["karim", "ines"], 34), "Équipe Karim B.", "ÉQUIPE", "teal", "Inès : Je suis sur place 👍", "09:12", 3],
    [`<span class="row-ic ic-teal">${icon("building-2", { size: 22 })}</span>`, "Clinique Saint-Michel", "CHANTIER", "blue", "Karim : Photo du couloir ajoutée", "09:05", 1],
    [UI.avatar("sophie", 48), "Sophie Martin", "", "", "Merci pour la consigne !", "08:58", 0],
    [`<span class="row-ic ic-orange">${icon("briefcase", { size: 22 })}</span>`, "Nettoyage parties communes", "MISSION", "orange", "Consigne mise à jour par la RH", "08:47", 2],
    [UI.avatar("MB:violet", 48), "Marc Bellamy", "", "", "Merci ! Dis-moi si tu as besoin…", "08:30", 0],
    [UI.avatar("nathan", 48), "Nathan Girard", "", "", "OK pour demain 7h", "Hier", 0],
    [UI.avatarStack(["lucas", "emma"], 34), "Équipe Sophie M.", "ÉQUIPE", "teal", "Lucas : Terminé ✅", "Hier", 0],
  ];
  const list = el(`
    <div class="scr scr-list screen">
      ${UI.statusBar()}
      <div class="list-head"><b>Messagerie</b><span class="compose">${icon("file-pen-line", { size: 20 })}</span></div>
      <div class="list-search">Rechercher</div>
      <div class="list-chips"><span class="on">Tous</span><span>Équipes</span><span>Chantiers</span><span>Missions</span></div>
      <div class="list-rows">${ROWS.map(
        ([av, name, tag, tint, last, time, unread]) => `
        <div class="row"><span class="row-av">${av}</span>
          <div class="row-main"><div class="row-top"><b>${name}</b><span>${time}</span></div>
          <div class="row-bot">${tag ? `<i class="tag tag-${tint}">${tag}</i>` : ""}<em>${last}</em>${unread ? `<u>${unread}</u>` : ""}</div></div>
        </div>`
      ).join("")}</div>
      ${UI.tabBar("Messagerie", 6)}
    </div>`);
  screens.appendChild(list);
  tl.set(list, { autoAlpha: 1 }, 16.0);
  tl.fromTo(list, { xPercent: 100 }, { xPercent: 0, duration: 0.6, ease: "expo.inOut", immediateRender: false }, 16.0);
  tl.to(chat, { xPercent: -28, filter: "brightness(0.85)", duration: 0.6, ease: "expo.inOut" }, 16.0);
  const listRows = [...list.querySelectorAll(".row")];
  tl.fromTo(listRows, { x: 60, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.6, stagger: 0.05, ease: "expo.out", immediateRender: false }, 16.25);
  tl.fromTo(list.querySelectorAll(".list-chips span"), { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.04, ease: "power3.out", immediateRender: false }, 16.2);
  cue("swipe", 16.0);
  // Les filtres Équipes / Chantiers / Missions s'allument sur les temps (F2).
  const chips = [...list.querySelectorAll(".list-chips span")];
  const ON = { backgroundColor: "#101322", color: "#ffffff", duration: 0.15, ease: "power2.out" };
  const OFF = { backgroundColor: "#eef1f6", color: "#5b6472", duration: 0.15, ease: "power2.out" };
  [1, 2, 3].forEach((k, i) => {
    const t = 18.1 + i * 0.5;
    tl.to(chips[k], ON, t);
    tl.to(chips[k - 1], OFF, t);
    cue("tick", t, { gain: 0.5 });
  });
  tl.to(chips[3], OFF, 19.7);
  tl.to(chips[0], ON, 19.7);

  // ---- Satellites F2 : équipe / chantier / mission sortent du téléphone
  const SATS = [
    ["users", "teal", "ÉQUIPE", "Équipe Karim B.", "Inès : Je suis sur place 👍", ["karim", "ines", "lucas"], 3, 330],
    ["building-2", "blue", "CHANTIER", "Clinique Saint-Michel", "Karim : Photo du couloir ajoutée", ["karim", "nathan"], 1, 540],
    ["briefcase", "orange", "MISSION", "Nettoyage parties communes", "Consigne mise à jour par la RH", ["emma", "sophie", "jean"], 2, 750],
  ];
  SATS.forEach(([ic, tint, tag, name, last, people, unread, y], i) => {
    const card = el(`
      <div class="sat sat-${tint}">
        <span class="sat-ic">${icon(ic, { size: 24 })}</span>
        <div class="sat-main"><i>${tag}</i><b>${name}</b><em>${last}</em></div>
        <div class="sat-side">${UI.avatarStack(people, 28)}<u>${unread}</u></div>
      </div>`);
    card.style.left = `${930 + (i === 1 ? -40 : 0)}px`;
    card.style.top = `${y - 52}px`;
    front.appendChild(card);
    const t = 18.1 + i * 0.5;
    tl.set(card, { autoAlpha: 1 }, t);
    tl.fromTo(card, { x: 300, scale: 0.5, rotation: -8 }, { x: 0, scale: 1, rotation: i === 1 ? 1.5 : -1.5, duration: 0.6, ease: "back.out(1.6)", immediateRender: false }, t);
    tl.to(card, { x: 260, scale: 0.4, autoAlpha: 0, duration: 0.4, ease: "power3.in" }, 19.75 + i * 0.04);
    cue("pop", t, { gain: 0.7 });
  });

  // ---- Écran 3 : mission (vraie capture) + consigne qui vient s'accrocher
  const mission = el(`<div class="scr scr-mission">${UI.shotScreen("missions.png")}</div>`);
  screens.appendChild(mission);
  tl.set(mission, { autoAlpha: 1 }, 20.0);
  tl.fromTo(mission, { xPercent: 100 }, { xPercent: 0, duration: 0.6, ease: "expo.inOut", immediateRender: false }, 20.0);
  tl.to(list, { xPercent: -28, filter: "brightness(0.85)", duration: 0.6, ease: "expo.inOut" }, 20.0);
  cue("swipe", 20.0);

  const mcard = el(`<div class="s3-mcard">${UI.missionCard({
    title: "Nettoyage parties communes",
    place: "Résidence Les Tilleuls",
    hours: "08:00 – 11:00",
    people: ["karim", "ines", "emma"],
    count: 3,
    status: ["EN COURS", "orange"],
    live: true,
  })}</div>`);
  front.appendChild(mcard);
  const consigne = el(`
    <div class="consigne">
      <span class="consigne-ic">${icon("clipboard-list", { size: 22 })}</span>
      <div><i>NOUVELLE CONSIGNE · RH</i><b>Véranda : produits sans parfum uniquement.</b><em>Vitres côté jardin en priorité.</em></div>
      <span class="consigne-link">${icon("paperclip", { size: 16, stroke: 2.4 })}</span>
    </div>`);
  front.appendChild(consigne);
  tl.set(mcard, { autoAlpha: 1 }, 20.2);
  tl.fromTo(mcard, { x: 280, scale: 0.6, rotation: -6 }, { x: 0, scale: 1.12, rotation: -2, duration: 0.6, ease: "back.out(1.5)", immediateRender: false }, 20.2);
  cue("pop", 20.2);
  tl.set(consigne, { autoAlpha: 1 }, 20.65);
  tl.fromTo(consigne, { x: -520, y: 60, rotation: -14, scale: 0.9 }, { x: 0, y: 0, rotation: 0, scale: 1.12, duration: 0.5, ease: "back.out(1.4)", immediateRender: false }, 20.65);
  tl.fromTo(consigne.querySelector(".consigne-link"), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(3)", immediateRender: false }, 21.1);
  tl.to(mcard, { y: -8, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 }, 21.12);
  cue("whoosh", 20.62, { gain: 0.45 });
  cue("snap", 21.12);
  tl.to([mcard, consigne], { x: 260, scale: 0.45, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: "power3.in" }, 21.72);

  // ---- Écran 4 : écran verrouillé, les notifications tombent
  const lock = el(`
    <div class="scr scr-lock">
      <div class="home-wall"></div>
      ${UI.statusBar(true).replace("sbar-dark", "sbar-dark sbar-clear")}
      <div class="home-clock"><b>9:41</b><span>Mercredi 30 septembre</span></div>
      <div class="lock-stack"></div>
    </div>`);
  screens.appendChild(lock);
  tl.set(lock, { autoAlpha: 1 }, 22.0);
  tl.fromTo(lock, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out", immediateRender: false }, 22.0);
  tl.set([list, mission], { autoAlpha: 0 }, 22.4);
  const stack = lock.querySelector(".lock-stack");
  const NOTIFS = [
    ["briefcase", "Nouvelle mission", "Une nouvelle mission vous a été attribuée."],
    ["clock", "Horaire modifié", "L'horaire de votre mission a été modifié."],
    ["clipboard-list", "Nouvelle consigne", "Une nouvelle consigne a été ajoutée à votre mission."],
  ];
  const toasts = NOTIFS.map(([ic, title, body], i) => {
    const n = el(UI.toast({ title, body, ic, time: "maintenant" }));
    stack.appendChild(n);
    return n;
  });
  const SLOT = toasts[0].offsetHeight + 10;
  toasts.forEach((n, i) => {
    const t = 22.3 + i * 0.5;
    tl.set(n, { autoAlpha: 1 }, t);
    tl.fromTo(n, { y: -70, scale: 0.9 }, { y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)", immediateRender: false }, t);
    // Les plus anciennes descendent d'un cran, comme sur un vrai écran verrouillé.
    for (let j = 0; j < i; j++) tl.to(toasts[j], { y: (i - j) * SLOT, duration: 0.45, ease: "expo.out" }, t);
    cue("notif", t, { gain: 0.8 });
  });
  // Petite vibration du téléphone à chaque notification.
  [22.3, 22.8, 23.3].forEach((t) => {
    tl.to(phoneEl, { rotationZ: 2.6, duration: 0.05, ease: "none", yoyo: true, repeat: 3 }, t);
  });

  // Satellite F4 : la cloche et son compteur.
  const bell = el(`<div class="s3-bell"><span class="bell-core">${icon("bell-ring", { size: 54, stroke: 1.8 })}</span><b class="bell-badge">0</b><i class="bell-ring"></i><i class="bell-ring"></i></div>`);
  front.appendChild(bell);
  tl.set(bell, { autoAlpha: 1 }, 22.1);
  tl.fromTo(bell, { scale: 0.3, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2)", immediateRender: false }, 22.1);
  const badge = bell.querySelector(".bell-badge");
  tl.set(badge, { autoAlpha: 1 }, 22.3);
  onFrame((t) => {
    badge.textContent = String([22.3, 22.8, 23.3].filter((x) => t >= x).length);
  });
  [22.3, 22.8, 23.3].forEach((t, i) => {
    tl.fromTo(badge, { scale: 1.6 }, { scale: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, t);
    tl.fromTo(bell.querySelector(".bell-core"), { rotation: -16 }, { rotation: 0, duration: 0.45, ease: "elastic.out(1.2, 0.3)", immediateRender: false }, t);
  });
  bell.querySelectorAll(".bell-ring").forEach((r, i) => {
    [22.3, 22.8, 23.3].forEach((t) => {
      tl.set(r, { autoAlpha: 0.6, scale: 1 }, t + i * 0.08);
      tl.to(r, { autoAlpha: 0, scale: 1.9, duration: 0.6, ease: "power2.out" }, t + i * 0.08);
    });
  });
  tl.to(bell, { scale: 0.4, x: 200, autoAlpha: 0, duration: 0.4, ease: "power3.in" }, 23.75);

  // ---- Écran 5 : on déverrouille, retour à la conversation, les documents arrivent
  tl.set(chat, { xPercent: 0, filter: "brightness(1)" }, 23.95);
  tl.to(lock, { yPercent: -100, duration: 0.5, ease: "expo.inOut" }, 24.0);
  cue("swipe", 24.0);
  const FILES = [
    ["Protocole-désinfection.pdf", "PDF · 240 Ko", "pdf"],
    ["Photo-couloir-avant.jpg", "JPG · 1,2 Mo", "img"],
    ["Planning-semaine-40.xlsx", "XLSX · 88 Ko", "xls"],
  ];
  // Les fichiers jaillissent de l'icône trombone et filent en arc jusque
  // dans la conversation, où ils deviennent des pièces jointes.
  FILES.forEach(([name, meta, kind], i) => {
    const chip = el(`<div class="s3-fly">${UI.fileChip({ name, meta, kind })}</div>`);
    front.appendChild(chip);
    const t = 24.15 + i * 0.4;
    tl.set(chip, { autoAlpha: 1, x: -843, y: 369, scale: 0.2, rotation: -10 }, t);
    tl.to(chip, { x: 330, duration: 0.45, ease: "power1.in" }, t);
    tl.to(chip, { y: -40 - i * 25, duration: 0.2, ease: "power2.out" }, t);
    tl.to(chip, { y: 255, duration: 0.25, ease: "power2.in" }, t + 0.2);
    tl.to(chip, { scale: 1, rotation: 3, duration: 0.2, ease: "power2.out" }, t);
    tl.to(chip, { scale: 0.5, rotation: 0, duration: 0.25, ease: "power2.in" }, t + 0.2);
    tl.set(chip, { autoAlpha: 0 }, t + 0.42);
    cue("whoosh", t, { gain: 0.35, short: true });
  });
});
