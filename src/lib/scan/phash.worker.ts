// Worker d'identification par EMPREINTE PERCEPTUELLE (pHash), port du
// cardPhash de GoupixDex : là où l'embedding encode le style de la carte, la
// pHash encode l'ILLUSTRATION — la bonne carte tombe très bas (~0,05-0,2), les
// imposteurs restent ≥ 0,3. Index GPXH (empreintes DCT « carte entière » +
// « illustration », 94k cartes 6 langues). Instantané (distance de Hamming),
// refuse au lieu de deviner. La carte redressée est ré-échantillonnée sous
// une batterie de transformations (zoom/décalage/rotation), le meilleur
// alignement gagne pour chaque candidate.
import { cachedArrayBuffer, cachedJson } from "./asset-cache";
import type { ScanCardLanguage, ScanMatchDecision, ScanPhashResult } from "./scan-match";

export type PhashIn =
  | { type: "init"; binUrl: string; jsonUrl: string }
  | { type: "match"; seq: number; buf: ArrayBuffer; w: number; h: number; language: ScanCardLanguage };
export type PhashOut = { type: "ready" } | { type: "error"; message: string } | { type: "result"; seq: number; result: ScanPhashResult };

const ctx = self as unknown as {
  postMessage: (m: PhashOut, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<PhashIn>) => void) | null;
};

const GW = 96;
const GH = 132;
const N = 32;
const K = 16;
const SS = 3;
const WHOLE = { left: 0, top: 0, width: 1, height: 1 };
const ART = { left: 0.07, top: 0.11, width: 0.86, height: 0.4 };
const WORDS = 8; // 256 bits / 32
/** Poids de l'illustration (discrimine mieux que le cadre, partagé dans un set) */
const W_ART = 0.6;
/** Candidats retenus par la 1re passe (grossière) pour l'alignement fin */
const SHORTLIST = 250;
/** Score au-delà duquel rien n'est proposé (REFUS) */
const T_MATCH = 0.28;
/** Une carte d'un AUTRE artwork plus proche que ça du meilleur = ambigu, donc refus */
const T_MARGIN = 0.055;
/** Cartes à moins de ça du meilleur score = même artwork (réimpressions), regroupées */
const REPRINT_EPS = 0.04;

type T = { z: number; dx: number; dy: number; rot: number };
type Win = { left: number; top: number; width: number; height: number };

const COS = (() => {
  const t = new Float64Array(K * N);
  for (let u = 0; u < K; u++) for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  return t;
})();
const POP = (() => {
  const t = new Uint8Array(256);
  for (let i = 1; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return t;
})();
const COARSE: T[] = [
  { z: 1, dx: 0, dy: 0, rot: 0 },
  { z: 0.94, dx: 0, dy: 0, rot: 0 },
  { z: 1.06, dx: 0, dy: 0, rot: 0 },
  { z: 0.94, dx: 0.03, dy: 0, rot: 0 },
  { z: 0.94, dx: -0.03, dy: 0, rot: 0 },
  { z: 0.94, dx: 0, dy: 0.03, rot: 0 },
  { z: 0.94, dx: 0, dy: -0.03, rot: 0 },
  { z: 0.94, dx: 0, dy: 0, rot: 3 },
  { z: 0.94, dx: 0, dy: 0, rot: -3 },
];
const DENSE: T[] = (() => {
  const out: T[] = [];
  for (const z of [1.1, 1.04, 0.98, 0.92, 0.86]) for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.03, 0, 0.03]) for (const rot of [-3, 0, 3]) out.push({ z, dx, dy, rot });
  return out;
})();

type Card = { tcgdexCardId: string; locale: string; name: string; setId: string; localId: string };
let engine: { wholes: Uint32Array; arts: Uint32Array; cards: Card[]; count: number; byLocale: Record<string, number[]> } | null = null;

