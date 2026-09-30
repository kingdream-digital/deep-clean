/* ==========================================================================
   Deep Clean — interactions & animations
   GSAP 3 + ScrollTrigger + SplitText (licence GreenSock « no charge ») et
   Lenis (MIT), auto-hébergés dans assets/vendor/.

   Principes de robustesse (voir historique : pas de bug de pin/scrub) :
   - chaque module est isolé (safe()) : une erreur n'en bloque pas d'autre ;
   - le contenu reste lisible sans JS (html.no-js) et si main.js échoue
     (filet de sécurité de 6 s dans <head>) ;
   - prefers-reduced-motion : pas de préchargement, pas de lissage, pas de
     pin ni de scrub — uniquement l'état final ;
   - Lenis pilote ScrollTrigger via le ticker GSAP (recette officielle).
   ========================================================================== */

(function () {
  "use strict";

  var doc = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var mq = function (q) { return window.matchMedia(q).matches; };

  var REDUCED = mq("(prefers-reduced-motion: reduce)");
  var FINE = mq("(hover: hover) and (pointer: fine)");
  var TOUCH = mq("(hover: none)");

  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var hasSplit = !!window.SplitText;
  var lenis = null;
  var errors = 0;

  function safe(name, fn) {
    try { fn(); } catch (err) { errors++; if (window.console) console.error("[Deep Clean] " + name, err); }
  }

  function headerOffset() {
    var h = $("[data-header]");
    return h ? h.offsetHeight : 76;
  }

  /* Année du pied de page (toujours) */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ------------------------------------------------------------------ */
  /* Modules fonctionnels (marchent même sans GSAP)                       */
  /* ------------------------------------------------------------------ */

  safe("menu", initMenu);
  safe("faq", initFaq);
  safe("quote", initQuote);

  if (!hasGsap) {
    doc.classList.remove("js");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  if (hasSplit) gsap.registerPlugin(SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });
  doc.classList.add("is-ready");

  safe("lenis", initLenis);
  safe("anchors", initAnchors);
  safe("header", initHeader);
  safe("cursor", initCursor);
  safe("magnetic", initMagnetic);

  if (REDUCED) {
    safe("static", showEverything);
  } else {
    safe("splits", initSplits);
    safe("reveals", initReveals);
    safe("ticker", initTicker);
    safe("manifest", initManifest);
    safe("dust", initDust);
    safe("panels-in", animatePanels);
    safe("concierge", initConcierge);
    safe("stack", initStack);
    safe("bento", initBento);
    safe("about", initAbout);
    safe("map", initMapIntro);
    safe("band", initBand);
    safe("reviews", initReviews);
    safe("footer", initFooter);
    safe("hero-scroll", initHeroScroll);
  }
  safe("panels", initPanels);
  safe("services", initServices);
  safe("wipe", initWipe);
  safe("map-links", initMapLinks);
  safe("counters", initCounters);
  safe("dock", initDockAndProgress);

  if (errors) doc.classList.remove("js");

  /* Intro : préchargement -> raclette sur le hero -> titre */
  var intro = REDUCED ? Promise.resolve() : runLoader();
  intro.then(function () {
    if (REDUCED) showHeroNow(); else playHeroFog();
    var hash = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (hash && hash.id !== "accueil") setTimeout(function () { ScrollTrigger.refresh(); scrollToEl(hash); }, 60);
  });

  /* Recalcul des déclencheurs quand polices et images sont prêtes */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });

  /* ================================================================== */
  /* Défilement doux & ancres                                             */
  /* ================================================================== */

  function initLenis() {
    if (REDUCED || !window.Lenis) return;
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, syncTouch: false });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToEl(el) {
    if (!el) return;
    var top = el.id === "accueil" ? 0 : el;
    if (lenis) {
      lenis.scrollTo(top, { offset: el.id === "accueil" ? 0 : -headerOffset() + 1, duration: 1.4, easing: function (t) { return 1 - Math.pow(1 - t, 4); } });
    } else {
      var y = el.id === "accueil" ? 0 : el.getBoundingClientRect().top + window.pageYOffset - headerOffset() + 1;
      window.scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
    }
  }

  function initAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var target = document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      scrollToEl(target);
      if (history.replaceState) history.replaceState(null, "", id);
      // Accessibilité : on déplace le focus sans re-défiler
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (err) { /* vieux navigateurs */ } }, 50);
    });
  }

  /* ================================================================== */
  /* Préchargement                                                        */
  /* ================================================================== */

  function whenImageReady(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(function (res) {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    });
  }

  function storage(key, value) {
    try {
      if (value === undefined) return window.sessionStorage.getItem(key);
      window.sessionStorage.setItem(key, value);
    } catch (err) { return null; }
    return null;
  }

  function runLoader() {
    return new Promise(function (resolve) {
      var loader = $("[data-loader]");
      if (!loader) { resolve(); return; }
      var wave = $(".loader__wave", loader);
      var count = $("[data-loader-count]", loader);
      var edge = $("[data-loader-edge]", loader);
      var seen = storage("dc-intro") === "1";
      var state = { p: 0 };
      var render = function () {
        count.textContent = Math.round(state.p);
        gsap.set(wave, { yPercent: -state.p * 0.48 });
      };
      if (lenis) lenis.stop();

      var fill = gsap.to(state, { p: 86, duration: seen ? 0.5 : 1.25, ease: "power2.inOut", onUpdate: render });
      var ready = Promise.all([
        whenImageReady($("[data-hero-img]")),
        document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : null
      ]);
      var timeout = new Promise(function (r) { setTimeout(r, 4500); });

      Promise.race([ready, timeout]).then(function () {
        fill.then(function () {
          gsap.to(state, { p: 100, duration: 0.3, ease: "power2.out", onUpdate: render, onComplete: exit });
        });
      });

      function exit() {
        storage("dc-intro", "1");
        var tl = gsap.timeline({
          onComplete: function () {
            loader.remove();
            if (lenis) lenis.start();
          }
        });
        tl.to($(".loader__inner", loader), { y: -30, autoAlpha: 0, duration: 0.45, ease: "power2.in" })
          .to(loader, { yPercent: -100, duration: 1.05, ease: "power3.inOut" }, "-=0.05")
          .to(edge, { attr: { d: "M0 0 H100 V0 Q50 20 0 0 Z" }, duration: 0.5, ease: "power2.in" }, "<")
          .to(edge, { attr: { d: "M0 0 H100 V0 Q50 0 0 0 Z" }, duration: 0.55, ease: "power2.out" }, ">-0.02")
          .call(resolve, null, 0.62);
      }
    });
  }

  /* ================================================================== */
  /* Verre sale (partagé par le hero et la section « vitre »)             */
  /* ================================================================== */

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var CANVAS_FILTER = (function () {
    try {
      var c = document.createElement("canvas").getContext("2d");
      if (!c || !("filter" in c)) return false;
      c.filter = "blur(2px)";
      return c.filter === "blur(2px)";
    } catch (err) { return false; }
  })();

  /* Dessine l'image en « cover » (comme object-fit), floutée et ternie. */
  function drawBlurredCover(ctx, img, W, H, o) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) { ctx.fillStyle = "#6c6861"; ctx.fillRect(0, 0, W, H); return; }
    var s = Math.max(W / iw, H / ih);
    var sw = W / s, sh = H / s;
    var sx = (iw - sw) * o.posX, sy = (ih - sh) * o.posY;
    if (CANVAS_FILTER) {
      var pad = o.blur * 2;
      ctx.filter = "blur(" + o.blur + "px) saturate(" + o.sat + ") brightness(" + o.bright + ")";
      ctx.drawImage(img, sx, sy, sw, sh, -pad, -pad, W + pad * 2, H + pad * 2);
      ctx.filter = "none";
    } else {
      // Repli (anciens Safari) : sous-échantillonnage en deux temps = flou naturel
      var a = document.createElement("canvas");
      a.width = Math.max(8, Math.round(W / 6)); a.height = Math.max(8, Math.round(H / 6));
      a.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, a.width, a.height);
      var b = document.createElement("canvas");
      b.width = Math.max(4, Math.round(W / 18)); b.height = Math.max(4, Math.round(H / 18));
      b.getContext("2d").drawImage(a, 0, 0, b.width, b.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(b, 0, 0, W, H);
      ctx.fillStyle = "rgba(128,124,118,0.18)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function paintGrime(ctx, W, H, rnd, amount) {
    var A = (W * H) / (1440 * 900);
    var k = Math.sqrt(A);
    var i, x, y, r, g;
    // taches douces (traces de doigts, voile)
    for (i = 0; i < Math.round(24 * A * amount) + 8; i++) {
      x = rnd() * W; y = rnd() * H; r = (40 + rnd() * 190) * k;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      if (rnd() > 0.35) g.addColorStop(0, "rgba(255,255,255," + (0.07 + rnd() * 0.1).toFixed(3) + ")");
      else g.addColorStop(0, "rgba(70,58,44," + (0.06 + rnd() * 0.08).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // anciens coups de chiffon (arcs)
    ctx.lineCap = "round";
    for (i = 0; i < Math.round(8 * A * amount) + 3; i++) {
      var cx = rnd() * W, cy = rnd() * H, rr = (110 + rnd() * 260) * k, a0 = rnd() * Math.PI * 2;
      ctx.strokeStyle = "rgba(255,255,255," + (0.04 + rnd() * 0.06).toFixed(3) + ")";
      ctx.lineWidth = (12 + rnd() * 34) * k;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + 0.5 + rnd() * 1.4); ctx.stroke();
    }
    // poussières
    for (i = 0; i < Math.round(1500 * A * amount); i++) {
      x = rnd() * W; y = rnd() * H; r = 0.35 + rnd() * rnd() * 2.1;
      ctx.fillStyle = rnd() > 0.45 ? "rgba(255,255,255," + (0.22 + rnd() * 0.4).toFixed(3) + ")" : "rgba(38,32,26," + (0.16 + rnd() * 0.3).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // traces de gouttes (auréoles calcaires)
    for (i = 0; i < Math.round(120 * A * amount); i++) {
      x = rnd() * W; y = rnd() * H; r = 1.5 + rnd() * rnd() * 13 * k;
      ctx.fillStyle = "rgba(255,255,255," + (0.03 + rnd() * 0.05).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255," + (0.14 + rnd() * 0.22).toFixed(3) + ")";
      ctx.lineWidth = 0.7 + rnd();
      ctx.stroke();
    }
    // coulures verticales
    for (i = 0; i < Math.round(40 * A * amount); i++) {
      x = rnd() * W; y = rnd() * H * 0.85;
      var len = (30 + rnd() * 210) * k;
      g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.3, "rgba(255,255,255," + (0.08 + rnd() * 0.1).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, y + len * 0.3, x + (rnd() - 0.5) * 8, y + len * 0.7, x + (rnd() - 0.5) * 10, y + len);
      ctx.stroke();
    }
  }

  function paintDirtyGlass(ctx, img, W, H, o) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    drawBlurredCover(ctx, img, W, H, o);
    ctx.fillStyle = o.haze;
    ctx.fillRect(0, 0, W, H);
    paintGrime(ctx, W, H, mulberry32(o.seed), o.amount);
    ctx.restore();
  }

  function sizeCanvas(canvas, box) {
    var r = box.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: W, H: H, dpr: dpr };
  }

  /* ================================================================== */
  /* Hero : raclette + apparition du titre                                */
  /* ================================================================== */

  function heroTimeline() {
    var tl = gsap.timeline();
    tl.fromTo(".hero__line > span", { yPercent: 112, y: 0 }, { yPercent: 0, duration: 1.25, ease: "power4.out", stagger: 0.1 })
      .fromTo("[data-hero-in]", { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.09 }, 0.25);
    return tl;
  }

  function showHeroNow() {
    gsap.set(".hero__line > span", { yPercent: 0, y: 0 });
    gsap.set("[data-hero-in]", { autoAlpha: 1, y: 0 });
    var fog = $("[data-hero-fog]");
    if (fog) fog.style.display = "none";
  }

  function playHeroFog() {
    var media = $("[data-hero-media]");
    var canvas = $("[data-hero-fog]");
    var img = $("[data-hero-img]");
    var blade = $("[data-hero-squeegee]");
    if (!media || !canvas || !img) {
      if (canvas) canvas.style.display = "none";
      heroTimeline();
      return;
    }

    var s = sizeCanvas(canvas, media);
    var ctx = s.ctx, W = s.W, H = s.H;
    paintDirtyGlass(ctx, img, W, H, { blur: 18, sat: 0.55, bright: 1.12, haze: "rgba(214,208,198,0.26)", amount: 0.7, seed: 11, posX: 0.5, posY: 0.55 });

    var passes = W < 700 ? 4 : 3;
    var bandH = H / passes;
    var over = bandH * 0.14;
    var bladeH = bandH + over * 1.6;
    var arc = function (x) { return Math.sin(Math.PI * Math.min(Math.max(x / W, 0), 1)) * bandH * 0.08; };
    gsap.set(blade, { height: bladeH, autoAlpha: 0 });

    var tl = gsap.timeline({
      onComplete: function () { canvas.style.display = "none"; blade.style.display = "none"; }
    });

    for (var i = 0; i < passes; i++) {
      (function (i) {
        var ltr = i % 2 === 0;
        var yTop = i * bandH - over;
        var from = ltr ? -40 : W + 40, to = ltr ? W + 40 : -40;
        var st = { x: from }, last = from;
        tl.to(st, {
          x: to,
          duration: W < 700 ? 0.42 : 0.52,
          ease: "power1.inOut",
          onStart: function () {
            blade.classList.toggle("is-rtl", !ltr);
            gsap.set(blade, { autoAlpha: 1 });
          },
          onUpdate: function () {
            var x = st.x;
            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "#000";
            ctx.beginPath();
            var x0 = last - (ltr ? 2 : -2);
            ctx.moveTo(x0, yTop + arc(x0));
            ctx.lineTo(x, yTop + arc(x));
            ctx.lineTo(x, yTop + bandH + over * 2 + arc(x));
            ctx.lineTo(x0, yTop + bandH + over * 2 + arc(x0));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            last = x;
            var slope = (arc(x + 1) - arc(x - 1)) / 2;
            gsap.set(blade, { x: x - 8, y: yTop + arc(x) - over * 0.3, rotation: Math.atan(slope) * 57.3 + (ltr ? -3 : 3) });
          }
        }, i === 0 ? 0.1 : ">-0.02");
      })(i);
    }
    tl.to(blade, { autoAlpha: 0, duration: 0.2 }, ">-0.1")
      .to(canvas, { autoAlpha: 0, duration: 0.6, ease: "power1.out" }, "<");
    tl.add(heroTimeline(), W < 700 ? 0.7 : 0.55);

    // Si la fenêtre change de taille pendant l'intro, on termine proprement.
    var onResize = function () { tl.progress(1); window.removeEventListener("resize", onResize); };
    window.addEventListener("resize", onResize);
  }

  function initHeroScroll() {
    var hero = $("[data-hero]");
    if (!hero) return;
    gsap.to("[data-hero-media]", {
      yPercent: 16, scale: 1.06, ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
    });
    gsap.to(".hero__content, .hero__card", {
      yPercent: -10, autoAlpha: 0.25, ease: "none",
      scrollTrigger: { trigger: hero, start: "35% top", end: "bottom top", scrub: true }
    });
  }

  /* ================================================================== */
  /* En-tête, menu, curseur, boutons magnétiques                          */
  /* ================================================================== */

  var menuOpen = false;

  function initHeader() {
    var header = $("[data-header]");
    if (!header) return;
    var lastY = 0;
    var onScroll = function (y) {
      header.classList.toggle("is-scrolled", y > 30);
      if (!menuOpen) {
        if (y > 480 && y > lastY + 3) header.classList.add("is-hidden");
        else if (y < lastY - 3 || y < 480) header.classList.remove("is-hidden");
      }
      lastY = y;
    };
    if (lenis) lenis.on("scroll", function (l) { onScroll(l.scroll); });
    else window.addEventListener("scroll", function () { onScroll(window.pageYOffset); }, { passive: true });
    onScroll(window.pageYOffset);

    // Lien de navigation courant
    $$(".nav a").forEach(function (a) {
      var section = document.getElementById(a.getAttribute("href").slice(1));
      if (!section) return;
      ScrollTrigger.create({
        trigger: section, start: "top 45%", end: "bottom 45%",
        onToggle: function (self) { a.classList.toggle("is-current", self.isActive); }
      });
    });
  }

  function initMenu() {
    var burger = $("[data-burger]"), menu = $("[data-menu]");
    if (!burger || !menu) return;
    var set = function (open) {
      menuOpen = open;
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      if (open) menu.removeAttribute("inert"); else menu.setAttribute("inert", "");
      var header = $("[data-header]");
      if (header) header.classList.remove("is-hidden");
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      else document.body.style.overflow = open ? "hidden" : "";
      if (open && window.gsap && !REDUCED) {
        gsap.fromTo($$(".menu__links a", menu), { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: "power4.out", stagger: 0.06, delay: 0.15 });
        gsap.fromTo($(".menu__foot", menu), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, delay: 0.5 });
      }
    };
    burger.addEventListener("click", function () { set(!menuOpen); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen) { set(false); burger.focus(); }
    });
    window.addEventListener("resize", function () { if (menuOpen && window.innerWidth > 1024) set(false); });
  }

  var cursorApi = null;

  function initCursor() {
    if (!FINE || REDUCED) return;
    var cursor = $("[data-cursor]");
    if (!cursor) return;
    var ring = $("[data-cursor-ring]", cursor), dot = $("[data-cursor-dot]", cursor);
    var xd = gsap.quickSetter(dot, "x", "px"), yd = gsap.quickSetter(dot, "y", "px");
    var xr = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
    var yr = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
    cursor.classList.add("is-hidden");
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      xd(e.clientX); yd(e.clientY); xr(e.clientX); yr(e.clientY);
      cursor.classList.remove("is-hidden");
    }, { passive: true });
    doc.addEventListener("mouseleave", function () { cursor.classList.add("is-hidden"); });
    var wipeLocked = false;
    document.addEventListener("mouseover", function (e) {
      var t = e.target;
      if (!t.closest) return;
      var wipe = t.closest("[data-cursor-mode='wipe']");
      cursor.classList.toggle("is-wipe", !!wipe && !wipeLocked);
      var interactive = t.closest("a, button, summary, label, select, input, textarea, [data-panel]:not(.is-open), .map__town");
      cursor.classList.toggle("is-hover", !!interactive && !wipe);
    });
    cursorApi = { wipeDone: function () { wipeLocked = true; cursor.classList.remove("is-wipe"); } };
  }

  function initMagnetic() {
    if (!FINE || REDUCED) return;
    $$("[data-magnetic]").forEach(function (el) {
      var xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3" });
      var yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3" });
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener("pointerleave", function () { xTo(0); yTo(0); });
    });
  }

  /* ================================================================== */
  /* Apparitions génériques                                               */
  /* ================================================================== */

  function showEverything() {
    gsap.set("[data-reveal], [data-hero-in], [data-tile], [data-float], .panel, .svc, .review", { autoAlpha: 1, x: 0, y: 0, scale: 1 });
    gsap.set("[data-split], [data-split-quote]", { visibility: "visible" });
    gsap.set(".hero__line > span", { yPercent: 0 });
    gsap.set("[data-reveal-img]", { clipPath: "none" });
    $$(".stars-fill").forEach(function (s) { s.style.removeProperty("--fill"); });
    var rv = $("[data-reviews]");
    if (rv) { rv.style.width = "100%"; rv.style.overflowX = "auto"; rv.style.paddingInline = "var(--gutter)"; }
  }

  function initSplits() {
    $$("[data-split]").forEach(function (el) {
      if (!hasSplit) { gsap.set(el, { visibility: "visible" }); return; }
      var revealed = false;
      SplitText.create(el, {
        type: "lines",
        mask: "lines",
        linesClass: "split-line",
        autoSplit: true,
        onSplit: function (self) {
          gsap.set(el, { visibility: "visible" });
          if (revealed) return;
          return gsap.from(self.lines, {
            yPercent: 108,
            duration: 1.15,
            ease: "power4.out",
            stagger: 0.09,
            scrollTrigger: { trigger: el, start: "top 88%", once: true, onEnter: function () { revealed = true; } }
          });
        }
      });
    });
  }

  function initReveals() {
    ScrollTrigger.batch("[data-reveal]", {
      start: "top 90%",
      once: true,
      onEnter: function (els) {
        gsap.fromTo(els, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.08, overwrite: "auto" });
      }
    });
    $$("[data-reveal-img]").forEach(function (fig) {
      var img = $("img", fig);
      var r = getComputedStyle(fig).borderTopLeftRadius || "24px";
      gsap.timeline({ scrollTrigger: { trigger: fig, start: "top 82%", once: true } })
        .fromTo(fig, { clipPath: "inset(100% 0% 0% 0% round " + r + ")" }, { clipPath: "inset(0% 0% 0% 0% round " + r + ")", duration: 1.4, ease: "power4.inOut" })
        .fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.9, ease: "power3.out" }, 0);
    });
  }

  /* ================================================================== */
  /* Bandeau défilant (vitesse liée au scroll)                            */
  /* ================================================================== */

  function initTicker() {
    var row = $("[data-ticker]");
    if (!row) return;
    var track = $("[data-ticker-track]", row);
    for (var i = 0; i < 2; i++) row.appendChild(track.cloneNode(true));
    var tw = track.getBoundingClientRect().width;
    window.addEventListener("resize", function () { tw = track.getBoundingClientRect().width; });
    var x = 0, dir = -1, boost = 0, visible = false;
    ScrollTrigger.create({ trigger: row, start: "top bottom", end: "bottom top", onToggle: function (s) { visible = s.isActive; } });
    if (lenis) {
      lenis.on("scroll", function (l) {
        boost = Math.min(Math.abs(l.velocity) * 16, 1100);
        if (l.direction) dir = l.direction > 0 ? -1 : 1;
      });
    }
    gsap.ticker.add(function (time, dt) {
      if (!visible || !tw) return;
      x += (55 + boost) * dir * (dt / 1000);
      if (x <= -tw) x += tw;
      if (x > 0) x -= tw;
      row.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
      boost *= 0.94;
    });
  }

  /* ================================================================== */
  /* Manifeste : le texte « se nettoie » au fil du scroll                 */
  /* ================================================================== */

  function initManifest() {
    var el = $("[data-scrub-text]");
    if (!el) return;
    var words = hasSplit ? SplitText.create(el, { type: "words", wordsClass: "word" }).words : [el];
    gsap.fromTo(words, { opacity: 0.12 }, {
      opacity: 1, ease: "none", stagger: 0.1,
      scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 42%", scrub: 0.6 }
    });
  }

  function initDust() {
    var canvas = $("[data-dust]");
    if (!canvas) return;
    var section = canvas.parentElement;
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, parts = [], progress = 0, active = false;
    var rnd = mulberry32(3);
    var N = window.innerWidth < 700 ? 26 : 64;
    var size = function () {
      var s = sizeCanvas(canvas, section);
      ctx = s.ctx; W = s.W; H = s.H;
    };
    size();
    for (var i = 0; i < N; i++) {
      parts.push({ x: rnd() * W, y: rnd() * H, r: 0.6 + rnd() * 1.8, vx: (rnd() - 0.5) * 0.18, vy: -0.05 - rnd() * 0.16, a: 0.18 + rnd() * 0.35, ph: rnd() * 6.28 });
    }
    window.addEventListener("resize", size);
    ScrollTrigger.create({
      trigger: section, start: "top bottom", end: "bottom top",
      onToggle: function (s) { active = s.isActive; if (!active) ctx.clearRect(0, 0, W, H); },
      onUpdate: function (s) { progress = s.progress; }
    });
    gsap.ticker.add(function (t) {
      if (!active) return;
      ctx.clearRect(0, 0, W, H);
      var fade = Math.max(0, 1 - progress * 1.8);
      if (!fade) return;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx + Math.sin(t * 0.6 + p.ph) * 0.08;
        p.y += p.vy;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < -5) p.x = W + 5; else if (p.x > W + 5) p.x = -5;
        ctx.fillStyle = "rgba(122,106,84," + (p.a * fade).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    });
  }

  /* ================================================================== */
  /* Pour qui ? — panneaux                                                */
  /* ================================================================== */

  function animatePanels() {
    var wrap = $("[data-panels]");
    if (!wrap) return;
    gsap.fromTo($$("[data-panel]", wrap), { autoAlpha: 0, y: 60 }, {
      autoAlpha: 1, y: 0, duration: 1.2, ease: "power4.out", stagger: 0.12,
      scrollTrigger: { trigger: wrap, start: "top 85%", once: true }
    });
  }

  function initPanels() {
    var panels = $$("[data-panel]");
    if (!panels.length) return;
    var wide = function () { return mq("(min-width: 901px)"); };
    var open = function (p) { panels.forEach(function (x) { x.classList.toggle("is-open", x === p); }); };
    panels.forEach(function (p) {
      p.addEventListener("mouseenter", function () { if (wide()) open(p); });
      p.addEventListener("focusin", function () { if (wide()) open(p); });
      p.addEventListener("click", function () { if (wide()) open(p); });
    });
  }

  /* ================================================================== */
  /* Prestations : horizontal épinglé (desktop) / carrousel natif         */
  /* ================================================================== */

  function initServices() {
    var section = $("[data-services]");
    if (!section) return;
    var pin = $("[data-services-pin]", section);
    var viewport = $("[data-services-viewport]", section);
    var track = $("[data-services-track]", section);
    var idx = $("[data-services-index]", section);
    var bar = $("[data-services-bar]", section);
    var cards = $$(".svc", track);
    var count = $$("[data-svc]", track).length;
    var setProgress = function (p) {
      p = Math.min(Math.max(p, 0), 1);
      if (bar) bar.style.transform = "scaleX(" + Math.max(0.02, p) + ")";
      if (idx) idx.textContent = String(Math.min(count, Math.floor(p * count) + 1)).padStart(2, "0");
    };

    if (REDUCED) {
      viewport.style.overflowX = "auto";
      viewport.addEventListener("scroll", function () { setProgress(viewport.scrollLeft / Math.max(1, viewport.scrollWidth - viewport.clientWidth)); }, { passive: true });
      return;
    }

    var mm = gsap.matchMedia();
    mm.add("(min-width: 1025px)", function () {
      section.classList.add("is-pinned");
      var dist = function () { return Math.max(0, track.scrollWidth - viewport.clientWidth); };
      var tween = gsap.to(track, { x: function () { return -dist(); }, ease: "none" });
      ScrollTrigger.create({
        trigger: pin,
        start: "top top",
        end: function () { return "+=" + dist(); },
        pin: true,
        scrub: 0.8,
        animation: tween,
        invalidateOnRefresh: true,
        anticipatePin: 1,
        onUpdate: function (self) { setProgress(self.progress); }
      });
      $$(".svc__media img", track).forEach(function (img) {
        gsap.fromTo(img, { xPercent: -7 }, {
          xPercent: 7, ease: "none",
          scrollTrigger: { trigger: img.parentNode, containerAnimation: tween, start: "left right", end: "right left", scrub: true }
        });
      });
      gsap.fromTo(cards, { autoAlpha: 0, x: 90 }, {
        autoAlpha: 1, x: 0, duration: 1.2, ease: "power4.out", stagger: 0.07,
        scrollTrigger: { trigger: section, start: "top 65%", once: true }
      });
      return function () { section.classList.remove("is-pinned"); gsap.set(track, { clearProps: "transform" }); };
    });
    mm.add("(max-width: 1024px)", function () {
      gsap.fromTo(cards, { autoAlpha: 0, x: 60 }, {
        autoAlpha: 1, x: 0, duration: 1.1, ease: "power4.out", stagger: 0.07,
        scrollTrigger: { trigger: viewport, start: "top 85%", once: true }
      });
      var onScroll = function () { setProgress(viewport.scrollLeft / Math.max(1, viewport.scrollWidth - viewport.clientWidth)); };
      viewport.addEventListener("scroll", onScroll, { passive: true });
      return function () { viewport.removeEventListener("scroll", onScroll); };
    });
  }

  /* ================================================================== */
  /* « Passez le chiffon » — vitre à nettoyer                             */
  /* ================================================================== */

  function initWipe() {
    var section = $("[data-wipe]");
    if (!section) return;
    var stage = $("[data-wipe-stage]", section);
    var canvas = $("[data-wipe-canvas]", section);
    var img = $("[data-wipe-img]", section);
    var pctEl = $("[data-wipe-pct]", section);
    var allBtn = $("[data-wipe-all]", section);
    var done = $("[data-wipe-done]", section);
    var shine = $("[data-wipe-shine]", section);
    var status = $("[data-wipe-status]", section);
    var hint = $("[data-wipe-hint]", section);
    var meter = $(".wipe__meter", section);
    if (!canvas || !img) return;
    if (TOUCH && hint) hint.textContent = "Glissez le doigt sur la vitre pour la nettoyer";

    var ctx, W = 0, H = 0, built = false, finished = false, busy = false;
    var mask = document.createElement("canvas"), mctx = mask.getContext("2d", { willReadFrequently: true });
    var brush, R = 60, last = null, pct = 0, checkT = 0, hinted = false;

    function makeBrush(r) {
      var c = document.createElement("canvas");
      c.width = c.height = Math.ceil(r * 2);
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.9)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
      return c;
    }

    function build() {
      var s = sizeCanvas(canvas, stage);
      ctx = s.ctx; W = s.W; H = s.H;
      R = Math.min(90, Math.max(38, W * 0.055));
      brush = makeBrush(R);
      paintDirtyGlass(ctx, img, W, H, { blur: 11, sat: 0.45, bright: 0.98, haze: "rgba(190,183,168,0.44)", amount: 1.25, seed: 29, posX: 0.5, posY: 0.6 });
      mask.width = 80; mask.height = Math.max(20, Math.round(80 * H / W));
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, mask.width, mask.height);
      pct = 0;
      if (pctEl) pctEl.textContent = "0";
      canvas.style.opacity = "1";
      built = true;
    }

    function erase(x0, y0, x1, y1) {
      if (!built || finished) return;
      var dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
      var step = Math.max(2, R * 0.22), n = Math.max(1, Math.ceil(dist / step));
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      for (var i = 0; i <= n; i++) {
        var x = x0 + (dx * i) / n, y = y0 + (dy * i) / n;
        ctx.drawImage(brush, x - R, y - R, R * 2, R * 2);
      }
      ctx.restore();
      var k = mask.width / W;
      mctx.save();
      mctx.globalCompositeOperation = "destination-out";
      mctx.lineCap = "round";
      mctx.lineWidth = R * 1.5 * k;
      mctx.beginPath(); mctx.moveTo(x0 * k, y0 * k); mctx.lineTo(x1 * k + 0.01, y1 * k); mctx.stroke();
      mctx.restore();
      var now = performance.now();
      if (now - checkT > 160) { checkT = now; measure(); }
    }

    function measure() {
      var d = mctx.getImageData(0, 0, mask.width, mask.height).data, clear = 0, total = d.length / 4;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 110) clear++;
      pct = clear / total;
      if (pctEl) pctEl.textContent = String(Math.round(Math.min(pct / 0.62, 1) * 100));
      if (pct >= 0.62) finish();
    }

    function finish() {
      if (finished) return;
      finished = true;
      if (pctEl) pctEl.textContent = "100";
      if (status) status.textContent = "Vitre nettoyée à 100 %. Impeccable.";
      if (cursorApi) cursorApi.wipeDone();
      var tl = gsap.timeline();
      tl.to(canvas, { autoAlpha: 0, duration: 1.1, ease: "power2.out" })
        .fromTo(shine, { opacity: 1, backgroundPosition: "130% 0" }, { backgroundPosition: "-30% 0", duration: 1.5, ease: "power2.inOut" }, 0.2)
        .to(shine, { opacity: 0, duration: 0.4 }, ">-0.2")
        .to(meter, { autoAlpha: 0, y: 12, duration: 0.5 }, 0.3)
        .to($(".wipe__copy", section), { autoAlpha: 0, y: -16, duration: 0.5 }, 0.3)
        .add(function () { done.classList.add("is-visible"); }, 0.6)
        .fromTo(done, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out" }, 0.6);
    }

    function localPoint(e) {
      var r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    var down = false;
    stage.addEventListener("pointerdown", function (e) { down = true; last = localPoint(e); erase(last.x, last.y, last.x, last.y); });
    stage.addEventListener("pointermove", function (e) {
      if (busy) return;
      if (e.pointerType !== "mouse" && !down) return;
      var p = localPoint(e);
      if (last) erase(last.x, last.y, p.x, p.y);
      last = p;
    });
    var up = function () { down = false; last = null; };
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("pointerleave", up);

    // Démonstration / bouton « Tout nettoyer » : trajectoire en S automatique
    function autoWipe(full) {
      if (!built || finished || busy) return;
      busy = true;
      var rows = full ? Math.ceil(H / (R * 1.4)) + 1 : 1;
      var pts = [];
      for (var i = 0; i < rows; i++) {
        var y = full ? (i + 0.5) * (H / rows) : H * 0.58;
        var a = i % 2 === 0 ? -R : W + R, b = i % 2 === 0 ? W + R : -R;
        if (!full) { a = W * 0.18; b = W * 0.82; }
        pts.push({ x: a, y: y }, { x: b, y: y + (full ? 0 : -H * 0.06) });
      }
      var o = { t: 0 };
      var prev = null;
      var segLen = pts.length - 1;
      gsap.to(o, {
        t: segLen,
        duration: full ? 0.32 * rows : 1.3,
        ease: full ? "none" : "power2.inOut",
        onUpdate: function () {
          var s = Math.min(Math.floor(o.t), segLen - 1), f = o.t - s;
          var p0 = pts[s], p1 = pts[s + 1];
          var p = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f + (full ? 0 : Math.sin(f * Math.PI * 2) * H * 0.05) };
          if (prev) erase(prev.x, prev.y, p.x, p.y);
          prev = p;
        },
        onComplete: function () { busy = false; if (full) finish(); }
      });
    }

    if (allBtn) allBtn.addEventListener("click", function () { autoWipe(true); });

    // Construction paresseuse, juste avant l'arrivée à l'écran
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || built) return;
      io.disconnect();
      img.loading = "eager";
      var go = function () { try { build(); } catch (err) { canvas.style.display = "none"; } };
      if (img.decode) img.decode().then(go, go); else whenImageReady(img).then(go);
    }, { rootMargin: "900px 0px" });
    io.observe(section);

    // Petite démonstration automatique à la première apparition
    if (!REDUCED) {
      ScrollTrigger.create({
        trigger: section, start: "top 45%", once: true,
        onEnter: function () { if (!hinted) { hinted = true; setTimeout(function () { autoWipe(false); }, 250); } }
      });
    }

    var lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (finished || !built) return;
      if (Math.abs(window.innerWidth - lastW) < 60) return;
      lastW = window.innerWidth;
      build();
    });
  }

  /* ================================================================== */
  /* Conciergerie, méthode, engagements, à propos                         */
  /* ================================================================== */

  function initConcierge() {
    var visual = $(".concierge__visual");
    if (!visual) return;
    var float = $("[data-float]", visual);
    gsap.fromTo(float, { autoAlpha: 0, y: 90, rotation: 5 }, {
      autoAlpha: 1, y: 0, rotation: 0, duration: 1.4, ease: "power4.out",
      scrollTrigger: { trigger: visual, start: "top 75%", once: true }
    });
    gsap.to(float, { yPercent: -16, ease: "none", scrollTrigger: { trigger: visual, start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo(".concierge__badge", { scale: 0.4, autoAlpha: 0 }, {
      scale: 1, autoAlpha: 1, duration: 1.2, ease: "back.out(1.6)",
      scrollTrigger: { trigger: visual, start: "top 70%", once: true }
    });
  }

  function initStack() {
    var steps = $$("[data-step]");
    steps.forEach(function (step, i) {
      var card = $(".step__card", step), shade = $(".step__shade", step), img = $(".step__media img", step);
      if (img) {
        gsap.fromTo(img, { scale: 1.18 }, { scale: 1, ease: "none", scrollTrigger: { trigger: step, start: "top bottom", end: "top top", scrub: true } });
      }
      gsap.fromTo($(".step__text", step).children, { autoAlpha: 0, y: 30 }, {
        autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.1,
        scrollTrigger: { trigger: step, start: "top 70%", once: true }
      });
      var next = steps[i + 1];
      if (!next) return;
      var st = {
        trigger: next,
        start: function () { return "top " + (headerOffset() + 20 + i * 16 + card.offsetHeight) + "px"; },
        end: function () { return "top " + (headerOffset() + 20 + (i + 1) * 16) + "px"; },
        scrub: true,
        invalidateOnRefresh: true
      };
      gsap.to(card, { scale: 0.93, ease: "none", scrollTrigger: st });
      gsap.to(shade, { opacity: 0.5, ease: "none", scrollTrigger: Object.assign({}, st) });
    });
  }

  function initBento() {
    ScrollTrigger.batch("[data-tile]", {
      start: "top 88%",
      once: true,
      onEnter: function (els) {
        gsap.fromTo(els, { autoAlpha: 0, y: 40, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "power4.out", stagger: 0.08 });
      }
    });
    var m = $("[data-clock-m]"), h = $("[data-clock-h]");
    if (m && h) {
      ScrollTrigger.create({
        trigger: m.closest(".tile"), start: "top 85%", once: true,
        onEnter: function () {
          gsap.fromTo(m, { rotation: 0 }, { rotation: 720, svgOrigin: "60 60", duration: 2.4, ease: "power3.inOut" });
          gsap.fromTo(h, { rotation: 0 }, { rotation: 60, svgOrigin: "60 60", duration: 2.4, ease: "power3.inOut", onComplete: function () {
            gsap.to(m, { rotation: "+=360", svgOrigin: "60 60", duration: 60, ease: "none", repeat: -1 });
          } });
        }
      });
    }
    var days = $$(".tile__week span");
    if (days.length) {
      var patterns = [[0, 2, 4], [1, 3, 5], [0, 1, 2, 3, 4], [5, 6], [2, 4, 6], [0, 3]];
      var k = 0, timer = null;
      var tick = function () { var p = patterns[k++ % patterns.length]; days.forEach(function (d, i) { d.classList.toggle("is-on", p.indexOf(i) > -1); }); };
      ScrollTrigger.create({
        trigger: days[0].closest(".tile"), start: "top bottom", end: "bottom top",
        onToggle: function (s) { clearInterval(timer); if (s.isActive) { tick(); timer = setInterval(tick, 1500); } }
      });
    }
  }

  function initAbout() {
    var q = $("[data-split-quote]");
    if (!q) return;
    if (!hasSplit) { gsap.set(q, { visibility: "visible" }); return; }
    var words = SplitText.create(q, { type: "words" }).words;
    gsap.set(q, { visibility: "visible" });
    gsap.fromTo(words, { autoAlpha: 0, y: 14, filter: "blur(8px)" }, {
      autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "power3.out", stagger: 0.045,
      scrollTrigger: { trigger: q, start: "top 80%", once: true },
      onComplete: function () { gsap.set(words, { clearProps: "filter" }); }
    });
    gsap.to(".about__drop", { yPercent: -18, rotation: 8, ease: "none", scrollTrigger: { trigger: ".about", start: "top bottom", end: "bottom top", scrub: true } });
  }

  /* ================================================================== */
  /* Zone : carte                                                          */
  /* ================================================================== */

  function initMapIntro() {
    var svg = $("[data-zone-map] svg");
    if (!svg) return;
    var rivers = $$("[data-map-river]", svg);
    var links = $$("[data-map-link]", svg);
    var rings = $$("[data-map-ring]", svg);
    var towns = $$(".map__town", svg);
    rivers.forEach(function (p) { var L = p.getTotalLength(); p.style.strokeDasharray = L + " " + L; p.style.strokeDashoffset = L; });
    links.forEach(function (l) {
      var L = Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value);
      l.style.strokeDasharray = L + " " + L; l.style.strokeDashoffset = L;
    });
    var hub = rings[0];
    var origin = hub ? hub.getAttribute("cx") + " " + hub.getAttribute("cy") : "250 300";
    gsap.timeline({ scrollTrigger: { trigger: svg, start: "top 78%", once: true } })
      .from(rings, { scale: 0, svgOrigin: origin, duration: 1.4, ease: "power3.out", stagger: 0.15 })
      .to(rivers, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", stagger: 0.35 }, 0.1)
      .to(links, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", stagger: 0.08 }, 0.7)
      .from(towns, { autoAlpha: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }, 0.9);
  }

  function initMapLinks() {
    var list = $("[data-zone-list]"), svg = $("[data-zone-map] svg");
    if (!list || !svg) return;
    var buttons = $$("[data-town]", list);
    var towns = $$("[data-map-town]", svg);
    var links = $$("[data-map-link]", svg);
    var setActive = function (slug) {
      buttons.forEach(function (b) { b.classList.toggle("is-active", b.dataset.town === slug); });
      towns.forEach(function (t) { t.classList.toggle("is-active", t.dataset.mapTown === slug); });
      links.forEach(function (l) { l.classList.toggle("is-active", l.dataset.mapLink === slug); });
    };
    buttons.forEach(function (b) {
      b.addEventListener("mouseenter", function () { setActive(b.dataset.town); });
      b.addEventListener("focus", function () { setActive(b.dataset.town); });
      b.addEventListener("click", function () { setActive(b.dataset.town); });
    });
    towns.forEach(function (t) { t.addEventListener("mouseenter", function () { setActive(t.dataset.mapTown); }); });
    list.addEventListener("mouseleave", function () { setActive(null); });
    svg.addEventListener("mouseleave", function () { setActive(null); });
  }

  function initBand() {
    var img = $("[data-band-img]");
    if (!img) return;
    gsap.fromTo(img, { yPercent: -9 }, { yPercent: 9, ease: "none", scrollTrigger: { trigger: img.parentNode, start: "top bottom", end: "bottom top", scrub: true } });
  }

  /* ================================================================== */
  /* Avis : bande défilante                                                */
  /* ================================================================== */

  function initReviews() {
    var marquee = $("[data-reviews]"), track = $("[data-reviews-track]");
    if (!marquee || !track) return;
    for (var i = 0; i < 2; i++) {
      var c = track.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      c.removeAttribute("data-reviews-track");
      marquee.appendChild(c);
    }
    var tw = track.getBoundingClientRect().width;
    window.addEventListener("resize", function () { tw = track.getBoundingClientRect().width; });
    var x = 0, visible = false, speed = { f: 1 };
    marquee.addEventListener("mouseenter", function () { gsap.to(speed, { f: 0, duration: 0.6 }); });
    marquee.addEventListener("mouseleave", function () { gsap.to(speed, { f: 1, duration: 0.6 }); });
    marquee.addEventListener("focusin", function () { gsap.to(speed, { f: 0, duration: 0.3 }); });
    marquee.addEventListener("focusout", function () { gsap.to(speed, { f: 1, duration: 0.6 }); });
    ScrollTrigger.create({ trigger: marquee, start: "top bottom", end: "bottom top", onToggle: function (s) { visible = s.isActive; } });
    gsap.ticker.add(function (time, dt) {
      if (!visible || !tw) return;
      x -= 38 * speed.f * (dt / 1000);
      if (x <= -tw) x += tw;
      marquee.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
    });
    gsap.fromTo($$(".review", marquee), { autoAlpha: 0, y: 40 }, {
      autoAlpha: 1, y: 0, duration: 1.1, ease: "power4.out", stagger: 0.05,
      scrollTrigger: { trigger: marquee, start: "top 88%", once: true }
    });
  }

  /* ================================================================== */
  /* Compteurs & étoiles                                                   */
  /* ================================================================== */

  function initCounters() {
    $$("[data-count]").forEach(function (el) {
      var target = parseFloat(el.dataset.count);
      var dec = parseInt(el.dataset.decimals || "0", 10);
      var fmt = function (v) { return v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
      if (REDUCED) { el.textContent = fmt(target); return; }
      var o = { v: 0 };
      el.textContent = fmt(0);
      ScrollTrigger.create({
        trigger: el, start: "top 92%", once: true,
        onEnter: function () { gsap.to(o, { v: target, duration: 1.8, ease: "power3.out", onUpdate: function () { el.textContent = fmt(o.v); } }); }
      });
    });
    if (REDUCED) return;
    $$(".stars-fill").forEach(function (el) {
      var rating = parseFloat(getComputedStyle(el).getPropertyValue("--rating")) || 5;
      el.style.setProperty("--fill", "0");
      ScrollTrigger.create({
        trigger: el, start: "top 92%", once: true,
        onEnter: function () { gsap.fromTo(el, { "--fill": 0 }, { "--fill": rating, duration: 1.6, ease: "power2.out", delay: 0.2 }); }
      });
    });
  }

  /* ================================================================== */
  /* Pied de page, dock mobile, goutte de progression                     */
  /* ================================================================== */

  function initFooter() {
    var word = $("[data-footer-word]");
    if (!word) return;
    gsap.fromTo(word, { yPercent: 35, autoAlpha: 0 }, {
      yPercent: 0, autoAlpha: 1, duration: 1.4, ease: "power4.out",
      scrollTrigger: { trigger: word, start: "top 95%", once: true }
    });
    gsap.fromTo(word, { backgroundPosition: "100% 0" }, {
      backgroundPosition: "0% 0", ease: "none",
      scrollTrigger: { trigger: word, start: "top 92%", end: "bottom bottom", scrub: 1 }
    });
  }

  function initDockAndProgress() {
    var dock = $("[data-dock]"), drop = $("[data-drop-progress]"), fill = $("[data-drop-fill]");
    var hero = $("[data-hero]"), contact = $("#contact");
    var past = false, inContact = false;
    var update = function () {
      if (dock) dock.classList.toggle("is-visible", past && !inContact && !menuOpen);
      if (drop) drop.classList.toggle("is-visible", past);
    };
    if (hero) ScrollTrigger.create({ trigger: hero, start: "bottom 65%", onEnter: function () { past = true; update(); }, onLeaveBack: function () { past = false; update(); } });
    if (contact) ScrollTrigger.create({ trigger: contact, start: "top 75%", onEnter: function () { inContact = true; update(); }, onLeaveBack: function () { inContact = false; update(); } });
    if (fill) ScrollTrigger.create({ start: 0, end: "max", onUpdate: function (s) { fill.style.setProperty("--p", (s.progress * 100).toFixed(1) + "%"); } });
  }

  /* ================================================================== */
  /* FAQ (accordéon animé sur base <details>)                              */
  /* ================================================================== */

  function initFaq() {
    var items = $$("[data-faq]");
    var refresh = function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); };
    items.forEach(function (d) {
      var summary = $("summary", d), panel = $(".faq__panel", d), inner = $(".faq__inner", d);
      summary.addEventListener("click", function (e) {
        if (!window.gsap || REDUCED) { setTimeout(refresh, 0); return; }
        e.preventDefault();
        if (d.open) {
          gsap.fromTo(panel, { height: panel.offsetHeight }, {
            height: 0, duration: 0.5, ease: "power3.inOut",
            onComplete: function () { d.open = false; panel.style.height = ""; refresh(); }
          });
        } else {
          d.open = true;
          var h = panel.scrollHeight;
          gsap.fromTo(panel, { height: 0 }, { height: h, duration: 0.6, ease: "power3.out", onComplete: function () { panel.style.height = ""; refresh(); } });
          gsap.fromTo(inner, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.1, ease: "power2.out" });
        }
      });
    });
  }

  /* ================================================================== */
  /* Formulaire de devis en 3 étapes -> email pré-rempli                   */
  /* ================================================================== */

  function initQuote() {
    var form = $("[data-quote]");
    if (!form) return;
    var steps = $$("[data-quote-step]", form);
    var bar = $("[data-quote-bar]", form);
    var current = $("[data-quote-current]", form);
    var done = $("[data-quote-done]", form);
    var progress = $(".quote__progress", form);
    var status = $("[data-quote-status]", form);
    var index = 0;
    var EMAIL = "deepclean.contact.pro@gmail.com";

    var err = function (name, msg) { var el = $('[data-error="' + name + '"]', form); if (el) el.textContent = msg || ""; };
    var refresh = function () { if (window.ScrollTrigger) ScrollTrigger.refresh(); };

    function go(n) {
      if (n === index || n < 0 || n >= steps.length) return;
      var dir = n > index ? 1 : -1;
      steps[index].classList.remove("is-active");
      steps[n].classList.add("is-active");
      index = n;
      if (current) current.textContent = String(n + 1);
      if (bar) bar.style.transform = "scaleX(" + ((n + 1) / steps.length) + ")";
      if (window.gsap && !REDUCED) gsap.fromTo(steps[n], { autoAlpha: 0, x: 36 * dir }, { autoAlpha: 1, x: 0, duration: 0.6, ease: "power3.out" });
      var legend = $(".quote__legend", steps[n]);
      if (legend) { legend.setAttribute("tabindex", "-1"); try { legend.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
      if (status) status.textContent = "Étape " + (n + 1) + " sur " + steps.length + " : " + (legend ? legend.textContent : "");
      refresh();
    }

    function checked(name) { return $$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }

    function validate(n) {
      if (n === 0) {
        var ok0 = checked("profil").length > 0;
        err("profil", ok0 ? "" : "Choisissez une option pour continuer.");
        return ok0;
      }
      if (n === 1) {
        var ok1 = checked("prestation").length > 0;
        err("prestation", ok1 ? "" : "Sélectionnez au moins une prestation.");
        return ok1;
      }
      var nom = form.nom, tel = form.telephone, mail = form.email, problems = [];
      [nom, tel, mail].forEach(function (f) { f.removeAttribute("aria-invalid"); });
      if (!nom.value.trim()) { problems.push("votre nom"); nom.setAttribute("aria-invalid", "true"); }
      if (tel.value.replace(/\D/g, "").length < 10) { problems.push("un numéro de téléphone valide"); tel.setAttribute("aria-invalid", "true"); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.value.trim())) { problems.push("une adresse email valide"); mail.setAttribute("aria-invalid", "true"); }
      err("contact", problems.length ? "Merci d'indiquer " + problems.join(", ") + "." : "");
      if (problems.length) {
        var first = $('[aria-invalid="true"]', form);
        if (first) first.focus();
      }
      return !problems.length;
    }

    $$("[data-quote-next]", form).forEach(function (b) { b.addEventListener("click", function () { if (validate(index)) go(index + 1); }); });
    $$("[data-quote-prev]", form).forEach(function (b) { b.addEventListener("click", function () { go(index - 1); }); });
    $$('input[name="profil"]', form).forEach(function (r) { r.addEventListener("change", function () { err("profil", ""); }); });
    $$('input[name="prestation"]', form).forEach(function (r) { r.addEventListener("change", function () { err("prestation", ""); }); });

    // Boutons « Demander un devis » des panneaux : profil pré-sélectionné
    $$("[data-preset]").forEach(function (a) {
      a.addEventListener("click", function () {
        var value = a.getAttribute("data-preset");
        var radio = $$('input[name="profil"]', form).filter(function (r) { return r.value === value; })[0];
        if (!radio) return;
        radio.checked = true;
        err("profil", "");
        if (value.indexOf("conciergerie") > -1) {
          var chip = $$('input[name="prestation"]', form).filter(function (c) { return c.value === "Conciergerie"; })[0];
          if (chip) chip.checked = true;
        }
        setTimeout(function () { if (index === 0) go(1); }, 900);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      for (var n = 0; n < steps.length; n++) {
        if (!validate(n)) { go(n); return; }
      }
      if (form.societe && form.societe.value) { showDone(); return; } // pot de miel : robot
      var profil = checked("profil")[0] || "";
      var commune = form.commune.value;
      var subject = "Demande de devis — " + profil + (commune ? " — " + commune : "");
      var lines = [
        "Bonjour,",
        "",
        "Je souhaite recevoir un devis.",
        "",
        "Profil : " + profil,
        "Prestation(s) : " + checked("prestation").join(", "),
        "Commune : " + (commune || "non précisée"),
        "Surface approximative : " + (form.surface.value.trim() || "non précisée"),
        "",
        "Précisions :",
        form.message.value.trim() || "—",
        "",
        "Nom : " + form.nom.value.trim(),
        "Téléphone : " + form.telephone.value.trim(),
        "Email : " + form.email.value.trim()
      ];
      window.location.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
      showDone();
    });

    function showDone() {
      steps.forEach(function (s) { s.classList.remove("is-active"); s.style.display = "none"; });
      if (progress) progress.style.display = "none";
      done.hidden = false;
      if (window.gsap && !REDUCED) {
        gsap.fromTo(done, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" });
        var path = $(".quote__check path", done);
        if (path) { var L = path.getTotalLength(); gsap.fromTo(path, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 0.8, delay: 0.2, ease: "power2.out" }); }
      }
      try { done.focus({ preventScroll: true }); } catch (e2) { done.focus(); }
      if (status) status.textContent = "Votre messagerie s'ouvre avec votre demande pré-remplie.";
      refresh();
    }

    var restart = $("[data-quote-restart]", form);
    if (restart) restart.addEventListener("click", function () {
      form.reset();
      done.hidden = true;
      if (progress) progress.style.display = "";
      steps.forEach(function (s) { s.style.display = ""; });
      steps[0].classList.add("is-active");
      index = 0;
      if (current) current.textContent = "1";
      if (bar) bar.style.transform = "scaleX(" + (1 / steps.length) + ")";
      refresh();
    });
  }
})();
