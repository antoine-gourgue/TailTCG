// Worker d'identification visuelle DOUBLE ESPACE (port du cardIdentifier de
// GoupixDex), hors du fil principal :
//  - MobileCLIP-S0 512-d : robuste à la lumière et aux foils, mais regroupe
//    les cartes JA par style de cadre ;
//  - MobileNetV2 ImageNet → PCA-128 : fidèle à l'artwork exact, mais fragile
//    photométriquement — consulté SEULEMENT quand S0 voit un cluster JA fort
//    sans marge.
// Chaque espace applique sa politique (plancher + marge face au premier print
// différent). Index int8 (format GPXE) chargés depuis le stockage, en cache.
import * as ort from "onnxruntime-web/wasm";
import { cachedArrayBuffer, cachedJson } from "./asset-cache";
import type { ScanCardLanguage, ScanIdentifyResult, ScanMatchDecision } from "./scan-match";

export type IdentifyIn =
  | {
      type: "init";
      wasmPath: string;
      s0ModelUrl: string;
      s0BinUrl: string;
      s0JsonUrl: string;
      mnetModelUrl: string;
      mnetBinUrl: string;
      mnetPcaUrl: string;
      mnetJsonUrl: string;
    }
  | { type: "identify"; seq: number; bufs: ArrayBuffer[]; language: ScanCardLanguage };
export type IdentifyOut =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; seq: number; result: ScanIdentifyResult };

const ctx = self as unknown as {
  postMessage: (m: IdentifyOut, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<IdentifyIn>) => void) | null;
};

const S0_DIM = 512;
const S0_EDGE = 256;
const MNET_RAW_DIM = 1280;
const MNET_EDGE = 224;
// Politiques calibrées (rejeu vidéo + captures terrain, GoupixDex)
const S0_MIN_SIM = 0.65;
const S0_MIN_MARGIN = 0.04;
const MNET_MIN_SIM = 0.6;
const MNET_MIN_MARGIN = 0.055;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

const NONE: ScanIdentifyResult = {
  decision: null,
  topCandidate: null,
  topCandidateSim: 0,
  topCardId: null,
  topSim: 0,
  topMargin: 0,
  bestCropIndex: 0,
};

type Card = { tcgdexCardId: string; locale: string; name: string; setId: string; localId: string };
type Index = { cards: Card[]; vectors: Int8Array; scales: Float32Array; dim: number; localeRows: Set<string> };
type Meta = { cards: [string, string, string, string, string][] };
type Hit = { i: number; sim: number };

let engine: {
  s0: ort.InferenceSession;
  mnet: ort.InferenceSession;
  s0Index: Index;
  mnetIndex: Index;
  pcaMean: Float32Array;
  pcaComponents: Float32Array;
} | null = null;

/** Décode un index GPXE → cartes, vecteurs int8, échelles */
function parseIndex(bin: ArrayBuffer, meta: Meta): Index {
  const view = new DataView(bin);
  const magicOk = view.getUint8(0) === 0x47 && view.getUint8(1) === 0x50 && view.getUint8(2) === 0x58 && view.getUint8(3) === 0x45;
  const count = view.getUint32(8, true);
  const dim = view.getUint32(12, true);
  if (!magicOk || count !== meta.cards.length) throw new Error("index d'embeddings invalide");
  const stride = dim + 4;
  const vectors = new Int8Array(count * dim);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    vectors.set(new Int8Array(bin, 16 + i * stride, dim), i * dim);
    scales[i] = view.getFloat32(16 + i * stride + dim, true);
  }
  const cards: Card[] = meta.cards.map(([tcgdexCardId, locale, name, setId, localId]) => ({ tcgdexCardId, locale, name, setId, localId }));
  const localeRows = new Set(cards.map((c) => `${c.tcgdexCardId}|${c.locale}`));
  return { cards, vectors, scales, dim, localeRows };
}

