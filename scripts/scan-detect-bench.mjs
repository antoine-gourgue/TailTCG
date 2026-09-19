// Banc de test de la détection de carte (src/lib/scan/detect.mjs) sur des
// scènes synthétiques difficiles : fond de clavier, bureau, carte en
// perspective et tournée, main sur un coin, bande de reflet, JPEG. Mesure la
// détection, la précision des coins et la reconnaissance bout en bout via les
// empreintes de l'index. À relancer après tout réglage du détecteur.
//
//   node --no-warnings scripts/scan-detect-bench.mjs [nb scènes] [--dump] [--no-frame]
//   --dump écrit scènes annotées et cartes redressées dans .scan-bench/
//   --no-frame : jamais de cadre derrière la carte (scènes « faciles »)
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";
import { detectCardQuads, warpCard } from "../src/lib/scan/detect.mjs";
import { hashCardVariants, hamming, HASH_BITS } from "../src/lib/scan/phash.mjs";

const cv = createRequire(import.meta.url)("@techstark/opencv-js");
// Module Emscripten : un « thenable » qui se résout sur lui-même, à ne jamais await-er
await new Promise((r) => (cv.Mat ? r() : cv.then(() => r())));
delete cv.then;

const OUT = ".scan-bench";
mkdirSync(`${OUT}/cards`, { recursive: true });
const DUMP = process.argv.includes("--dump");
const NO_FRAME = process.argv.includes("--no-frame");
const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40);

const idx = JSON.parse(readFileSync("src/data/scan-index.json", "utf8"));
const cards = idx.cards.map(([id, lang, name, setId, h, img]) => {
  const b = Buffer.from(h, "base64");
  const [, serie] = idx.sets[`${lang}/${setId}`] ?? ["", ""];
  return {
    id,
    lang,
    name,
    whole: new Uint8Array(b.buffer, b.byteOffset, 32),
    art: new Uint8Array(b.buffer, b.byteOffset + 32, 32),
    image: img || `https://assets.tcgdex.net/${lang}/${serie}/${setId}/${id.slice(setId.length + 1)}`,
  };
});
const fr = cards.filter((c) => c.lang === "fr");
console.log(`index : ${cards.length} cartes, ${fr.length} fr — ${N} scènes`);

let seed = 11;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const rnd = (a, b) => a + rand() * (b - a);
const pick = [...fr].sort(() => rand() - 0.5).slice(0, N);

async function cardImage(c) {
  const f = `${OUT}/cards/${c.lang}_${c.id.replace(/[^a-z0-9.-]/gi, "_")}.webp`;
  if (existsSync(f)) return readFileSync(f);
  const b = Buffer.from(await (await fetch(`${c.image}/low.webp`)).arrayBuffer());
  writeFileSync(f, b);
  return b;
}
const toMat = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  m.data.set(data);
  return m;
};
const matToJpeg = (m, q = 72) =>
  sharp(Buffer.from(m.data), { raw: { width: m.cols, height: m.rows, channels: 4 } }).jpeg({ quality: q }).toBuffer();

const SW = 640;
const SH = 853;
/**
 * Scène : clavier + bureau, carte en perspective, main sur le coin bas-gauche,
 * reflet. Une scène sur deux ajoute derrière la carte un grand cadre ou un
 * écran (rectangle clair bordé, légèrement flou) plus grand que la carte.
 */
