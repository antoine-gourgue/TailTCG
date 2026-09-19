// Banc de détection sur des PHOTOS RÉELLES (cartes en main, ouvertures de
// boosters, tables, images de vidéos) : chaque image d'un dossier, ramenée à
// la taille d'analyse du téléphone (grand côté 640 px), passe dans la
// détection ; on mesure le taux de détection, le temps, la précision des
// coins quand un label YOLO-polygone existe (dossier frère labels/, format
// « 0 x1 y1 x2 y2 … » normalisé), et la reconnaissance de la carte redressée
// dans l'index (score < 0,25 : la détection était bonne). Sur un dossier de
// négatifs (pas de carte), « détectée » compte les faux positifs.
// Avec --dump, écrit les images annotées (vert = 1er candidat, jaune = 2e,
// rouge = 3e, bleu = vérité terrain) et des planches-contact dans .scan-real/.
//
//   node --no-warnings scripts/scan-real-bench.mjs <dossier>… [--dump] [--no-match]
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { detectCardQuads, warpCard, TUNE } from "../src/lib/scan/detect.mjs";
import { hashCardVariants, hamming, HASH_BITS } from "../src/lib/scan/phash.mjs";

// --tune clé=valeur[,clé=valeur] : réglages de détection à essayer (voir TUNE dans detect.mjs)
const tuneArg = process.argv.find((a) => a.startsWith("--tune="));
if (tuneArg) {
  for (const kv of tuneArg.slice(7).split(",")) {
    const [k, v] = kv.split("=");
    TUNE[k] = v === "true" ? true : v === "false" ? false : Number.isNaN(Number(v)) ? v : Number(v);
  }
  console.log("réglages :", JSON.stringify(TUNE));
}
const cv = createRequire(import.meta.url)("@techstark/opencv-js");
await new Promise((r) => (cv.Mat ? r() : cv.then(() => r())));
delete cv.then;

const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!dirs.length) {
  console.error("usage : node scripts/scan-real-bench.mjs <dossier d'images>… [--dump] [--no-match]");
  process.exit(1);
}
const DUMP = process.argv.includes("--dump");
const MATCH = !process.argv.includes("--no-match");
const OUT = ".scan-real";
if (DUMP) mkdirSync(OUT, { recursive: true });
const LONG = 640;

const idx = JSON.parse(readFileSync("src/data/scan-index.json", "utf8"));
const cards = idx.cards.map(([id, lang, name, , h]) => {
  const b = Buffer.from(h, "base64");
  return { id, lang, name, whole: new Uint8Array(b.buffer, b.byteOffset, 32), art: new Uint8Array(b.buffer, b.byteOffset + 32, 32) };
});
const W_ART = 0.6;
const dist = (v, c) => ((1 - W_ART) * hamming(v.whole, c.whole) + W_ART * hamming(v.art, c.art)) / HASH_BITS;
const bestOf = (vs, c) => {
  let m = Infinity;
  for (const v of vs) {
    const d = dist(v, c);
    if (d < m) m = d;
  }
  return m;
};
function match(q) {
  const coarse = cards.map((c, i) => ({ i, s: bestOf(q.coarse, c) })).sort((a, b) => a.s - b.s).slice(0, 300);
  const ranked = coarse.map(({ i, s }) => ({ i, s: Math.min(s, bestOf(q.dense, cards[i])) })).sort((a, b) => a.s - b.s);
  const c = cards[ranked[0].i];
  return { id: c.id, name: c.name, s: ranked[0].s };
}

const toMat = async (buf) => {
  const { data, info } = await sharp(buf).rotate().resize({ width: LONG, height: LONG, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  m.data.set(data);
  return m;
};
const matToJpeg = (m, q = 80) =>
  sharp(Buffer.from(m.data), { raw: { width: m.cols, height: m.rows, channels: 4 } }).jpeg({ quality: q }).toBuffer();
const poly = (img, q, col, w = 3) => {
  for (let k = 0; k < 4; k++) {
    const a = q[k];
    const b = q[(k + 1) % 4];
    cv.line(img, new cv.Point(Math.round(a[0]), Math.round(a[1])), new cv.Point(Math.round(b[0]), Math.round(b[1])), col, w);
  }
};
const COLORS = [new cv.Scalar(0, 255, 0, 255), new cv.Scalar(255, 220, 0, 255), new cv.Scalar(255, 40, 40, 255)];
const BLUE = new cv.Scalar(40, 120, 255, 255);

/** Vérité terrain YOLO-polygone (coins normalisés), s'il y en a une pour cette image */
function groundTruth(dir, f, W, H) {
  const lab = `${dir.replace(/\/images(\/|$)/, "/labels$1")}/${f.replace(/\.[^.]+$/, ".txt")}`;
  if (lab === `${dir}/${f}` || !existsSync(lab)) return null;
  const nums = readFileSync(lab, "utf8").trim().split(/\s+/).slice(1).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const p = [nums[i] * W, nums[i + 1] * H];
    if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2)) pts.push(p);
  }
  return pts.length === 4 ? pts : null;
}
/** Erreur moyenne des coins (meilleure rotation), en part de la diagonale */
function cornerError(q, gt) {
  const diag = Math.hypot(gt[2][0] - gt[0][0], gt[2][1] - gt[0][1]);
  let err = Infinity;
  for (let r = 0; r < 4; r++) {
    let e = 0;
    for (let k = 0; k < 4; k++) e += Math.hypot(q[(k + r) % 4][0] - gt[k][0], q[(k + r) % 4][1] - gt[k][1]);
    err = Math.min(err, e / 4);
  }
  return err / diag;
}

