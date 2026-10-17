// Effets décoratifs déterministes (bulles, vagues, éclaboussures) — aucune ressource réseau.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Catmull-Rom fermé → chemin de Bézier
  function closedPath(pts) {
    const n = pts.length;
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + "Z";
  }

  // Bulles : <div class="bubbles" data-seed data-n data-zone="x0,y0,x1,y1" data-min data-max data-avoid="x0,y0,x1,y1;…">
  document.querySelectorAll(".bubbles").forEach((box) => {
    const r = rng(+box.dataset.seed || 1);
    const n = +box.dataset.n || 20;
    const [x0, y0, x1, y1] = (box.dataset.zone || "0,0,1290,2796").split(",").map(Number);
    const min = +box.dataset.min || 10, max = +box.dataset.max || 70;
    const avoid = (box.dataset.avoid || "").split(";").filter(Boolean).map((z) => z.split(",").map(Number));
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 2000) {
      const size = min + Math.pow(r(), 2.2) * (max - min);
      const x = x0 + r() * (x1 - x0 - size), y = y0 + r() * (y1 - y0 - size);
      const cx = x + size / 2, cy = y + size / 2;
      if (avoid.some(([a, b, c, d]) => cx > a && cx < c && cy > b && cy < d)) continue;
      const el = document.createElement("div");
      el.className = "bubble";
      el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;opacity:${0.55 + r() * 0.45}`;
      box.appendChild(el);
      placed++;
    }
  });

  // Vagues : <path data-wave="y,amp,len,phase" fill=…>
  document.querySelectorAll("[data-wave]").forEach((p) => {
    const [y, amp, len, ph] = p.dataset.wave.split(",").map(Number);
    let d = `M-20,${y}`;
    for (let x = -20; x <= 1310; x += 10) {
      const k = (x / len) * Math.PI * 2 + ph;
      const yy = y + amp * Math.sin(k) + amp * 0.35 * Math.sin(k * 2.3 + 1.7);
      d += `L${x},${yy.toFixed(1)}`;
    }
    d += "L1310,2900L-20,2900Z";
    p.setAttribute("d", d);
  });

  // Éclaboussures (tache d'eau + gouttelettes) : <svg class="splash" data-seed data-spikes data-color>
  document.querySelectorAll("svg.splash").forEach((svg) => {
    const r = rng(+svg.dataset.seed || 7);
    const lobes = +svg.dataset.spikes || 6;
    const color = svg.dataset.color || "#4FD1F2";
    svg.setAttribute("viewBox", "-200 -200 400 400");
    const N = 40;
    const lobeAt = new Map();
    while (lobeAt.size < lobes) lobeAt.set(Math.floor(r() * N), 1.12 + r() * 0.32);
    const pts = [];
    const drops = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let rad = 76 + 10 * Math.sin(a * 3 + 1.3) + r() * 8;
      // lobes arrondis : on gonfle les voisins pour garder une forme d'eau, pas d'épine
      for (const [j, L] of lobeAt) {
        const d = Math.min(Math.abs(i - j), N - Math.abs(i - j));
        if (d === 0) rad = 100 * L;
        else if (d === 1) rad = Math.max(rad, 100 * (0.78 + (L - 0.78) * 0.55));
      }
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    for (const [j, L] of lobeAt) {
      const a = (j / N) * Math.PI * 2;
      const k = 1 + Math.floor(r() * 2.6);
      for (let m = 0; m < k; m++) {
        const dist = 100 * (L + 0.16 + m * 0.2 + r() * 0.08);
        const aa = a + (r() - 0.5) * 0.12;
        drops.push([Math.cos(aa) * dist, Math.sin(aa) * dist, Math.max(3, 15 - m * 5 - r() * 4)]);
      }
    }
    for (let m = 0; m < 9; m++) {
      const a = r() * Math.PI * 2, dist = 120 + r() * 70;
      drops.push([Math.cos(a) * dist, Math.sin(a) * dist, 3 + r() * 7]);
    }
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", closedPath(pts));
    path.setAttribute("fill", color);
    svg.appendChild(path);
    drops.forEach(([x, y, s]) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); c.setAttribute("r", s.toFixed(1));
      c.setAttribute("fill", color);
      svg.appendChild(c);
    });
  });

  // Zoom sur une partie d'une capture : <div class="zoom" data-zoom="src|x|y|w|h|échelle|rayon">
  document.querySelectorAll(".zoom[data-zoom]").forEach((el) => {
    const [src, x, y, w, h, k, rad] = el.dataset.zoom.split("|");
    const s = +k;
    el.style.width = (+w * s) + "px";
    el.style.height = (+h * s) + "px";
    el.style.backgroundImage = `url("${src}")`;
    el.style.backgroundSize = (1290 * s) + "px auto";
    el.style.backgroundPosition = `${-x * s}px ${-y * s}px`;
    el.style.borderRadius = (+rad * s) + "px";
  });

  // Étincelles : <svg class="spark" …> → étoile à 4 branches
  document.querySelectorAll("svg.spark").forEach((svg) => {
    svg.setAttribute("viewBox", "-50 -50 100 100");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M0,-50C5,-13 13,-5 50,0C13,5 5,13 0,50C-5,13 -13,5 -50,0C-13,-5 -5,-13 0,-50Z");
    p.setAttribute("fill", svg.dataset.color || "#fff");
    svg.appendChild(p);
  });
})();
