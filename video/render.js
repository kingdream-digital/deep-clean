// Rendu de la vidéo Deep Clean, image par image.
//
// La composition (index.html) est une timeline GSAP en pause : on la
// positionne à un instant précis (window.__seek), on capture l'écran, et ainsi
// de suite pour chaque image. Le rendu est donc déterministe et parfaitement
// fluide, quelle que soit la machine — aucune capture "en temps réel".
//
// Usage :
//   node render.js stills 6.2 14 27.5        → out/stills/t_06.200.jpg …
//   node render.js sheet 12 26 0.5           → out/sheets/sheet_12-26.jpg (planche contact)
//   node render.js cues                      → out/cues.json (repères son, pour audio/soundtrack.py)
//   node render.js frames [--from s] [--to s] [--workers n] → out/frames/000000.jpg …
//   node render.js encode [--light]          → Deep-Clean-Motion-Design.mp4 (images + out/soundtrack.wav)
//                                              --light : Deep-Clean-Motion-Design-720p.mp4 (partage)

const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FPS = 60;
const DURATION = 60;
const WIDTH = 1920;
const HEIGHT = 1080;
const REPO = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FFMPEG = process.env.FFMPEG_PATH || findFfmpeg();

function findFfmpeg() {
  try {
    return require("child_process")
      .execSync("python3 -c \"import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())\"")
      .toString()
      .trim();
  } catch {
    return "ffmpeg";
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

// Serveur statique minimal sur la racine du dépôt : la composition réutilise
// directement les captures, polices et photos déjà présentes (application/,
// site/) sans les dupliquer dans video/.
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(REPO, rel);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function openComposition(browser, port) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.error("[page]", m.text());
  });
  // VIDEO_QUERY permet de passer des options à la composition (ex. "grain=film").
  const extra = process.env.VIDEO_QUERY ? `&${process.env.VIDEO_QUERY}` : "";
  await page.goto(`http://127.0.0.1:${port}/video/index.html?render=1${extra}`);
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 60000 });
  return page;
}

async function withComposition(fn) {
  const server = await serve();
  const browser = await chromium.launch({
    // Chromium préinstallé si présent, sinon celui de Playwright (npx playwright install chromium).
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ["--no-sandbox", "--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"],
  });
  try {
    return await fn(browser, server.address().port);
  } finally {
    await browser.close();
    server.close();
  }
}

async function capture(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  return page.screenshot({ type: "jpeg", quality: 94 });
}

async function stills(times) {
  const dir = path.join(OUT, "stills");
  fs.mkdirSync(dir, { recursive: true });
  await withComposition(async (browser, port) => {
    const page = await openComposition(browser, port);
    for (const t of times) {
      const file = path.join(dir, `t_${t.toFixed(3).padStart(7, "0")}.jpg`);
      fs.writeFileSync(file, await capture(page, t));
      console.log(file);
    }
  });
}

// Planche contact : une vignette tous les `step` secondes, pour relire le
// rythme d'une scène d'un seul coup d'œil.
async function sheet(from, to, step) {
  const dir = path.join(OUT, "sheets");
  fs.mkdirSync(dir, { recursive: true });
  const times = [];
  for (let t = from; t <= to + 1e-6; t += step) times.push(Math.round(t * 1000) / 1000);
  await withComposition(async (browser, port) => {
    const page = await openComposition(browser, port);
    const shots = [];
    for (const t of times) shots.push({ t, data: (await capture(page, t)).toString("base64") });
    const cols = 4;
    const w = 480;
    const h = 270;
    const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;font:12px monospace;color:#fff">${shots
      .map(
        (s) =>
          `<div style="position:relative;width:${w}px;height:${h}px"><img src="data:image/jpeg;base64,${s.data}" style="width:100%;height:100%"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">${s.t.toFixed(2)}s</span></div>`
      )
      .join("")}</body>`;
    const rows = Math.ceil(shots.length / cols);
    const sheetPage = await browser.newPage({ viewport: { width: cols * (w + 4), height: rows * (h + 4) } });
    await sheetPage.setContent(html);
    const file = path.join(dir, `sheet_${from}-${to}.jpg`);
    await sheetPage.screenshot({ path: file, type: "jpeg", quality: 85, fullPage: true });
    console.log(file);
  });
}

async function cues() {
  await withComposition(async (browser, port) => {
    const page = await openComposition(browser, port);
    const list = await page.evaluate(() => window.__CUES__);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "cues.json"), JSON.stringify(list, null, 1));
    console.log(`${list.length} cues → out/cues.json`);
  });
}

async function frames(from, to, workers) {
  const dir = path.join(OUT, "frames");
  fs.mkdirSync(dir, { recursive: true });
  const first = Math.round(from * FPS);
  const last = Math.min(Math.round(to * FPS), DURATION * FPS) - 1;
  const total = last - first + 1;
  const started = Date.now();
  let done = 0;
  await withComposition(async (browser, port) => {
    // Découpage en tranches entrelacées : chaque worker prend une image sur n,
    // ce qui équilibre la charge (certaines scènes sont plus lourdes à peindre).
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const page = await openComposition(browser, port);
        for (let f = first + w; f <= last; f += workers) {
          const buf = await capture(page, f / FPS);
          fs.writeFileSync(path.join(dir, `${String(f).padStart(6, "0")}.jpg`), buf);
          done++;
          if (done % 120 === 0 || done === total) {
            const el = (Date.now() - started) / 1000;
            console.log(`${done}/${total} images — ${el.toFixed(0)} s écoulées, ~${((el / done) * (total - done)).toFixed(0)} s restantes`);
          }
        }
      })
    );
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

// Deux sorties : la version de référence (1080p60, ~45 Mo) et une version
// légère (720p30, ~10 Mo) faite pour WhatsApp, l'e-mail et les réseaux.
async function encode(light = false) {
  const audio = path.join(OUT, "soundtrack.wav");
  const output = path.join(__dirname, light ? "Deep-Clean-Motion-Design-720p.mp4" : "Deep-Clean-Motion-Design.mp4");
  const args = ["-y", "-framerate", String(FPS), "-i", path.join(OUT, "frames", "%06d.jpg")];
  if (fs.existsSync(audio)) args.push("-i", audio);
  if (light) args.push("-vf", "fps=30,scale=1280:720:flags=lanczos");
  args.push(
    "-c:v", "libx264", "-preset", "slow", "-crf", light ? "23" : "19", "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-level", light ? "4.0" : "4.2", "-movflags", "+faststart",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"
  );
  if (fs.existsSync(audio)) args.push("-c:a", "aac", "-b:a", light ? "160k" : "256k", "-shortest");
  args.push(output);
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-stats", ...args]);
  console.log(output);
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name, def) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? Number(rest[i + 1]) : def;
  };
  if (cmd === "stills") await stills(rest.map(Number));
  else if (cmd === "sheet") await sheet(Number(rest[0]), Number(rest[1]), Number(rest[2] || 0.5));
  else if (cmd === "cues") await cues();
  else if (cmd === "frames") await frames(opt("from", 0), opt("to", DURATION), opt("workers", 4));
  else if (cmd === "encode") await encode(rest.includes("--light"));
  else {
    console.log("commandes : stills | sheet | cues | frames | encode");
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
