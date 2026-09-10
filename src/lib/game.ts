/**
 * Boosters : règles pures (stock, raretés, tirage). Aucun accès réseau ni
 * base — utilisable côté serveur comme côté client.
 */

export const PACK_SIZE = 5;
/** Boosters gardés en réserve au maximum */
export const MAX_STOCK = 2;
/** Un booster crédité toutes les 12 h, tant que la réserve n'est pas pleine */
export const PERIOD_MS = 12 * 3_600_000;
/** TEMPORAIRE — phase de test : boosters illimités, pas de compte à rebours */
export const UNLIMITED_BOOSTERS = true;

/** Horloge isolée (lint react-compiler : pas de Date.now() dans un composant) */
export const nowMs = () => Date.now();

export type Tier = "common" | "uncommon" | "rare" | "holo" | "ultra" | "secret";
export const TIERS: Tier[] = ["common", "uncommon", "rare", "holo", "ultra", "secret"];
export const TIER_LABEL: Record<Tier, string> = {
  common: "Commune",
  uncommon: "Peu commune",
  rare: "Rare",
  holo: "Holo",
  ultra: "Ultra rare",
  secret: "Secrète",
};

/** Palier d'une rareté TCGdex (libellés FR ou EN, très variés selon les époques) */
export function tierOf(rarity?: string | null): Tier {
  const r = (rarity ?? "").toLowerCase();
  if (!r || /sans raret|none|promo/.test(r)) return "common";
  if (/hyper|secr|gold|\bor\b/.test(r)) return "secret";
  if (/ultra|sp[ée]ciale|special|magnifique|rainbow|arc-en-ciel|chromatique/.test(r)) return "ultra";
  if (/holo|illustration|double|\bex\b|\bgx\b|\bv\b|vmax|vstar|amazing|radi|prime|l[ée]gend|break|shin|brillant/.test(r)) {
    return "holo";
  }
  if (/peu commune|uncommon/.test(r)) return "uncommon";
  if (/rare/.test(r)) return "rare";
  return "common";
}

/** Composition d'un booster : pour chaque emplacement, paliers et poids */
const SLOTS: [Tier, number][][] = [
  [["common", 90], ["uncommon", 10]],
  [["common", 90], ["uncommon", 10]],
  [["common", 85], ["uncommon", 15]],
  [["uncommon", 75], ["rare", 25]],
  [["rare", 55], ["holo", 28], ["ultra", 13], ["secret", 4]],
];

function weighted<T>(entries: [T, number][], rand: () => number): T {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rand() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x < 0) return v;
  }
  return entries[entries.length - 1][0];
}

/**
 * Tire un booster dans un set : un palier par emplacement, dégradé vers le
 * palier inférieur si le set n'en a pas, doublons évités quand c'est possible.
 */
export function drawPack<T extends { id: string; tier: Tier }>(pool: T[], rand: () => number): T[] {
  const byTier = new Map<Tier, T[]>();
  for (const c of pool) {
    const list = byTier.get(c.tier) ?? [];
    list.push(c);
    byTier.set(c.tier, list);
  }
  const pack: T[] = [];
  for (const slot of SLOTS) {
    let tier = weighted(slot, rand);
    let candidates = byTier.get(tier) ?? [];
    // Pas de carte à ce palier : on descend, puis on prend n'importe quoi
    while (candidates.length === 0 && TIERS.indexOf(tier) > 0) {
      tier = TIERS[TIERS.indexOf(tier) - 1];
      candidates = byTier.get(tier) ?? [];
    }
    if (candidates.length === 0) candidates = pool;
    let pick = candidates[Math.floor(rand() * candidates.length)];
    for (let tries = 0; tries < 6 && pack.some((p) => p.id === pick.id); tries++) {
      pick = candidates[Math.floor(rand() * candidates.length)];
    }
    pack.push(pick);
  }
  return pack;
}

export type Profile = { boosters: number; refill_at: string };

/**
 * Réserve réelle à l'instant `now` : les boosters crédités depuis
 * `refill_at` s'ajoutent, jusqu'au plafond. `nextAt` = prochain crédit
 * (null quand la réserve est pleine), `refillAt` = nouvelle base à persister.
 */