async function scene(cardBuf) {
  const bg = new cv.Mat(SH, SW, cv.CV_8UC4, new cv.Scalar(40, 40, 44, 255));
  cv.rectangle(bg, new cv.Point(0, Math.round(SH * 0.55)), new cv.Point(SW, SH), new cv.Scalar(70, 55, 45, 255), -1);
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 11; k++) {
      const x = 10 + k * 56 + (r % 2) * 20;
      const y = 20 + r * 80;
      cv.rectangle(bg, new cv.Point(x, y), new cv.Point(x + 46, y + 60), new cv.Scalar(90, 92, 100, 255), -1);
      cv.putText(bg, String.fromCharCode(65 + ((r * 11 + k) % 26)), new cv.Point(x + 14, y + 38), cv.FONT_HERSHEY_SIMPLEX, 0.7, new cv.Scalar(200, 210, 230, 255), 2);
    }
  }
  const behind = !NO_FRAME && rand() < 0.5;
  if (behind) {
    const fw = SW * rnd(0.7, 0.92);
    const fh = fw / (rand() < 0.5 ? 0.5625 : 0.75);
    const fx = Math.round(rnd(0, SW - fw));
    const fy = Math.round(rnd(0, Math.max(1, SH - fh)));
    cv.rectangle(bg, new cv.Point(fx, fy), new cv.Point(Math.round(fx + fw), Math.round(fy + fh)), new cv.Scalar(30, 28, 26, 255), -1);
    cv.rectangle(bg, new cv.Point(fx + 8, fy + 8), new cv.Point(Math.round(fx + fw - 8), Math.round(fy + fh - 8)), new cv.Scalar(228, 222, 210, 255), -1);
    cv.putText(bg, "POKEMON", new cv.Point(fx + 40, Math.round(fy + fh / 2)), cv.FONT_HERSHEY_SIMPLEX, 1.4, new cv.Scalar(120, 110, 100, 255), 3);
    cv.GaussianBlur(bg, bg, new cv.Size(7, 7), 0);
  }
  const cardW = SW * (behind ? rnd(0.35, 0.55) : rnd(0.45, 0.65));
  const cardH = cardW / (63 / 88);
  const cx = SW / 2 + rnd(-40, 40);
  const cy = SH * 0.62 + rnd(-40, 40);
  const rot = (rnd(-10, 10) * Math.PI) / 180;
  const tilt = rnd(-0.08, 0.08);
  const tilt2 = rnd(-0.06, 0.06);
  const base = [
    [-cardW / 2, -cardH / 2],
    [cardW / 2, -cardH / 2],
    [cardW / 2, cardH / 2],
    [-cardW / 2, cardH / 2],
  ];
  const quad = base.map(([x, y]) => {
    const xx = x * (1 + tilt * (y / cardH));
    const yy = y * (1 + tilt2 * (x / cardW));
    return [cx + xx * Math.cos(rot) - yy * Math.sin(rot), cy + xx * Math.sin(rot) + yy * Math.cos(rot)];
  });
  const card = await toMat(await sharp(cardBuf).resize(Math.round(cardW), Math.round(cardH)).toBuffer());
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, card.cols, 0, card.cols, card.rows, 0, card.rows]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const M = cv.getPerspectiveTransform(from, to);
  const warped = new cv.Mat();
  cv.warpPerspective(card, warped, M, new cv.Size(SW, SH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
  const chans = new cv.MatVector();
  cv.split(warped, chans);
  const mask = chans.get(3);
  warped.copyTo(bg, mask);
  const hand = quad[3];
  cv.ellipse(bg, new cv.Point(hand[0] - 30, hand[1] + 40), new cv.Size(150, 110), rnd(-30, 30), 0, 360, new cv.Scalar(214, 170, 140, 255), -1);
  const glare = bg.clone();
  cv.rectangle(glare, new cv.Point(Math.round(rnd(150, 400)), 0), new cv.Point(Math.round(rnd(450, 640)), SH), new cv.Scalar(255, 255, 255, 255), -1);
  cv.addWeighted(bg, 0.75, glare, 0.25, 0, bg);
  for (const m of [card, from, to, M, warped, chans, mask, glare]) m.delete();
  return { bg, quad, behind };
}

// Même formule que src/lib/scan/index.ts (présélection grossière, puis dense)
const W_ART = 0.6;
const SHORT = 300;
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
  const coarse = cards.map((c, i) => ({ i, s: bestOf(q.coarse, c) })).sort((a, b) => a.s - b.s).slice(0, SHORT);
  const ranked = coarse.map(({ i, s }) => ({ i, s: Math.min(s, bestOf(q.dense, cards[i])) })).sort((a, b) => a.s - b.s);
  const seen = new Set();
  const out = [];
  for (const r of ranked) {
    const id = cards[r.i].id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, s: r.s });
    if (out.length >= 3) break;
  }
  return out;
}

const poly = (img, q, col) => {
  for (let k = 0; k < 4; k++) {
    const a = q[k];
    const b = q[(k + 1) % 4];
    cv.line(img, new cv.Point(Math.round(a[0]), Math.round(a[1])), new cv.Point(Math.round(b[0]), Math.round(b[1])), col, 3);
  }
};

