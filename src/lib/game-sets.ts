import { unstable_cache } from "next/cache";
import { fetchSeriesWithSets, type TcgdexSetDetail } from "@/lib/tcgdex";
import SNAPSHOT from "@/data/playable-sets.json";

/**
 * Sets « jouables » pour les boosters : assez de cartes avec un visuel sur
 * le CDN TCGdex, ni promos, ni énergies. La référence est un instantané
 * versionné (`src/data/playable-sets.json`, régénéré par
 * `node scripts/playable-sets.mjs`) : la page ne dépend plus de ~170
 * requêtes TCGdex à chaque rendu, ce qui laissait la liste vide en prod dès
 * que l'API ralentissait. Une fois par jour, la liste vivante y ajoute les
 * sets sortis depuis (seuls ceux-là coûtent une requête).
 */
const BASE = "https://api.tcgdex.net/v2/fr";
const DAY = 86_400;
const EXCLUDE = /promo|énergie|energie|energy|black star|mcdonald|pocket/i;
const MIN_CARDS = 30;
const MIN_RATIO = 0.8;
const CHUNK = 8;

export type PlayableSet = {
  id: string;
  name: string;
  serie: string;
  logo: string | null;
  /** Cartes avec visuel */
  total: number;
  releaseDate: string;
  /** Base d'image d'une carte du set, pour illustrer l'emballage */
  cover: string | null;
};

const snapshot = SNAPSHOT as PlayableSet[];
/** Sets de l'instantané par id (totaux, noms), sans requête */
export const PLAYABLE_BY_ID: ReadonlyMap<string, PlayableSet> = new Map(snapshot.map((s) => [s.id, s]));

/** Fiche brute d'un set : les cartes y ont `image` seulement si l'asset existe */
export async function fetchSetRaw(id: string): Promise<TcgdexSetDetail | null> {
  try {
    const res = await fetch(`${BASE}/sets/${encodeURIComponent(id)}`, {
      next: { revalidate: DAY },
    });
    if (!res.ok) return null;
    return (await res.json()) as TcgdexSetDetail;
  } catch {
    return null;
  }
}

/** Ids des cartes d'un set qui ont un visuel */
export async function imagedCardIds(id: string): Promise<Set<string>> {
  const raw = await fetchSetRaw(id);
  return new Set((raw?.cards ?? []).filter((c) => c.image).map((c) => c.id));
}

/** Évalue un set absent de l'instantané : jouable ou non */
async function evaluate(b: { id: string; serie: string }): Promise<PlayableSet | null> {
  const raw = await fetchSetRaw(b.id);
  if (!raw) return null;
  const cards = raw.cards ?? [];
  const imaged = cards.filter((c) => c.image);
  if (imaged.length < MIN_CARDS || imaged.length / Math.max(cards.length, 1) < MIN_RATIO) return null;
  return {
    id: raw.id,
    name: raw.name,
    serie: b.serie,
    logo: raw.logo ?? null,
    total: imaged.length,
    releaseDate: raw.releaseDate ?? "",
    // Illustration de l'emballage : une carte des trois derniers quarts du set
    cover: imaged[Math.floor(imaged.length * 0.72)]?.image ?? null,
  };
}

const byDate = (a: PlayableSet, b: PlayableSet) => b.releaseDate.localeCompare(a.releaseDate);

/** Instantané + sets sortis depuis. Replie sur l'instantané seul si l'API flanche. */
async function computeLive(): Promise<PlayableSet[]> {
  const series = await fetchSeriesWithSets("fr").catch(() => []);
  if (series.length === 0) return snapshot;
  const known = new Map(snapshot.map((s) => [s.id, s]));
  const out: PlayableSet[] = [];
  const fresh: { id: string; serie: string }[] = [];
  for (const s of series) {
    for (const x of s.sets) {
      if (EXCLUDE.test(x.name) || (x.cardCount?.total ?? x.cardCount?.official ?? 0) < MIN_CARDS) continue;
      const k = known.get(x.id);
      if (k) out.push(k);
      else fresh.push({ id: x.id, serie: s.name });
    }
  }
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const r = await Promise.all(fresh.slice(i, i + CHUNK).map(evaluate));
    for (const s of r) if (s) out.push(s);
  }
  // Liste tronquée (API partielle) : l'instantané reste la référence
  if (out.length < snapshot.length * 0.8) return snapshot;
  return out.sort(byDate);
}

const cachedLive = unstable_cache(computeLive, ["playable-sets", `snap-${snapshot.length}`], {
  revalidate: DAY,
});

export async function fetchPlayableSets(): Promise<PlayableSet[]> {
  try {
    return await cachedLive();
  } catch {
    return snapshot;
  }
}