export function settleStock(p: Profile, now: number) {
  const base = new Date(p.refill_at).getTime();
  if (p.boosters >= MAX_STOCK) return { stock: MAX_STOCK, refillAt: now, nextAt: null as number | null };
  const gained = Math.floor(Math.max(0, now - base) / PERIOD_MS);
  const stock = Math.min(MAX_STOCK, p.boosters + gained);
  if (stock >= MAX_STOCK) return { stock, refillAt: now, nextAt: null };
  const refillAt = base + gained * PERIOD_MS;
  return { stock, refillAt, nextAt: refillAt + PERIOD_MS };
}

/* ————— Gradation (jeu) ————— */

export type Grade = {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  overall: number;
};

export const GRADE_AXES: { key: keyof Omit<Grade, "overall">; label: string }[] = [
  { key: "centering", label: "Centrage" },
  { key: "corners", label: "Coins" },
  { key: "edges", label: "Bords" },
  { key: "surface", label: "Surface" },
];

/**
 * Distribution de la note GLOBALE (jouable) : le 10 est rare mais atteignable,
 * la masse est autour de 8, pas de gros tas sur le 7. Moyenne ≈ 7,7.
 */
const OVERALL_TABLE: [number, number][] = [
  [10, 5],
  [9, 15],
  [8, 27],
  [7, 22],
  [6, 13],
  [5, 8],
  [4, 5],
  [3, 3],
  [2, 1.5],
  [1, 0.5],
];

function pick(rand: () => number, table: [number, number][]): number {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let x = rand() * total;
  for (const [v, w] of table) {
    x -= w;
    if (x < 0) return v;
  }
  return table[0][0];
}

/**
 * Potentiel de gradation : on tire d'abord la note globale (distribution
 * maîtrisée), puis 4 sous-notes cohérentes — la plus basse vaut la globale
 * (façon PSA, la note suit le maillon faible), les autres sont ≥, plutôt
 * proches. Un 10 global implique 4 sous-notes à 10.
 */
export function rollGrade(rand: () => number): Grade {
  const overall = pick(rand, OVERALL_TABLE);
  const subs: number[] = [overall];
  for (let i = 0; i < 3; i++) {
    // Bonus au-dessus de la globale, décroissant (souvent 0–2)
    const room = 10 - overall;
    const bonus = room === 0 ? 0 : pick(rand, [[0, 40], [1, 34], [2, 18], [3, 8]].filter(([b]) => b <= room) as [number, number][]);
    subs.push(Math.min(10, overall + bonus));
  }
  // Mélange pour ne pas fixer l'axe faible
  for (let i = subs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [subs[i], subs[j]] = [subs[j], subs[i]];
  }
  return { centering: subs[0], corners: subs[1], edges: subs[2], surface: subs[3], overall };
}

/** Libellé d'une note globale, façon maisons de gradation */
export function gradeLabel(overall: number): string {
  if (overall >= 10) return "Gem Mint";
  if (overall === 9) return "Mint";
  if (overall === 8) return "NM-Mint";
  if (overall === 7) return "Near Mint";
  if (overall === 6) return "Excellent+";
  if (overall === 5) return "Excellent";
  if (overall >= 3) return "Bon";
  return "Correct";
}

/** Couleur d'un boîtier selon la note (or, argent, bronze, neutre) */
export function gradeTone(overall: number): { ring: string; text: string; glow: string } {
  if (overall >= 10) return { ring: "#f6c945", text: "#3a2a00", glow: "rgba(246,201,69,.6)" };
  if (overall >= 9) return { ring: "#d7dbe3", text: "#1b1b1f", glow: "rgba(215,219,227,.5)" };
  if (overall >= 7) return { ring: "#cd7f4b", text: "#2a1400", glow: "rgba(205,127,75,.45)" };
  return { ring: "#8b8f9a", text: "#f2f1f4", glow: "rgba(139,143,154,.35)" };
}

/** « 7 h 12 », « 42 min », « moins d'une minute » */
export function formatCountdown(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m < 1) return "moins d'une minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}