/** Empreinte DCT d'une image N×N grise : bloc K×K basse fréquence vs médiane */
function phashGray(g: Float32Array): Uint8Array {
  const tmp = new Float64Array(K * N);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u * N + x];
      tmp[u * N + y] = s;
    }
  }
  const F = new Float64Array(K * K);
  for (let u = 0; u < K; u++) {
    for (let v = 0; v < K; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += tmp[u * N + y] * COS[v * N + y];
      F[u * K + v] = s;
    }
  }
  const sorted = Array.from(F.subarray(1)).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const bits = new Uint8Array((K * K) / 8);
  for (let i = 1; i < K * K; i++) if (F[i] > median) bits[i >> 3] |= 1 << (i & 7);
  return bits;
}

/** RGBA (cw×ch) → luma GW×GH (bilinéaire) */
function cardGray(rgba: Uint8ClampedArray, cw: number, ch: number): Float32Array {
  const g = new Float32Array(GW * GH);
  const rx = cw / GW;
  const ry = ch / GH;
  const lum = (p: number) => rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
  for (let j = 0; j < GH; j++) {
    const sy = Math.min(ch - 1.001, (j + 0.5) * ry);
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let i = 0; i < GW; i++) {
      const sx = Math.min(cw - 1.001, (i + 0.5) * rx);
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = (y0 * cw + x0) * 4;
      g[j * GW + i] = (lum(p00) * (1 - fx) + lum(p00 + 4) * fx) * (1 - fy) + (lum(p00 + cw * 4) * (1 - fx) + lum(p00 + cw * 4 + 4) * fx) * fy;
    }
  }
  return g;
}

/** Lecture bilinéaire de l'image grise, bords répétés */
function sample(g: Float32Array, x: number, y: number): number {
  if (x < 0) x = 0;
  else if (x > GW - 1.001) x = GW - 1.001;
  if (y < 0) y = 0;
  else if (y > GH - 1.001) y = GH - 1.001;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * GW + x0;
  return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + GW] * (1 - fx) + g[i + GW + 1] * fx) * fy;
}

/** Fenêtre de la carte échantillonnée en N×N sous une transformation affine */
function grid(g: Float32Array, win: Win, t: T): Float32Array {
  const out = new Float32Array(N * N);
  const rad = (t.rot * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const cx = GW / 2 + t.dx * GW;
  const cy = GH / 2 + t.dy * GH;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let b = 0; b < SS; b++) {
        for (let a = 0; a < SS; a++) {
          const u = win.left + (win.width * (i + (a + 0.5) / SS)) / N;
          const v = win.top + (win.height * (j + (b + 0.5) / SS)) / N;
          const x = (u - 0.5) * t.z * GW;
          const y = (v - 0.5) * t.z * GH;
          acc += sample(g, cx + x * c - y * s, cy + x * s + y * c);
        }
      }
      out[j * N + i] = acc / (SS * SS);
    }
  }
  return out;
}

type Variant = { whole: Uint32Array; art: Uint32Array };
function variantWords(g: Float32Array, t: T): Variant {
  const w = phashGray(grid(g, WHOLE, t));
  const a = phashGray(grid(g, ART, t));
  return { whole: new Uint32Array(w.buffer, 0, WORDS), art: new Uint32Array(a.buffer, 0, WORDS) };
}

/** Distance (0..1) d'une variante à la carte d'index i */
function distTo(v: Variant, i: number): number {
  const e = engine!;
  const o = i * WORDS;
  let dw = 0;
  let da = 0;
  for (let w = 0; w < WORDS; w++) {
    const xw = v.whole[w] ^ e.wholes[o + w];
    const xa = v.art[w] ^ e.arts[o + w];
    dw += POP[xw & 255] + POP[(xw >>> 8) & 255] + POP[(xw >>> 16) & 255] + POP[(xw >>> 24) & 255];
    da += POP[xa & 255] + POP[(xa >>> 8) & 255] + POP[(xa >>> 16) & 255] + POP[(xa >>> 24) & 255];
  }
  return ((1 - W_ART) * dw + W_ART * da) / 256;
}

