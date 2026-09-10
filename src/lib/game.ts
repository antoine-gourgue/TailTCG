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

/** « 7 h 12 », « 42 min », « moins d'une minute » */
export function formatCountdown(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m < 1) return "moins d'une minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}
