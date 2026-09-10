import { fetchSeriesWithSets, type TcgdexSetDetail } from "@/lib/tcgdex";

/**
 * Sets « jouables » pour les boosters : assez de cartes avec un visuel sur
 * le CDN TCGdex, ni promos, ni énergies. Chaque fiche de set est mise en
 * cache 24 h par Next : la première liste coûte ~170 requêtes, les suivantes
 * rien.
 */
const BASE = "https://api.tcgdex.net/v2/fr";
const DAY = 86_400;
const EXCLUDE = /promo|énergie|energie|energy|black star|mcdonald|pocket/i;
const MIN_CARDS = 30;
const MIN_RATIO = 0.8;
const CHUNK = 12;

export type PlayableSet = {
  id: string;
  name: string;
  serie: string;
  logo: string | null;
  /** Cartes avec visuel */
  total: number;
  releaseDate: string;
};

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

export async function fetchPlayableSets(): Promise<PlayableSet[]> {
  const series = await fetchSeriesWithSets("fr").catch(() => []);
  const briefs = series.flatMap((s) =>
    s.sets
      .filter((x) => !EXCLUDE.test(x.name) && (x.cardCount?.total ?? x.cardCount?.official ?? 0) >= MIN_CARDS)
      .map((x) => ({ id: x.id, serie: s.name }))
  );
  const out: PlayableSet[] = [];
  for (let i = 0; i < briefs.length; i += CHUNK) {
    const raws = await Promise.all(
      briefs.slice(i, i + CHUNK).map(async (b) => ({ b, raw: await fetchSetRaw(b.id) }))
    );
    for (const { b, raw } of raws) {
      if (!raw) continue;
      const cards = raw.cards ?? [];
      const withImage = cards.filter((c) => c.image).length;
      if (withImage < MIN_CARDS || withImage / Math.max(cards.length, 1) < MIN_RATIO) continue;
      out.push({
        id: raw.id,
        name: raw.name,
        serie: b.serie,
        logo: raw.logo ?? null,
        total: withImage,
        releaseDate: raw.releaseDate ?? "",
      });
    }
  }
  return out.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}
