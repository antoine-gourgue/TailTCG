import "server-only";
import INDEX from "@/data/scan-index.json";
import { fromB64, hamming, HASH_BITS, type CardHashes } from "@/lib/scan/phash.mjs";

/**
 * Reconnaissance d'une carte par empreintes perceptuelles : l'index
 * (src/data/scan-index.json, généré par scripts/scan-index.mjs) tient en
 * mémoire et une photo est comparée à toutes les cartes en quelques
 * millisecondes (distance de Hamming). Pas d'OCR : c'est l'image qui parle.
 *
 * Deux passes : les variantes grossières de la photo contre tout l'index
 * donnent des candidats, puis la grille dense de cadrages trouve le meilleur
 * alignement pour chacun — une vraie photo bien alignée tombe alors très bas.
 */
export type ScanCandidate = {
  id: string;
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

type Entry = [id: string, name: string, setId: string, image: string, whole: string, art: string];

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

const cards = (INDEX.cards as Entry[]).map(([id, name, setId, image, w, a]) => ({
  id,
  name,
  setId,
  image,
  localId: id.slice(setId.length + 1),
  whole: fromB64(w),
  art: fromB64(a),
}));
const setNames = INDEX.sets as Record<string, string>;

export const scanIndexSize = cards.length;

type Card = (typeof cards)[number];

const dist = (v: CardHashes, c: Card) =>
  ((1 - W_ART) * hamming(v.whole, c.whole) + W_ART * hamming(v.art, c.art)) / HASH_BITS;

/** Meilleur score d'une carte sur un jeu de variantes */
function bestOf(variants: CardHashes[], c: Card): number {
  let s = Infinity;
  for (const v of variants) {
    const d = dist(v, c);
    if (d < s) s = d;
  }
  return s;
}

/** Top-k par insertion (k petit) */
function topK(scores: (i: number) => number, n: number, k: number): { i: number; score: number }[] {
  const best: { i: number; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    const score = scores(i);
    if (best.length < k || score < best[best.length - 1].score) {
      let j = best.length;
      best.push({ i, score });
      while (j > 0 && best[j - 1].score > score) {
        best[j] = best[j - 1];
        j--;
      }
      best[j] = { i, score };
      if (best.length > k) best.pop();
    }
  }
  return best;
}

export function matchCard(q: CardHashes | { coarse: CardHashes[]; dense: CardHashes[] }, k = 6): ScanResult {
  if (cards.length === 0) return { status: "none", candidates: [] };
  const coarse = "coarse" in q ? q.coarse : [q];
  const dense = "coarse" in q ? q.dense : [];

  // 1re passe : présélection sur tout l'index
  const shortlist = topK((i) => bestOf(coarse, cards[i]), cards.length, dense.length ? SHORTLIST : k);
  // 2e passe : meilleur alignement sur les présélectionnés
  const ranked = dense.length
    ? topK((j) => Math.min(shortlist[j].score, bestOf(dense, cards[shortlist[j].i])), shortlist.length, k).map(
        ({ i, score }) => ({ i: shortlist[i].i, score })
      )
    : shortlist;

  const candidates: ScanCandidate[] = ranked.map(({ i, score }) => {
    const c = cards[i];
    return {
      id: c.id,
      name: c.name,
      setId: c.setId,
      setName: setNames[c.setId] ?? c.setId,
      localId: c.localId,
      image: c.image,
      score: Math.round(score * 1000) / 1000,
    };
  });
  const top = candidates[0];
  if (!top || top.score > T_MATCH) return { status: "none", candidates };
  // Réimpressions : mêmes visuels dans plusieurs sets → on laisse choisir
  const ties = candidates.filter((c) => c.score - top.score <= T_TIE);
  if (ties.length > 1) return { status: "ambiguous", candidates: ties };
  const next = candidates[1];
  if (next && next.score - top.score < T_MARGIN) return { status: "none", candidates };
  return { status: "match", candidates: [top] };
}