async function init(d: Extract<IdentifyIn, { type: "init" }>) {
  ort.env.wasm.wasmPaths = d.wasmPath;
  ort.env.wasm.numThreads = 1;
  const [s0Model, s0Bin, s0Json, mnetModel, mnetBin, mnetPca, mnetJson] = await Promise.all([
    cachedArrayBuffer(d.s0ModelUrl),
    cachedArrayBuffer(d.s0BinUrl),
    cachedJson<Meta>(d.s0JsonUrl),
    cachedArrayBuffer(d.mnetModelUrl),
    cachedArrayBuffer(d.mnetBinUrl),
    cachedArrayBuffer(d.mnetPcaUrl),
    cachedJson<Meta>(d.mnetJsonUrl),
  ]);
  const s0Index = parseIndex(s0Bin, s0Json);
  const mnetIndex = parseIndex(mnetBin, mnetJson);
  const pcaMean = new Float32Array(mnetPca, 0, MNET_RAW_DIM);
  const pcaComponents = new Float32Array(mnetPca, MNET_RAW_DIM * 4, MNET_RAW_DIM * mnetIndex.dim);
  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
  const s0 = await ort.InferenceSession.create(s0Model, opts);
  const mnet = await ort.InferenceSession.create(mnetModel, opts);
  engine = { s0, mnet, s0Index, mnetIndex, pcaMean, pcaComponents };
}