let sheetNo = 0;
async function sheet(items, name) {
  const TW = 240;
  const TH = 264;
  const COLS = 8;
  for (let s = 0; s * 40 < items.length; s++) {
    const batch = items.slice(s * 40, s * 40 + 40);
    const tiles = [];
    for (const [i, a] of batch.entries()) {
      const thumb = await sharp(a.jpg).resize({ width: TW, height: TH, fit: "contain", background: "#222" }).jpeg().toBuffer();
      const label = Buffer.from(`<svg width="${TW}" height="18"><rect width="${TW}" height="18" fill="#000" opacity=".6"/><text x="4" y="13" font-size="12" fill="#fff" font-family="sans-serif">${a.label}</text></svg>`);
      tiles.push({ input: await sharp(thumb).composite([{ input: label, top: 0, left: 0 }]).toBuffer(), left: (i % COLS) * TW, top: Math.floor(i / COLS) * TH });
    }
    sheetNo++;
    await sharp({ create: { width: COLS * TW, height: Math.ceil(batch.length / COLS) * TH, channels: 3, background: "#111" } })
      .composite(tiles)
      .jpeg({ quality: 80 })
      .toFile(`${OUT}/sheet_${name}_${sheetNo}.jpg`);
  }
}

const totals = [];
for (const dir of dirs) {
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const name = basename(dir.replace(/\/images$/, "").replace(/\/$/, ""));
  let n = 0;
  let detected = 0;
  let recognized = 0;
  let labelled = 0;
  let precise = 0;
  let usable = 0;
  let preciseTop3 = 0;
  let tDet = 0;
  const annotated = [];
  for (const f of files) {
    let src;
    try {
      src = await toMat(readFileSync(`${dir}/${f}`));
    } catch {
      continue;
    }
    n++;
    const t0 = performance.now();
    const quads = detectCardQuads(cv, src, 3);
    const dt = performance.now() - t0;
    tDet += dt;
    const gt = groundTruth(dir, f, src.cols, src.rows);
    let err = null;
    if (gt) {
      labelled++;
      if (quads[0]) {
        err = cornerError(quads[0].corners, gt);
        if (err < 0.03) precise++;
        if (err < 0.06) usable++;
        if (quads.some((q) => cornerError(q.corners, gt) < 0.03)) preciseTop3++;
      }
    }
    let top = null;
    if (quads.length) {
      detected++;
      if (MATCH || DUMP) {
        const rect = warpCard(cv, src, quads[0].corners);
        const rj = await matToJpeg(rect, 80);
        rect.delete();
        if (MATCH) {
          top = match(await hashCardVariants(rj));
          if (top.s < 0.25) recognized++;
        }
        if (DUMP) writeFileSync(`${OUT}/rect_${name}_${n}.jpg`, rj);
      }
    }
    console.log(
      `${String(n).padStart(4)} ${f.slice(0, 28).padEnd(28)} ${dt.toFixed(0).padStart(4)} ms | ${quads.length ? quads.map((q, i) => `${i + 1}:${q.score.toFixed(3)}`).join(" ") : "—"}${err != null ? ` | coins ${(100 * err).toFixed(1)} %` : gt ? " | coins —" : ""}${top ? ` | ${top.name} ${top.s.toFixed(3)}` : ""}`,
    );
    if (DUMP) {
      const dbg = src.clone();
      if (gt) poly(dbg, gt, BLUE, 2);
      const shown = quads.slice(0, 3);
      shown.slice().reverse().forEach((q, i) => poly(dbg, q.corners, COLORS[shown.length - 1 - i], i === shown.length - 1 ? 4 : 2));
      const jpg = await matToJpeg(dbg, 80);
      writeFileSync(`${OUT}/scene_${name}_${n}.jpg`, jpg);
      annotated.push({
        jpg,
        label: `${n} ${quads.length ? quads[0].score.toFixed(2) : "×"}${err != null ? ` e${(100 * err).toFixed(0)}` : ""}${top && top.s < 0.25 ? " ✓" : ""}`,
      });
      dbg.delete();
    }
    src.delete();
  }
  if (DUMP) await sheet(annotated, name);
  const pct = (v, d = n) => (d ? `${((100 * v) / d).toFixed(0)} %` : "—");
  const line = `${name.padEnd(12)} images ${n} | détectée ${detected} (${pct(detected)})${labelled ? ` | coins précis (< 3 % diag) ${precise}/${labelled} (${pct(precise, labelled)}), corrects (< 6 %) ${usable} (${pct(usable, labelled)}), précis dans le top 3 ${preciseTop3} (${pct(preciseTop3, labelled)})` : ""}${MATCH ? ` | reconnue ${recognized} (${pct(recognized)})` : ""} | détection ${(tDet / Math.max(1, n)).toFixed(0)} ms`;
  totals.push(line);
}
console.log(`\n${totals.join("\n")}`);
