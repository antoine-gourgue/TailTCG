import "server-only";
import INDEX from "@/data/scan-index.json";
import { HASH_BITS, type CardHashes } from "@/lib/scan/phash.mjs";
import type { ScanLang } from "@/lib/scan/url";

/**
 * Reconnaissance d'une carte par empreintes perceptuelles : l'index
 * (src/data/scan-index.json, généré par scripts/scan-index.mjs, six langues)
 * tient en mémoire sous forme de tableaux de mots 32 bits, et une photo est
 * comparée à toutes les cartes en quelques dizaines de millisecondes
 * (distance de Hamming). Pas d'OCR : c'est l'image qui parle.
 *
 * Deux passes : les variantes grossières de la photo contre tout l'index
 * donnent des candidats, puis la grille dense de cadrages trouve le meilleur
 * alignement pour chacun — une vraie photo bien alignée tombe alors très bas.
 * Une même carte vue dans plusieurs langues est regroupée : la langue qui
 * colle le mieux est celle de la carte scannée.
 */
export type ScanCandidate = {
  id: string;
  lang: ScanLang;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  image: string;
  /** 0 = identique, 1 = opposé ; après alignement, la bonne carte tombe vers 0,05-0,2, les imposteurs restent ≥ 0,3 */
  score: number;
};
export type ScanResult = {
  /** match = une carte sûre ; ambiguous = plusieurs versions plausibles (réimpressions) ; none = rien de convaincant */
  status: "match" | "ambiguous" | "none";
  candidates: ScanCandidate[];
};

type Entry = [id: string, lang: ScanLang, name: string, setId: string, hashes: string, img: string];

/** Poids de l'illustration dans le score (elle discrimine mieux que le cadre, partagé dans un set) */
const W_ART = 0.6;
/** Candidats retenus par la première passe */
const SHORTLIST = 300;
/** Score au-delà duquel on ne propose rien */
const T_MATCH = 0.3;
/** Un second candidat plus proche que ça du meilleur = versions à départager */
const T_TIE = 0.03;
/** Écart minimal sur le suivant hors égalité pour être sûr */
const T_MARGIN = 0.03;
/** Pour une même carte, la langue de l'app l'emporte si elle est à moins de ce score de la meilleure langue */
const T_LANG = 0.02;
const PREFERRED_LANG: ScanLang = "fr";
/** Mots de 32 bits par empreinte */
const WORDS = HASH_BITS / 32;

const entries = INDEX.cards as unknown as Entry[];
const sets = INDEX.sets as unknown as Record<string, [name: string, serie: string]>;
const n = entries.length;
// Empreintes empaquetées : cache-friendly, comparées mot par mot
const wholes = new Uint32Array(n * WORDS);
const arts = new Uint32Array(n * WORDS);
for (let i = 0; i < n; i++) {
  const buf = Buffer.from(entries[i][4], "base64");
  for (let w = 0; w < WORDS; w++) {
    wholes[i * WORDS + w] = buf.readUInt32LE(w * 4);
    arts[i * WORDS + w] = buf.readUInt32LE(32 + w * 4);
  }
}

export const scanIndexSize = n;

function pop32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const words = (h: Uint8Array) => new Uint32Array(h.buffer, h.byteOffset, WORDS);
type Q = { whole: Uint32Array; art: Uint32Array };
const toQ = (h: CardHashes): Q => ({ whole: words(h.whole), art: words(h.art) });

/** Score d'une entrée sur un jeu de variantes (le meilleur cadrage gagne) */
function bestOf(variants: Q[], i: number): number {
  const o = i * WORDS;
  let best = Infinity;
  for (const v of variants) {
    let dw = 0;
    let da = 0;
    for (let w = 0; w < WORDS; w++) {
      dw += pop32(v.whole[w] ^ wholes[o + w]);
      da += pop32(v.art[w] ^ arts[o + w]);
    }
    const s = ((1 - W_ART) * dw + W_ART * da) / HASH_BITS;
    if (s < best) best = s;
  }
  return best;
}

/** Top-k par insertion (k petit) */
function topK(score: (i: number) => number, count: number, k: number): { i: number; score: number }[] {
  const best: { i: number; score: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = score(i);
    if (best.length < k || s < best[best.length - 1].score) {
      let j = best.length;
      best.push({ i, score: s });
      while (j > 0 && best[j - 1].score > s) {
        best[j] = best[j - 1];
        j--;
      }
      best[j] = { i, score: s };
      if (best.length > k) best.pop();
    }
  }
  return best;
}

function toCandidate(i: number, score: number): ScanCandidate {
  const [id, lang, name, setId, , img] = entries[i];
  const [setName, serie] = sets[`${lang}/${setId}`] ?? [setId, ""];
  const localId = id.slice(setId.length + 1);
  return {
    id,
    lang,
    name,
    setId,
    setName,
    localId,
    image: img || `https://assets.tcgdex.net/${lang}/${serie}/${setId}/${localId}`,
    score: Math.round(score * 1000) / 1000,
  };
}

export function matchCard(q: CardHashes | { coarse: CardHashes[]; dense: CardHashes[] }, k = 6): ScanResult {
  if (n === 0) return { status: "none", candidates: [] };
  const coarse = ("coarse" in q ? q.coarse : [q]).map(toQ);
  const dense = ("coarse" in q ? q.dense : []).map(toQ);

  // 1re passe : présélection sur tout l'index
  const shortlist = topK((i) => bestOf(coarse, i), n, dense.length ? SHORTLIST : k * 4);
  // 2e passe : meilleur alignement sur les présélectionnés
  const ranked = dense.length
    ? shortlist.map(({ i, score }) => ({ i, score: Math.min(score, bestOf(dense, i)) })).sort((a, b) => a.score - b.score)
    : shortlist;

  // Une même carte dans plusieurs langues : on garde la langue qui colle le
  // mieux, sauf si la langue de l'app fait quasiment jeu égal (même visuel,
  // seul le texte change : le bruit de la photo suffit à inverser l'ordre).
  const bestById = new Map<string, { i: number; score: number }>();
  const preferredById = new Map<string, number>();
  for (const { i, score } of ranked) {
    const [id, lang] = entries[i];
    if (!bestById.has(id)) bestById.set(id, { i, score });
    if (lang === PREFERRED_LANG && !preferredById.has(id) && score - bestById.get(id)!.score <= T_LANG) {
      preferredById.set(id, i);
    }
  }
  const candidates: ScanCandidate[] = [];
  for (const [id, best] of bestById) {
    candidates.push(toCandidate(preferredById.get(id) ?? best.i, best.score));
    if (candidates.length >= k) break;
  }

  const top = candidates[0];
  if (!top || top.score > T_MATCH) return { status: "none", candidates };
  // Réimpressions : mêmes visuels dans plusieurs sets → on laisse choisir
  const ties = candidates.filter((c) => c.score - top.score <= T_TIE);
  if (ties.length > 1) return { status: "ambiguous", candidates: ties };
  const next = candidates[1];
  if (next && next.score - top.score < T_MARGIN) return { status: "none", candidates };
  return { status: "match", candidates: [top] };
}
