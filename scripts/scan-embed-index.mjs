// Index d'embeddings neuraux du scan → Supabase Storage (bucket scan-assets).
// Encode chaque carte du catalogue (src/data/scan-index.json, mêmes images que
// le pHash) avec MobileCLIP-S0 (ONNX) en un vecteur 512-d, quantifié int8.
// Le client (src/lib/scan/embed-match.ts) charge embed.bin + embed.json et
// reconnaît la carte par cosinus, en local.
//
// INCRÉMENTAL : réutilise l'index précédent (octets int8 inchangés) et
// n'encode que les cartes nouvelles, plafonné par exécution (--max) pour tenir
// dans le temps du job nocturne. Sur plusieurs nuits, l'index rattrape tout.
//
//   node scripts/scan-embed-index.mjs [--max=12000] [--langs=fr,en,ja,de,es,it]
import { readFileSync } from "node:fs";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "./lib/env.mjs";

const DIM = 512;
const EDGE = 256;
const BUCKET = "scan-assets";
const DL = 24;
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const MAX_NEW = Number(arg("max", "12000"));
const LANGS = new Set(arg("langs", "fr,en,ja,de,es,it").split(","));

const admin = supabaseAdminEnv();
if (!admin) {
  console.error("Variables Supabase absentes.");
  process.exit(1);
}
const supabase = createClient(admin.url, admin.key, { auth: { persistSession: false } });
const BASE = `${admin.url}/storage/v1/object/public/${BUCKET}`;

// --- modèle (depuis Storage : exactement le fichier que le client exécute) ---
const modelBuf = new Uint8Array(await (await fetch(`${BASE}/mobileclip-s0.onnx`)).arrayBuffer());
const session = await ort.InferenceSession.create(modelBuf, { intraOpNumThreads: 4, graphOptimizationLevel: "all" });

async function embed(buf) {
  const { data } = await sharp(buf, { failOn: "none" })
    .removeAlpha().resize(EDGE, EDGE, { fit: "fill", kernel: "cubic" }).raw().toBuffer({ resolveWithObject: true });
  const n = EDGE * EDGE;
  const chw = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { chw[i] = data[i * 3] / 255; chw[n + i] = data[i * 3 + 1] / 255; chw[2 * n + i] = data[i * 3 + 2] / 255; }
  const out = await session.run({ pixel_values: new ort.Tensor("float32", chw, [1, 3, EDGE, EDGE]) });
  const v = out.image_embeds.data;
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = 1 / (Math.sqrt(s) + 1e-9);
  const o = new Float32Array(DIM); for (let i = 0; i < DIM; i++) o[i] = v[i] * s;
  return o;
}
function quant(v) {
  let mx = 0; for (let i = 0; i < DIM; i++) { const a = Math.abs(v[i]); if (a > mx) mx = a; }
  const scale = (mx || 1) / 127;
  const i8 = new Int8Array(DIM); for (let i = 0; i < DIM; i++) i8[i] = Math.max(-127, Math.min(127, Math.round(v[i] / scale)));
  return { i8, scale };
}

// --- catalogue + URLs (override c[5] sinon URL tcgdex dérivée + /low.webp) ---
const IDX = JSON.parse(readFileSync("src/data/scan-index.json", "utf8"));
const sets = IDX.sets;
const urlFor = (c) => {
  if (c[5]) return c[5];
  const serie = sets[`${c[1]}/${c[3]}`]?.[1];
  return serie ? `https://assets.tcgdex.net/${c[1]}/${serie}/${c[3]}/${c[0].slice(c[3].length + 1)}/low.webp` : null;
};
const metaFor = (c) => {
  const setName = sets[`${c[1]}/${c[3]}`]?.[0] || c[3];
  const localId = c[0].includes("-") ? c[0].slice(c[0].lastIndexOf("-") + 1) : c[0];
  return [c[0], c[1], c[2], c[3], setName, localId, urlFor(c) || ""];
};
const targets = IDX.cards.filter((c) => LANGS.has(c[1]) && urlFor(c));
console.log(`catalogue ciblé (${[...LANGS].join(",")}): ${targets.length} cartes`);