async function init(d: Extract<PhashIn, { type: "init" }>) {
  const [bin, meta] = await Promise.all([cachedArrayBuffer(d.binUrl), cachedJson<{ cards: [string, string, string, string, string][] }>(d.jsonUrl)]);
  const view = new DataView(bin);
  const magicOk = view.getUint8(0) === 0x47 && view.getUint8(1) === 0x50 && view.getUint8(2) === 0x58 && view.getUint8(3) === 0x48;
  const count = view.getUint32(8, true);
  if (!magicOk || count !== meta.cards.length) throw new Error("index pHash invalide");
  const wholes = new Uint32Array(count * WORDS);
  const arts = new Uint32Array(count * WORDS);
  for (let i = 0; i < count; i++) {
    const base = 16 + i * 64;
    for (let w = 0; w < WORDS; w++) {
      wholes[i * WORDS + w] = view.getUint32(base + w * 4, true);
      arts[i * WORDS + w] = view.getUint32(base + 32 + w * 4, true);
    }
  }
  const cards: Card[] = meta.cards.map(([tcgdexCardId, locale, name, setId, localId]) => ({ tcgdexCardId, locale, name, setId, localId }));
  const byLocale: Record<string, number[]> = {};
  for (let i = 0; i < count; i++) (byLocale[cards[i].locale] ??= []).push(i);
  engine = { wholes, arts, cards, count, byLocale };
}

/** Deux passes : variantes grossières sur tout l'index (shortlist), puis grille dense dessus */
function match(rgba: Uint8ClampedArray, cw: number, ch: number, language: ScanCardLanguage): ScanPhashResult {
  const e = engine;
  if (!e) return { status: "none", decision: null, score: 1 };
  const g = cardGray(rgba, cw, ch);
  const coarse = COARSE.map((t) => variantWords(g, t));
  const subset = language !== "auto" ? e.byLocale[language] ?? null : null;
  const count = subset ? subset.length : e.count;
  const best = new Float32Array(e.count);
  best.fill(2);
  for (let n = 0; n < count; n++) {
    const i = subset ? subset[n] : n;
    let m = 2;
    for (let k = 0; k < coarse.length; k++) {
      const dd = distTo(coarse[k], i);
      if (dd < m) m = dd;
    }
    best[i] = m;
  }
  const idx = subset ? subset.slice() : Array.from({ length: e.count }, (_, i) => i);
  idx.sort((a, b) => best[a] - best[b]);
  const shortlist = idx.slice(0, SHORTLIST);
  const dense = DENSE.map((t) => variantWords(g, t));
  const scored = shortlist.map((i) => {
    let m = best[i];
    for (let k = 0; k < dense.length; k++) {
      const dd = distTo(dense[k], i);
      if (dd < m) m = dd;
    }
    return { i, score: m };
  });
  scored.sort((a, b) => a.score - b.score);
  const top = scored[0];
  if (!top) return { status: "none", decision: null, score: 1 };
  const topCard = e.cards[top.i];
  // Rivale = 1re carte d'un AUTRE artwork ; les prints du même artwork sont regroupés
  let rivalScore = 1;
  for (let r = 1; r < scored.length; r++) {
    if (scored[r].score - top.score > REPRINT_EPS) {
      rivalScore = scored[r].score;
      break;
    }
  }
  const confident = top.score <= T_MATCH && rivalScore - top.score >= T_MARGIN;
  let chosen = topCard;
  if (language !== "auto") {
    for (const s of scored) {
      const c = e.cards[s.i];
      if (c.locale === language && c.name === topCard.name && s.score - top.score <= 0.03) {
        chosen = c;
        break;
      }
    }
  }
  const decision: ScanMatchDecision | null = confident
    ? { tcgdexCardId: chosen.tcgdexCardId, language: language !== "auto" ? language : chosen.locale, name: chosen.name, setId: chosen.setId, localId: chosen.localId }
    : null;
  return { status: confident ? "match" : "none", decision, score: top.score, rival: rivalScore, topName: topCard.name };
}

ctx.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    try {
      await init(m);
      ctx.postMessage({ type: "ready" });
    } catch (err) {
      ctx.postMessage({ type: "error", message: String(err) });
    }
    return;
  }
  if (m.type === "match") {
    let result: ScanPhashResult;
    try {
      result = match(new Uint8ClampedArray(m.buf), m.w, m.h, m.language);
    } catch {
      result = { status: "none", decision: null, score: 1 };
    }
    ctx.postMessage({ type: "result", seq: m.seq, result });
  }
};
