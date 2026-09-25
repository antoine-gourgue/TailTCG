/**
 * Analyse automatique d'une carte redressée (calque 63×88, carte à ~3 % des
 * bords) : lignes de centrage, état des coins et blanchiment des bords,
 * d'après les pixels. Tout est proposé avec un indice de confiance : ce
 * n'est qu'un point de départ que l'utilisateur vérifie sur les zooms.
 */

import type { Annotation } from "@/lib/grading-defects";

export type Guides = { oL: number; oR: number; oT: number; oB: number; iL: number; iR: number; iT: number; iB: number };

export type AutoAnalysis = {
  /** lignes de centrage (fractions du calque), null si les bords intérieurs ne ressortent pas */
  guides: Guides | null;
  /** 0–1 : netteté des transitions trouvées */
  centeringConfidence: number;
  /** bordure de couleur uniforme (carte classique) : coins et bords analysables */
  borderUniform: boolean;
  /** note proposée par coin (10 net, 7 léger blanchiment, 4 écrasé), dans l'ordre HG, HD, BD, BG ; null si non analysable */
  corners: (number | null)[];
  /** part de pixels blanchis par coin, pour l'affichage */
  cornerWhite: number[];
  /** défauts de bords proposés (clés de la checklist) */
  edgeDefects: string[];
  /** part de pixels blanchis sur les tranches */
  edgeWhite: number;
  /** blanc par tranche : gauche, droite, haut, bas */
  edgeWhites: number[];
  /** bords extérieurs retenus (fractions du calque) */
  outer: { oL: number; oR: number; oT: number; oB: number };
};

type Gray = { w: number; h: number; L: Float32Array; rgba: Uint8ClampedArray };

function gray(canvas: HTMLCanvasElement): Gray | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width: w, height: h } = canvas;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return { w, h, L, rgba };
}

/** Position (fraction) de la transition la plus nette dans une bande, en balayant des colonnes (vertical=false) ou des lignes */
function strongestLine(g: Gray, from: number, to: number, vertical: boolean): { pos: number; confidence: number } {
  const { w, h, L } = g;
  const n = vertical ? w : h;
  const a = Math.max(1, Math.floor(from * n));
  const b = Math.min(n - 2, Math.ceil(to * n));
  // on ne regarde que le tiers central de l'autre axe : moins de texte, moins d'illustration
  const other = vertical ? h : w;
  const o0 = Math.floor(other * 0.25);
  const o1 = Math.floor(other * 0.75);
  const grads: number[] = [];
  let best = -1;
  let bestPos = a;
  for (let p = a; p <= b; p++) {
    let sum = 0;
    for (let q = o0; q < o1; q += 2) {
      const i = vertical ? q * w + p : p * w + q;
      const j = vertical ? q * w + p + 1 : (p + 1) * w + q;
      sum += Math.abs(L[j] - L[i]);
    }
    grads.push(sum);
    if (sum > best) {
      best = sum;
      bestPos = p;
    }
  }
  const sorted = [...grads].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const confidence = Math.min(1, Math.max(0, (best / median - 2) / 8));
  return { pos: (bestPos + 0.5) / n, confidence };
}

/**
 * Premier bord franc en partant de l'extérieur (bord de la carte) : on ne
 * prend pas la transition la plus forte de la bande, qui serait souvent la
 * bordure imprimée, mais la première qui dépasse la moitié du maximum.
 */
function firstLine(g: Gray, from: number, to: number, vertical: boolean, fromOutside: "start" | "end"): { pos: number; confidence: number } {
  const { w, h, L } = g;
  const n = vertical ? w : h;
  const a = Math.max(1, Math.floor(from * n));
  const b = Math.min(n - 2, Math.ceil(to * n));
  const other = vertical ? h : w;
  const o0 = Math.floor(other * 0.25);
  const o1 = Math.floor(other * 0.75);
  const grads: number[] = [];
  for (let p = a; p <= b; p++) {
    let sum = 0;
    for (let q = o0; q < o1; q += 2) {
      const i = vertical ? q * w + p : p * w + q;
      const j = vertical ? q * w + p + 1 : (p + 1) * w + q;
      sum += Math.abs(L[j] - L[i]);
    }
    grads.push(sum);
  }
  const max = Math.max(...grads);
  const sorted = [...grads].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const confidence = Math.min(1, Math.max(0, (max / median - 2) / 8));
  const order = fromOutside === "start" ? grads.map((_, i) => i) : grads.map((_, i) => grads.length - 1 - i);
  const hit = order.find((i) => grads[i] >= max * 0.5) ?? order[0];
  return { pos: (a + hit + 0.5) / n, confidence };
}

