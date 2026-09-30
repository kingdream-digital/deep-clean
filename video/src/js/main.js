// Amorçage : polices → scènes → préchargement des images → prêt.
// Hors rendu (?render=1 absent), un petit lecteur permet de visionner la
// composition dans un navigateur : Espace = lecture/pause, ←/→ = ±1 s,
// ?t=12.5 pour démarrer à un instant précis. La bande-son est jouée si
// out/soundtrack.wav existe.
(async () => {
  const params = new URLSearchParams(location.search);
  const rendering = params.has("render");

  await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px Inter`)));
  await document.fonts.load("40px 'Noto Color Emoji'", "👍");

  DC.setupGrain();
  for (const build of window.SCENES) build();
  DC.master.set({}, {}, DC.DURATION); // la timeline dure exactement 60 s

  const pending = [...document.images].map((img) => (img.complete ? img.decode() : new Promise((r) => (img.onload = img.onerror = r)).then(() => img.decode())).catch(() => {}));
  await Promise.all(pending);

  window.__CUES__ = DC.cues.slice().sort((a, b) => a.t - b.t);
  window.__seek = DC.seek;
  DC.seek(Number(params.get("t") || 0));
  window.__READY__ = true;

  if (rendering) return;

  // --- Lecteur de prévisualisation ---
  const stage = DC.stage;
  const fit = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  };
  fit();
  addEventListener("resize", fit);
  const hud = document.createElement("div");
  hud.style.cssText = "position:fixed;left:12px;bottom:10px;font:12px monospace;color:#9aa7b0;z-index:999";
  document.body.appendChild(hud);
  const audio = new Audio("out/soundtrack.wav");
  let t = Number(params.get("t") || 0);
  let playing = false;
  let last = 0;
  const loop = (now) => {
    if (playing) {
      t += (now - last) / 1000;
      if (t >= DC.DURATION) { t = 0; audio.currentTime = 0; }
      DC.seek(t);
    }
    last = now;
    hud.textContent = `${t.toFixed(2)} s — espace : lecture/pause, ←/→ : ±1 s`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      playing = !playing;
      if (playing) { audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause();
    }
    if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
      t = Math.max(0, Math.min(DC.DURATION, t + (e.code === "ArrowRight" ? 1 : -1)));
      audio.currentTime = t;
      DC.seek(t);
    }
  });
})();
