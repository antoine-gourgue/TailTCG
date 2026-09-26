// Vidéo de présentation (README) : `node scripts/demo-film/capture.mjs /tmp/tailtcg-demo` rend 750 images (25 s à 30 i/s),
// puis ffmpeg -framerate 30 -i /tmp/tailtcg-demo/frames/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 20 docs/demo.mp4
// et le GIF : ffmpeg -i docs/demo.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/demo.gif
// Rend le film image par image (temps déterministe via window.__seek) avec Chrome headless + CDP
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
const OUT = process.argv[2] ?? "/tmp/tailtcg-demo";
const FILM = new URL("./film.html", import.meta.url).pathname;
const FPS = 30;
const DURATION = Number(process.env.DURATION ?? 25);
const ONLY = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9350;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/chrome`, "--no-first-run", "--window-size=1280,720", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
try {
  let targets = [];
  for (let i = 0; i < 40 && !targets.length; i++) { await sleep(250); try { targets = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((t) => t.type === "page"); } catch {} }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `file://${FILM}` });
  for (let i = 0; i < 80; i++) { await sleep(250); const r = await send("Runtime.evaluate", { expression: "!!window.__ready", returnByValue: true }); if (r.result.value) break; }
  await sleep(300);
  mkdirSync(`${OUT}/frames`, { recursive: true });
  const times = ONLY ?? Array.from({ length: Math.round(DURATION * FPS) }, (_, i) => i / FPS);
  let n = 0;
  for (const t of times) {
    await send("Runtime.evaluate", { expression: `window.__seek(${t})` });
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const name = ONLY ? `key-${t.toFixed(1)}s.png` : `f${String(n).padStart(4, "0")}.png`;
    writeFileSync(`${OUT}/frames/${name}`, Buffer.from(shot.data, "base64"));
    n++;
  }
  console.log(`${n} images rendues`);
  ws.close();
} finally { chrome.kill(); }