/** Pixel « blanchi » : clair et peu saturé (fibre du carton à nu) */
function isWhite(rgba: Uint8ClampedArray, i: number): boolean {
  const r = rgba[i];
  const g = rgba[i + 1];
  const b = rgba[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 205 && max - min < 45;
}

function whiteRatio(g: Gray, x0: number, y0: number, x1: number, y1: number): number {
  const { w, rgba } = g;
  let n = 0;
  let white = 0;
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      n++;
      if (isWhite(rgba, (y * w + x) * 4)) white++;
    }
  }
  return n ? white / n : 0;
}

/** Écart-type de luminance dans un rectangle : bordure unie ou non */
function lumaStd(g: Gray, x0: number, y0: number, x1: number, y1: number): { mean: number; std: number } {
  const { w, L } = g;
  let n = 0;
  let s = 0;
  let s2 = 0;
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const v = L[y * w + x];
      n++;
      s += v;
      s2 += v * v;
    }
  const mean = n ? s / n : 0;
  return { mean, std: n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0 };
}

/** Saturation moyenne (0–1) dans un rectangle */
function meanSaturation(g: Gray, x0: number, y0: number, x1: number, y1: number): number {
  const { w, rgba } = g;
  let n = 0;
  let s = 0;
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y += 2)
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 2) {
      const i = (y * w + x) * 4;
      const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
      const mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      s += mx ? (mx - mn) / mx : 0;
      n++;
    }
  return n ? s / n : 0;
}

const CORNER_GRADE = (white: number) => (white < 0.03 ? 10 : white < 0.12 ? 7 : 4);
/** blanchiment de coin ou de tranche à partir duquel on l'entoure dans les défauts */
const WHITE_MARK = 0.03;

export function analyzeRectified(canvas: HTMLCanvasElement): AutoAnalysis | null {
  const g = gray(canvas);
  if (!g) return null;
  const { w, h } = g;

  /* ——— Bords extérieurs : le calque garde une marge de fond autour de la carte (prise au
     scan : ~6 %, photo cadrée à la main : ~3 %), la transition fond → carte est franche ——— */
  const oL = firstLine(g, 0, 0.11, true, "start");
  const oR = firstLine(g, 0.89, 1, true, "end");
  const oT = firstLine(g, 0, 0.11, false, "start");
  const oB = firstLine(g, 0.89, 1, false, "end");
  const outer = {
    oL: oL.confidence > 0.3 ? oL.pos : 0.032,
    oR: oR.confidence > 0.3 ? oR.pos : 0.968,
    oT: oT.confidence > 0.3 ? oT.pos : 0.032,
    oB: oB.confidence > 0.3 ? oB.pos : 0.968,
  };
  /* ——— Bord intérieur de la bordure imprimée (jaune, bleue…) : c'est elle que mesurent les
     gradeurs. Elle fait 3 à 8 % de la largeur : on ne cherche pas plus loin, pour ne pas
     accrocher le cadre de l'illustration ou une ligne de texte ——— */
  const inner = (from: number, span: number, vertical: boolean, dir: 1 | -1) =>
    dir > 0 ? strongestLine(g, from + 0.012, from + span, vertical) : strongestLine(g, from - span, from - 0.012, vertical);
  const iL = inner(outer.oL, 0.11, true, 1);
  const iR = inner(outer.oR, 0.11, true, -1);
  const iT = inner(outer.oT, 0.09, false, 1);
  const iB = inner(outer.oB, 0.09, false, -1);
  const centeringConfidence = Math.min(iL.confidence, iR.confidence, iT.confidence, iB.confidence);
  const guides: Guides | null = centeringConfidence > 0.35 ? { ...outer, iL: iL.pos, iR: iR.pos, iT: iT.pos, iB: iB.pos } : null;

  /* ——— Bordure unie ? (bande gauche entre bord extérieur et intérieur, hauteur centrale) ——— */
  const bx0 = Math.round((outer.oL + 0.006) * w);
  const bx1 = Math.round(((guides?.iL ?? outer.oL + 0.05) - 0.006) * w);
  const border = lumaStd(g, bx0, Math.round(h * 0.3), Math.max(bx0 + 2, bx1), Math.round(h * 0.7));
  // photo réelle : grain, léger dégradé d'éclairage → tolérance plus large qu'en synthèse
  const borderUniform = border.std < 32 && bx1 - bx0 >= Math.round(w * 0.015);
  // bordure déjà blanche (claire ET peu saturée) : le blanchiment n'est pas séparable ;
  // une bordure jaune surexposée reste saturée, donc analysable
  const borderLight = border.mean > 200 && meanSaturation(g, bx0, Math.round(h * 0.3), Math.max(bx0 + 2, bx1), Math.round(h * 0.7)) < 0.18;

  /* ——— Coins : carré de 5 % de la largeur, collé au coin, à l'intérieur du bord ——— */
  const s = Math.round(w * 0.05);
  const inset = Math.round(w * 0.004);
  const x0 = Math.round(outer.oL * w) + inset;
  const x1 = Math.round(outer.oR * w) - inset;
  const y0 = Math.round(outer.oT * h) + inset;
  const y1 = Math.round(outer.oB * h) - inset;
  const cornerWhite = [
    whiteRatio(g, x0, y0, x0 + s, y0 + s),
    whiteRatio(g, x1 - s, y0, x1, y0 + s),
    whiteRatio(g, x1 - s, y1 - s, x1, y1),
    whiteRatio(g, x0, y1 - s, x0 + s, y1),
  ];
  // Coins et tranches ne se lisent que sur une carte à bordure classique : unie, pas claire,
  // et dont les bords intérieurs ressortent (sinon full art, texture : on laisse la main)
  const analyzable = borderUniform && !borderLight && guides != null;
  const corners = cornerWhite.map((r) => (analyzable ? CORNER_GRADE(r) : null));

  /* ——— Tranches : liseré de 1,2 % le long des quatre bords, coins exclus ——— */
  const t = Math.max(2, Math.round(w * 0.012));
  const edges = [
    whiteRatio(g, x0, y0 + s, x0 + t, y1 - s),
    whiteRatio(g, x1 - t, y0 + s, x1, y1 - s),
    whiteRatio(g, x0 + s, y0, x1 - s, y0 + t),
    whiteRatio(g, x0 + s, y1 - t, x1 - s, y1),
  ];
  const edgeWhite = Math.max(...edges);
  const edgeDefects: string[] = [];
  if (analyzable) {
    if (edgeWhite > 0.1) edgeDefects.push("whitening-heavy");
    else if (edgeWhite > 0.025) edgeDefects.push("whitening-light");
  }

  return { guides, centeringConfidence, borderUniform: analyzable, corners, cornerWhite, edgeDefects, edgeWhite, edgeWhites: edges, outer };
}