// --- index précédent (cache int8 par clé lang:id) ---
async function loadPrev() {
  const cache = new Map();
  try {
    const [binR, jsonR] = await Promise.all([fetch(`${BASE}/embed.bin`), fetch(`${BASE}/embed.json`)]);
    if (!binR.ok || !jsonR.ok) return cache;
    const bin = Buffer.from(await binR.arrayBuffer());
    const meta = await jsonR.json();
    const count = bin.readUInt32LE(8), dim = bin.readUInt32LE(12), per = dim + 4;
    for (let c = 0; c < count; c++) {
      const off = 16 + c * per;
      const i8 = new Int8Array(bin.buffer, bin.byteOffset + off, dim).slice();
      const scale = bin.readFloatLE(off + dim);
      const m = meta.cards[c];
      cache.set(`${m[1]}:${m[0]}`, { i8, scale });
    }
    console.log(`index précédent : ${cache.size} cartes réutilisées`);
  } catch { /* premier passage */ }
  return cache;
}
const cache = await loadPrev();

async function getImg(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 429 || r.status >= 500) await new Promise((s) => setTimeout(s, 800 * (a + 1)));
      else return null;
    } catch { await new Promise((s) => setTimeout(s, 600 * (a + 1))); }
  }
  return null;
}

// --- encode les cartes nouvelles (plafonné), en pool ---
const todo = targets.filter((c) => !cache.has(`${c[1]}:${c[0]}`)).slice(0, MAX_NEW);
console.log(`à encoder cette exécution : ${todo.length} (plafond ${MAX_NEW})`);
let i = 0, active = 0, ok = 0, fail = 0;
const t0 = Date.now();
await new Promise((resolve) => {
  const next = () => {
    if (i >= todo.length && active === 0) return resolve();
    while (active < DL && i < todo.length) {
      const c = todo[i++]; active++;
      (async () => {
        const buf = await getImg(urlFor(c));
        if (buf) { try { cache.set(`${c[1]}:${c[0]}`, quant(await embed(buf))); ok++; } catch { fail++; } }
        else fail++;
        active--;
        if ((ok + fail) % 500 === 0) console.log(`  ${ok} ok / ${fail} échecs (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        next();
      })();
    }
  };
  next();
});

// --- assemble l'index (toutes les cartes déjà encodées, ordre du catalogue) ---
const rows = [], vecs = [];
for (const c of targets) {
  const e = cache.get(`${c[1]}:${c[0]}`);
  if (!e) continue;
  vecs.push(e);
  rows.push(metaFor(c));
}
const count = rows.length, per = DIM + 4;
const blob = Buffer.alloc(16 + count * per);
blob.write("GPXE", 0, "ascii");
blob.writeUInt32LE(3, 4); blob.writeUInt32LE(count, 8); blob.writeUInt32LE(DIM, 12);
for (let c = 0; c < count; c++) {
  const off = 16 + c * per;
  Buffer.from(vecs[c].i8.buffer, vecs[c].i8.byteOffset, DIM).copy(blob, off);
  blob.writeFloatLE(vecs[c].scale, off + DIM);
}
const json = Buffer.from(JSON.stringify({ version: 3, dim: DIM, cards: rows }));
console.log(`index assemblé : ${count} cartes | embed.bin ${(blob.length / 1e6).toFixed(1)} Mo`);

// --- téléverse sur Storage ---
for (const [path, body, type] of [["embed.bin", blob, "application/octet-stream"], ["embed.json", json, "application/json"]]) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: true });
  if (error) { console.error(`upload ${path}:`, error.message); process.exit(1); }
}
console.log(`téléversé : ${ok} nouvelles, ${fail} échecs, ${count} au total. Reste ${targets.length - count} à faire.`);
