// Worker de DÉTECTION de carte (port du cardDetector de GoupixDex) : un réseau
// de coins (MobileNetV3 → 4 coins + présence, entraîné sur des cartes en
// perspective sur fonds réels) remplace les contours OpenCV. Chaque image
// donne les coins PRÉCIS de la carte en ~5 ms : le cadre colle à la carte en
// continu, et de chaque image nette partent les crops d'identification
// (embedding) et la carte redressée (pHash).
//
// Protocole (fil principal ⇄ worker) :
//   → { type:"init", modelUrl, wasmPath }             ← { type:"ready" } | { type:"error", message }
//   → { type:"detect", id, buf, w, h, vw, vh, crop }  ← { type:"result", id, corners, presence, idcrops, card, ms }
// `corners` : coins en pixels VIDÉO (TL, TR, BR, BL), ou null sans carte.
import * as ort from "onnxruntime-web/wasm";
import { cachedArrayBuffer } from "./asset-cache";
import type { Pt } from "./detect.mjs";

export type CornersIn =
  | { type: "init"; modelUrl: string; wasmPath: string }
  | { type: "detect"; id: number; buf: ArrayBuffer; w: number; h: number; vw: number; vh: number; crop: boolean };
export type CardOut = { buf: ArrayBuffer; w: number; h: number; guide: boolean } | null;
export type CornersOut =
  | { type: "ready" }
  | { type: "error"; message: string }
  | {
      type: "result";
      id: number;
      corners: Pt[] | null;
      presence: number;
      /** Crops d'identification RGBA 256×256 (intérieur de la carte, deux échelles), seulement sur image nette */
      idcrops: ArrayBuffer[] | null;
      /** Carte redressée RGBA (pHash), ou zone-guide centrale faute de coins */
      card: CardOut;
      ms: number;
    };

const ctx = self as unknown as {
  postMessage: (m: CornersOut, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<CornersIn>) => void) | null;
};

const NET_EDGE = 224;
const PAD = 114;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
/** Sigmoïde de présence sous laquelle l'image est sans carte (seuil bas + validation géométrique) */
const PRESENCE_MIN = 0.5;
/** Cadre légèrement resserré pour épouser la carte au ras */
const SHRINK = 0.95;
/** Crops d'identification : côté, échelles (fraction du bbox — l'embedding préfère l'intérieur de la carte) et jitter alterné */
const CROP_EDGE = 256;
const ID_CROP_SCALES = [0.6, 0.48];
const ID_CROP_JITTER = [
  { dx: 0, dy: 0 },
  { dx: -0.04, dy: 0 },
  { dx: 0.04, dy: 0 },
  { dx: 0, dy: -0.04 },
  { dx: 0, dy: 0.04 },
];
/** Netteté minimale (variance du laplacien du crop médian) pour lancer l'embedding : nettes ~300-400, floues < 150 */
const ID_SHARPNESS_MIN = 130;
/** Carte redressée pour la pHash (format 63:88) */
const PHASH_CARD_W = 180;
const PHASH_CARD_H = 252;
/** Cadence maximale des crops (la reconnaissance en aval est plus lourde) */
const ID_CROP_MIN_INTERVAL_MS = 300;
/** Repli zone-guide : sans coins depuis tant d'images (doigt, reflet), la zone centrale au format carte part à la pHash */
const FALLBACK_AFTER = 6;
const GUIDE_H_FRAC = 0.62;
const CARD_ASPECT = 63 / 88;

let session: ort.InferenceSession | null = null;
let lastCropAt = 0;
let jitterCursor = 0;
let missCount = 0;

type XY = { x: number; y: number };

/** Le quadrilatère prédit ressemble-t-il à une carte ? (convexe, aire plausible, côtés carte) */
function quadLooksLikeCard(c: Float32Array): boolean {
  const q: XY[] = [
    { x: c[0], y: c[1] },
    { x: c[2], y: c[3] },
    { x: c[4], y: c[5] },
    { x: c[6], y: c[7] },
  ];
  let area = 0;
  let signRef = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const d = q[(i + 2) % 4];
    area += a.x * b.y - b.x * a.y;
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    const sign = cross >= 0 ? 1 : -1;
    if (signRef === 0) signRef = sign;
    else if (sign !== signRef) return false;
  }
  area = Math.abs(area) / 2;
  if (area < 0.03 || area > 0.5) return false;
  const wEdge = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2;
  const hEdge = (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) / 2;
  const ratio = Math.max(wEdge, hEdge) / Math.max(1e-6, Math.min(wEdge, hEdge));
  return ratio >= 1.05 && ratio <= 2.2;
}