/**
 * Défauts à entourer d'après l'analyse : un tracé autour de chaque coin blanchi
 * et le long de chaque tranche blanchie (coordonnées 0–1 du calque).
 */
export function autoAnnotations(a: AutoAnalysis, face: "r" | "v"): Annotation[] {
  if (!a.borderUniform) return [];
  const out: Annotation[] = [];
  const { oL, oR, oT, oB } = a.outer;
  const s = 0.06;
  const t = 0.02;
  // coins : HG, HD, BD, BG
  const cornerBoxes: [number, number, number, number][] = [
    [oL, oT, oL + s, oT + s],
    [oR - s, oT, oR, oT + s],
    [oR - s, oB - s, oR, oB],
    [oL, oB - s, oL + s, oB],
  ];
  a.cornerWhite.forEach((wr, i) => {
    if (wr < WHITE_MARK) return;
    const [x0, y0, x1, y1] = cornerBoxes[i];
    out.push({ face, kind: "whitening", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }] });
  });
  // tranches : gauche, droite, haut, bas (coins exclus)
  const edgeBoxes: [number, number, number, number][] = [
    [oL, oT + s, oL + t, oB - s],
    [oR - t, oT + s, oR, oB - s],
    [oL + s, oT, oR - s, oT + t],
    [oL + s, oB - t, oR - s, oB],
  ];
  a.edgeWhites.forEach((wr, i) => {
    if (wr < WHITE_MARK) return;
    const [x0, y0, x1, y1] = edgeBoxes[i];
    out.push({ face, kind: "whitening", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }] });
  });
  return out;
}

/**
 * La carte est-elle à l'endroit ? Sur une carte classique, l'illustration
 * (colorée) occupe le haut et la zone de texte (claire, peu saturée) le bas.
 * Renvoie "upright", "upside-down" ou "unknown" (full art, verso…).
 */
export function orientationOf(canvas: HTMLCanvasElement): "upright" | "upside-down" | "unknown" {
  const g = gray(canvas);
  if (!g) return "unknown";
  const { w, h, rgba } = g;
  const sat = (y0: number, y1: number) => {
    let n = 0;
    let s = 0;
    for (let y = Math.round(h * y0); y < Math.round(h * y1); y += 2)
      for (let x = Math.round(w * 0.12); x < Math.round(w * 0.88); x += 2) {
        const i = (y * w + x) * 4;
        const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
        const mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
        s += mx ? (mx - mn) / mx : 0;
        n++;
      }
    return n ? s / n : 0;
  };
  const d = sat(0.16, 0.48) - sat(0.56, 0.9);
  return d > 0.06 ? "upright" : d < -0.06 ? "upside-down" : "unknown";
}

/** Data URL → même image tournée de 180° (WebP) */
export function rotate180(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.translate(c.width, c.height);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/webp", 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Charge une image (data URL ou http) dans un canvas de travail */
export function canvasFromUrl(url: string, width = 900): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = Math.round((width * img.naturalHeight) / img.naturalWidth);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = reject;
    img.src = url;
  });
}