/** RGBA 256×256 → 224×224 (bilinéaire) pour MobileNet */
function downscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(MNET_EDGE * MNET_EDGE * 4);
  const ratio = S0_EDGE / MNET_EDGE;
  for (let y = 0; y < MNET_EDGE; y++) {
    const sy = Math.min(S0_EDGE - 1.001, y * ratio);
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < MNET_EDGE; x++) {
      const sx = Math.min(S0_EDGE - 1.001, x * ratio);
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = (y0 * S0_EDGE + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + S0_EDGE * 4;
      const p11 = p01 + 4;
      const o = (y * MNET_EDGE + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = rgba[p00 + c] * (1 - fx) + rgba[p10 + c] * fx;
        const bot = rgba[p01 + c] * (1 - fx) + rgba[p11 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

const firstOutput = (out: ort.InferenceSession.ReturnType) => (Object.values(out)[0] as ort.Tensor).data as Float32Array;

/** Embedding S0 : pixels bruts [0,1], 512-d normalisé */
async function embedS0(rgba: Uint8ClampedArray): Promise<Float32Array> {
  const e = engine!;
  const plane = S0_EDGE * S0_EDGE;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = rgba[p] / 255;
    input[plane + i] = rgba[p + 1] / 255;
    input[2 * plane + i] = rgba[p + 2] / 255;
  }
  const emb = firstOutput(await e.s0.run({ pixel_values: new ort.Tensor("float32", input, [1, 3, S0_EDGE, S0_EDGE]) }));
  let norm = 0;
  for (let i = 0; i < S0_DIM; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm) || 1;
  const q = new Float32Array(S0_DIM);
  for (let i = 0; i < S0_DIM; i++) q[i] = emb[i] / norm;
  return q;
}

/** Embedding MobileNet : normalisation ImageNet, 1280-d → PCA-128 renormalisée */
async function embedMnet(rgba224: Uint8ClampedArray): Promise<Float32Array> {
  const e = engine!;
  const plane = MNET_EDGE * MNET_EDGE;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = (rgba224[p] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    input[plane + i] = (rgba224[p + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    input[2 * plane + i] = (rgba224[p + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  const emb = firstOutput(await e.mnet.run({ input: new ort.Tensor("float32", input, [1, 3, MNET_EDGE, MNET_EDGE]) }));
  let norm = 0;
  for (let i = 0; i < MNET_RAW_DIM; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm) || 1;
  const dim = e.mnetIndex.dim;
  const reduced = new Float32Array(dim);
  for (let i = 0; i < MNET_RAW_DIM; i++) {
    const centered = emb[i] / norm - e.pcaMean[i];
    if (centered === 0) continue;
    const base = i * dim;
    for (let j = 0; j < dim; j++) reduced[j] += centered * e.pcaComponents[base + j];
  }
  let rnorm = 0;
  for (let j = 0; j < dim; j++) rnorm += reduced[j] * reduced[j];
  rnorm = Math.sqrt(rnorm) || 1;
  for (let j = 0; j < dim; j++) reduced[j] /= rnorm;
  return reduced;
}

/** Top-8 d'une requête dans un index int8 */
function searchTop8(index: Index, q: Float32Array): Hit[] {
  const top: Hit[] = [];
  const { dim, vectors, scales } = index;
  const count = index.cards.length;
  for (let i = 0; i < count; i++) {
    const base = i * dim;
    let dot = 0;
    for (let j = 0; j < dim; j++) dot += q[j] * vectors[base + j];
    const sim = dot * scales[i];
    if (top.length < 8 || sim > top[top.length - 1].sim) {
      top.push({ i, sim });
      top.sort((a, b) => b.sim - a.sim);
      if (top.length > 8) top.pop();
    }
  }
  return top;
}

type Verdict = {
  decision: ScanMatchDecision | null;
  candidate: ScanMatchDecision | null;
  candidateSim: number;
  topCardId: string | null;
  topSim: number;
  topMargin: number;
};

/**
 * Politique d'un espace : plancher + marge face au premier print DIFFÉRENT
 * (les locales d'un même print partagent le tcgdexCardId), locale résolue
 * selon la langue de session.
 */
function decideFromTop(index: Index, top: Hit[], minSim: number, minMargin: number, lang: ScanCardLanguage): Verdict {
  const best = top[0];
  if (!best) return { decision: null, candidate: null, candidateSim: 0, topCardId: null, topSim: 0, topMargin: 0 };
  const bestCard = index.cards[best.i];
  const next = top.find((t) => index.cards[t.i].tcgdexCardId !== bestCard.tcgdexCardId);
  const margin = best.sim - (next ? next.sim : 0);
  let chosen = bestCard;
  if (lang !== "auto") {
    const localeMatch = top
      .filter((t) => index.cards[t.i].tcgdexCardId === bestCard.tcgdexCardId)
      .map((t) => index.cards[t.i])
      .find((c) => c.locale === lang);
    if (localeMatch) chosen = localeMatch;
  }
  // En session fr/en, un print qui n'existe pas dans cette locale ne peut pas être la carte (JA-only)
  const localeOk = lang === "auto" || lang === "ja" || index.localeRows.has(`${bestCard.tcgdexCardId}|${lang}`);
  const confident = localeOk && best.sim >= minSim && !(next && margin < minMargin);
  const candidate: ScanMatchDecision | null = localeOk
    ? { tcgdexCardId: chosen.tcgdexCardId, language: lang === "auto" ? chosen.locale : lang, name: chosen.name, setId: chosen.setId, localId: chosen.localId }
    : null;
  return { decision: confident ? candidate : null, candidate, candidateSim: best.sim, topCardId: bestCard.tcgdexCardId, topSim: best.sim, topMargin: margin };
}

/** Une tentative : chaque crop dans S0 (le mieux cadré gagne) ; MobileNet seulement pour un cluster JA indécidable */
async function identify(bufs: ArrayBuffer[], lang: ScanCardLanguage): Promise<ScanIdentifyResult> {
  const e = engine;
  if (!e || bufs.length === 0) return NONE;
  let bestS0: Hit[] = [];
  let bestCropIndex = 0;
  const rgbas: Uint8ClampedArray[] = [];
  for (let k = 0; k < bufs.length; k++) {
    const rgba = new Uint8ClampedArray(bufs[k]);
    if (rgba.length !== S0_EDGE * S0_EDGE * 4) continue;
    rgbas.push(rgba);
    const top = searchTop8(e.s0Index, await embedS0(rgba));
    if (top.length && (bestS0.length === 0 || top[0].sim > bestS0[0].sim)) {
      bestS0 = top;
      bestCropIndex = k;
    }
  }
  const s0 = decideFromTop(e.s0Index, bestS0, S0_MIN_SIM, S0_MIN_MARGIN, lang);
  const s0TopCard = bestS0[0] ? e.s0Index.cards[bestS0[0].i] : null;
  const jaClusterBlocked = s0TopCard !== null && s0TopCard.locale === "ja" && s0.topSim >= S0_MIN_SIM;
  let decision = s0.decision;
  let candidate = s0.candidate;
  let candidateSim = s0.candidateSim;
  if (!s0.decision && jaClusterBlocked) {
    let bestMnet: Hit[] = [];
    for (const rgba of rgbas) {
      const top = searchTop8(e.mnetIndex, await embedMnet(downscale(rgba)));
      if (top.length && (bestMnet.length === 0 || top[0].sim > bestMnet[0].sim)) bestMnet = top;
    }
    const mnet = decideFromTop(e.mnetIndex, bestMnet, MNET_MIN_SIM, MNET_MIN_MARGIN, lang);
    decision = mnet.decision;
    if (mnet.candidate) {
      candidate = mnet.candidate;
      candidateSim = mnet.candidateSim;
    }
  }
  return { decision, topCandidate: candidate, topCandidateSim: candidateSim, topCardId: s0.topCardId, topSim: s0.topSim, topMargin: s0.topMargin, bestCropIndex };
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
  if (m.type === "identify") {
    let result = NONE;
    try {
      result = await identify(m.bufs, m.language);
    } catch {
      result = NONE;
    }
    ctx.postMessage({ type: "result", seq: m.seq, result });
  }
};