let n = 0;
let detected = 0;
let precise = 0;
let preciseTop2 = 0;
let nBehind = 0;
let preciseBehind = 0;
let preciseFree = 0;
let recognized = 0;
let tDet = 0;
for (const c of pick) {
  let buf;
  try {
    buf = await cardImage(c);
  } catch {
    continue;
  }
  const { bg, quad, behind } = await scene(buf);
  const jpeg = await matToJpeg(bg, 72);
  const src = await toMat(jpeg);
  const t0 = Date.now();
  const quads = detectCardQuads(cv, src, 3);
  const found = quads[0];
  tDet += Date.now() - t0;
  n++;
  if (behind) nBehind++;
  const diag = Math.hypot(quad[2][0] - quad[0][0], quad[2][1] - quad[0][1]);
  const errOf = (q) => {
    let err = Infinity;
    for (let r = 0; r < 4; r++) {
      let e = 0;
      for (let k = 0; k < 4; k++) e += Math.hypot(q.corners[(k + r) % 4][0] - quad[k][0], q.corners[(k + r) % 4][1] - quad[k][1]);
      err = Math.min(err, e / 4);
    }
    return err / diag;
  };
  if (quads.some((q) => errOf(q) < 0.03)) preciseTop2++;
  if (found) {
    detected++;
    const err = errOf(found) * diag;
    const ok = err / diag < 0.03;
    if (ok) precise++;
    if (ok && behind) preciseBehind++;
    if (ok && !behind) preciseFree++;
    const rect = warpCard(cv, src, found.corners);
    const rj = await matToJpeg(rect, 72);
    rect.delete();
    const top = match(await hashCardVariants(rj));
    const hit = top[0]?.id === c.id;
    if (hit) recognized++;
    if (DUMP) {
      const dbg = src.clone();
      poly(dbg, quad, new cv.Scalar(255, 0, 0, 255));
      poly(dbg, found.corners, new cv.Scalar(0, 255, 0, 255));
      writeFileSync(`${OUT}/scene_${n}.jpg`, await matToJpeg(dbg, 80));
      writeFileSync(`${OUT}/rect_${n}.jpg`, rj);
      dbg.delete();
    }
    if (!ok || !hit) {
      const insideQ = (q, [x, y]) => { let sg = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); const sn = Math.sign(cr); if (!sn) continue; if (!sg) sg = sn; else if (sn !== sg) return false; } return true; };
      const inFirst = quad.filter((p) => insideQ(found.corners, p)).length;
      const cand = quads
        .map((q) => `[${(100 * errOf(q)).toFixed(0)} % aire ${(100 * q.area / (SW * SH)).toFixed(0)} % r ${q.ratio.toFixed(2)} s ${q.support.toFixed(2)} b ${q.rim.toFixed(2)}${q.contains ? " ⊃" : ""} → ${q.score.toFixed(3)}]`)
        .join(" ");
      console.log(
        `  ${c.id.padEnd(12)}${behind ? " [cadre]" : ""} coins ${((err / diag) * 100).toFixed(1)} % | vrais coins dans cand1 : ${inFirst}/4 | cand ${cand} | top ${top.slice(0, 2).map((t) => `${t.id} ${t.s.toFixed(3)}`).join(", ")}`,
      );
    }
  } else {
    console.log(`  ${c.id.padEnd(12)} NON DÉTECTÉE`);
    if (DUMP) writeFileSync(`${OUT}/scene_${n}.jpg`, jpeg);
  }
  bg.delete();
  src.delete();
}
const pct = (v) => `${((100 * v) / n).toFixed(0)} %`;
console.log(
  `\nscènes ${n} | détectée ${detected} (${pct(detected)}) | coins précis (< 3 % diag) ${precise} (${pct(precise)}), dans le top 3 ${preciseTop2} (${pct(preciseTop2)}) | précis : sans cadre ${preciseFree}/${n - nBehind}, avec cadre derrière ${preciseBehind}/${nBehind} | reconnue ${recognized} (${pct(recognized)}) | détection ${(tDet / n).toFixed(0)} ms`,
);
