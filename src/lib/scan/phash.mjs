// Empreintes perceptuelles d'une carte (pHash sur DCT), partagées entre le
// script d'indexation (scripts/scan-index.mjs) et l'API de reconnaissance :
// une seule implémentation, donc exactement le même prétraitement des deux
// côtés. Deux empreintes de 256 bits : la carte entière et la seule
// illustration (là où deux cartes d'un même set diffèrent le plus).
//
// Le pHash est très sensible au cadrage (3 % de décalage ou 3° de rotation
// suffisent à le casser). Une photo est donc décodée UNE fois en niveaux de
// gris, puis échantillonnée sous des centaines de transformations affines
// (zoom, décalage, rotation) en JS pur : le matcher garde le meilleur
// alignement pour chaque carte candidate. C'est une recherche d'alignement,
// à quelques dizaines de millisecondes.
import sharp from "sharp";

/** Image de travail en niveaux de gris (proche du format carte 63/88) */
const GW = 96;
const GH = 132;
/** Taille d'échantillonnage et bloc basse fréquence de la DCT */
const N = 32;
const K = 16;
/** Fenêtres, en fractions de la carte */
const WHOLE = { left: 0, top: 0, width: 1, height: 1 };
const ART = { left: 0.07, top: 0.11, width: 0.86, height: 0.4 };
/** Sous-échantillonnage par pixel de sortie (moyenne 3×3 : évite l'aliasing) */
const SS = 3;

const COS = (() => {
  const t = new Float64Array(K * N);
  for (let u = 0; u < K; u++) {
    for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
  return t;
})();

const POP = (() => {
  const t = new Uint8Array(256);
  for (let i = 1; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return t;
})();

/**
 * pHash d'une image N×N en niveaux de gris : DCT-II 2D, bloc K×K de basse
 * fréquence, chaque coefficient comparé à la médiane (le DC est ignoré).
 * Invariant aux changements globaux de luminosité et de contraste.
 * @param {Float32Array | Uint8Array} g pixels N*N
 * @returns {Uint8Array} K*K/8 octets
 */
export function phashGray(g) {
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

/**
 * Décode une image de carte en niveaux de gris GW×GH (une seule passe sharp).
 * @param {Buffer | Uint8Array} input
 * @returns {Promise<Uint8Array>}
 */
export async function cardGray(input) {
  const { data } = await sharp(input, { failOn: "none" })
    .rotate()
    .grayscale()
    .resize(GW, GH, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, GW * GH);
}

/** Lecture bilinéaire, bords répétés */
function sample(g, x, y) {
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

/**
 * Échantillonne une fenêtre de la carte en N×N sous une transformation
 * affine : zoom `z` (< 1 = on regarde plus au centre), décalage `dx`/`dy`
 * (fractions), rotation `rot` (degrés), autour du centre de l'image.
 * @param {Uint8Array} g
 * @param {{left:number,top:number,width:number,height:number}} win
 * @param {{z:number,dx:number,dy:number,rot:number}} t
 */
function grid(g, win, t) {
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

const IDENTITY = { z: 1, dx: 0, dy: 0, rot: 0 };

/**
 * Les deux empreintes d'une image grise sous une transformation.
 * @param {Uint8Array} g
 * @param {{z:number,dx:number,dy:number,rot:number}} [t]
 */
export function hashesFromGray(g, t = IDENTITY) {
  return { whole: phashGray(grid(g, WHOLE, t)), art: phashGray(grid(g, ART, t)) };
}

/**
 * Empreintes d'une image de carte (scan du catalogue, cadrage supposé exact).
 * @param {Buffer | Uint8Array} input
 */
export async function hashCard(input) {
  return hashesFromGray(await cardGray(input));
}

/** Variantes grossières (1re passe sur tout l'index) et grille dense (2e passe sur les candidats) */
const COARSE = [
  IDENTITY,
  { z: 0.94, dx: 0, dy: 0, rot: 0 },
  { z: 1.06, dx: 0, dy: 0, rot: 0 },
  { z: 0.94, dx: 0.03, dy: 0, rot: 0 },
  { z: 0.94, dx: -0.03, dy: 0, rot: 0 },
  { z: 0.94, dx: 0, dy: 0.03, rot: 0 },
  { z: 0.94, dx: 0, dy: -0.03, rot: 0 },
  { z: 0.94, dx: 0, dy: 0, rot: 3 },
  { z: 0.94, dx: 0, dy: 0, rot: -3 },
];
const DENSE = (() => {
  const out = [];
  for (const z of [1.06, 1, 0.94, 0.88]) {
    for (const dx of [-0.04, -0.02, 0, 0.02, 0.04]) {
      for (const dy of [-0.04, -0.02, 0, 0.02, 0.04]) {
        for (const rot of [-4, -2, 0, 2, 4]) out.push({ z, dx, dy, rot });
      }
    }
  }
  return out;
})();

/**
 * Empreintes d'une photo sous de nombreux cadrages : `coarse` sert à
 * présélectionner des candidats sur tout l'index, `dense` à trouver le
 * meilleur alignement sur ces candidats.
 * @param {Buffer | Uint8Array} input
 * @returns {Promise<{ coarse: Array<{whole:Uint8Array;art:Uint8Array}>; dense: Array<{whole:Uint8Array;art:Uint8Array}> }>}
 */
export async function hashCardVariants(input) {
  const g = await cardGray(input);
  return { coarse: COARSE.map((t) => hashesFromGray(g, t)), dense: DENSE.map((t) => hashesFromGray(g, t)) };
}

/** Distance de Hamming entre deux empreintes de même taille */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[a[i] ^ b[i]];
  return d;
}

/** Nombre de bits d'une empreinte */
export const HASH_BITS = K * K;

/** @param {Uint8Array} u8 */
export const toB64 = (u8) => Buffer.from(u8).toString("base64");
/** @param {string} s */
export const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