/** Sous-rectangle → dst×dst, bilinéaire */
function cropRgba(rgba: Uint8ClampedArray, w: number, h: number, rx: number, ry: number, rw: number, rh: number, dst: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dst * dst * 4);
  for (let y = 0; y < dst; y++) {
    const sy = Math.max(0, Math.min(h - 1.001, ry + ((y + 0.5) / dst) * rh));
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < dst; x++) {
      const sx = Math.max(0, Math.min(w - 1.001, rx + ((x + 0.5) / dst) * rw));
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = (y0 * w + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + w * 4;
      const p11 = p01 + 4;
      const o = (y * dst + x) * 4;
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

/** Redresse le quadrilatère (TL,TR,BR,BL) en rectangle dstW×dstH (interpolation bilinéaire de quad) */
function warpQuadToRect(rgba: Uint8ClampedArray, w: number, h: number, quad: XY[], dstW: number, dstH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const [tl, tr, br, bl] = quad;
  for (let y = 0; y < dstH; y++) {
    const t = (y + 0.5) / dstH;
    for (let x = 0; x < dstW; x++) {
      const s = (x + 0.5) / dstW;
      const sx = tl.x * (1 - s) * (1 - t) + tr.x * s * (1 - t) + br.x * s * t + bl.x * (1 - s) * t;
      const sy = tl.y * (1 - s) * (1 - t) + tr.y * s * (1 - t) + br.y * s * t + bl.y * (1 - s) * t;
      const cx = Math.max(0, Math.min(w - 1.001, sx));
      const cy = Math.max(0, Math.min(h - 1.001, sy));
      const x0 = cx | 0;
      const y0 = cy | 0;
      const fx = cx - x0;
      const fy = cy - y0;
      const p00 = (y0 * w + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + w * 4;
      const p11 = p01 + 4;
      const o = (y * dstW + x) * 4;
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

/** Variance du laplacien 4-voisins (netteté) d'un carré RGBA dst×dst */
function sharpness(rgba: Uint8ClampedArray, dst: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const lum = (i: number) => rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  for (let y = 1; y < dst - 1; y++) {
    for (let x = 1; x < dst - 1; x++) {
      const i = (y * dst + x) * 4;
      const lap = lum(i - dst * 4) + lum(i + dst * 4) + lum(i - 4) + lum(i + 4) - 4 * lum(i);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Réduit w×h vers dst×dst en préservant l'aspect (letterbox, bandes grises) */
function letterboxRgba(rgba: Uint8ClampedArray, w: number, h: number, dst: number, scale: number, padX: number, padY: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dst * dst * 4);
  for (let y = 0; y < dst; y++) {
    const sy = (y - padY) / scale;
    const inY = sy >= 0 && sy <= h - 1.001;
    const y0 = Math.max(0, Math.floor(sy));
    const fy = sy - y0;
    for (let x = 0; x < dst; x++) {
      const o = (y * dst + x) * 4;
      const sx = (x - padX) / scale;
      if (!inY || sx < 0 || sx > w - 1.001) {
        out[o] = PAD;
        out[o + 1] = PAD;
        out[o + 2] = PAD;
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = (y0 * w + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + w * 4;
      const p11 = p01 + 4;
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

function post(id: number, corners: Pt[] | null, presence: number, idcrops: ArrayBuffer[] | null, card: CardOut, t0: number) {
  const transfer: Transferable[] = [];
  if (idcrops) transfer.push(...idcrops);
  if (card) transfer.push(card.buf);
  ctx.postMessage({ type: "result", id, corners, presence, idcrops, card, ms: performance.now() - t0 }, transfer);
}

async function detect(d: Extract<CornersIn, { type: "detect" }>) {
  const t0 = performance.now();
  if (!session) return post(d.id, null, 0, null, null, t0);
  const rgba = new Uint8ClampedArray(d.buf);
  const scale = NET_EDGE / Math.max(d.w, d.h);
  const padX = (NET_EDGE - d.w * scale) / 2;
  const padY = (NET_EDGE - d.h * scale) / 2;
  const small = letterboxRgba(rgba, d.w, d.h, NET_EDGE, scale, padX, padY);
  const plane = NET_EDGE * NET_EDGE;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = (small[p] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    input[plane + i] = (small[p + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    input[2 * plane + i] = (small[p + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  const out = await session.run({ input: new ort.Tensor("float32", input, [1, 3, NET_EDGE, NET_EDGE]) });
  const corners = out.corners.data as Float32Array;
  const presence = 1 / (1 + Math.exp(-(out.presence.data as Float32Array)[0]));
  const now = Date.now();
  const wantCrop = d.crop && now - lastCropAt >= ID_CROP_MIN_INTERVAL_MS;

  if (presence < PRESENCE_MIN || !quadLooksLikeCard(corners)) {
    missCount++;
    let card: CardOut = null;
    if (wantCrop && missCount >= FALLBACK_AFTER) {
      lastCropAt = now;
      const gh = d.h * GUIDE_H_FRAC;
      const gw = gh * CARD_ASPECT;
      const gx = (d.w - gw) / 2;
      const gy = (d.h - gh) / 2;
      const guide: XY[] = [
        { x: gx, y: gy },
        { x: gx + gw, y: gy },
        { x: gx + gw, y: gy + gh },
        { x: gx, y: gy + gh },
      ];
      const c = warpQuadToRect(rgba, d.w, d.h, guide, PHASH_CARD_W, PHASH_CARD_H);
      card = { buf: c.buffer as ArrayBuffer, w: PHASH_CARD_W, h: PHASH_CARD_H, guide: true };
    }
    return post(d.id, null, presence, null, card, t0);
  }
  missCount = 0;
  // Coins normalisés (repère letterbox) → repère de l'image analysée
  const frameQuad: XY[] = [];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < 4; i++) {
    const qx = (corners[i * 2] * NET_EDGE - padX) / scale;
    const qy = (corners[i * 2 + 1] * NET_EDGE - padY) / scale;
    frameQuad.push({ x: qx, y: qy });
    cx += qx;
    cy += qy;
  }
  cx /= 4;
  cy /= 4;
  const fx = d.vw / d.w;
  const fy = d.vh / d.h;
  const videoQuad: Pt[] = frameQuad.map((p) => [(cx + (p.x - cx) * SHRINK) * fx, (cy + (p.y - cy) * SHRINK) * fy] as Pt);
  let card: CardOut = null;
  let idcrops: ArrayBuffer[] | null = null;
  if (wantCrop) {
    lastCropAt = now;
    // pHash : carte redressée pleine, à chaque image throttlée (même un peu floue — la pHash refuse d'elle-même)
    const c = warpQuadToRect(rgba, d.w, d.h, frameQuad, PHASH_CARD_W, PHASH_CARD_H);
    card = { buf: c.buffer as ArrayBuffer, w: PHASH_CARD_W, h: PHASH_CARD_H, guide: false };
    // Embedding : crops intérieurs ancrés sur la carte, seulement sur image NETTE
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const p of frameQuad) {
      bx0 = Math.min(bx0, p.x);
      by0 = Math.min(by0, p.y);
      bx1 = Math.max(bx1, p.x);
      by1 = Math.max(by1, p.y);
    }
    const j = ID_CROP_JITTER[jitterCursor % ID_CROP_JITTER.length];
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    const ccx = bx0 + bw / 2 + j.dx * bw;
    const ccy = by0 + bh / 2 + j.dy * bh;
    const crops = ID_CROP_SCALES.map((k) => cropRgba(rgba, d.w, d.h, ccx - (bw * k) / 2, ccy - (bh * k) / 2, bw * k, bh * k, CROP_EDGE));
    const mid = crops[Math.floor(ID_CROP_SCALES.length / 2)];
    if (sharpness(mid, CROP_EDGE) >= ID_SHARPNESS_MIN) {
      jitterCursor++;
      idcrops = crops.map((c) => c.buffer as ArrayBuffer);
    }
  }
  post(d.id, videoQuad, presence, idcrops, card, t0);
}

ctx.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      ort.env.wasm.wasmPaths = m.wasmPath;
      ort.env.wasm.numThreads = 1;
      session = await ort.InferenceSession.create(await cachedArrayBuffer(m.modelUrl), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      ctx.postMessage({ type: "ready" });
    } else if (m.type === "detect") {
      await detect(m).catch(() => post(m.id, null, 0, null, null, performance.now()));
    }
  } catch (err) {
    ctx.postMessage({ type: "error", message: String(err) });
  }
};
