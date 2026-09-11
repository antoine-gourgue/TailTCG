// Instantané des sets jouables pour les boosters → src/data/playable-sets.json
// Mêmes critères que src/lib/game-sets.ts : ≥ 30 cartes avec visuel sur le
// CDN, ≥ 80 % du set, ni promo, ni énergie, ni Pocket. À relancer quand un
// nouveau set sort :  node scripts/playable-sets.mjs
import { writeFile } from "node:fs/promises";

const BASE = "https://api.tcgdex.net/v2/fr";
const EXCLUDE = /promo|énergie|energie|energy|black star|mcdonald|pocket/i;
const MIN_CARDS = 30;
const MIN_RATIO = 0.8;
const CHUNK = 8;

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await new Promise((res) => setTimeout(res, 800));
    }
  }
  return null;
}

const series = (await json(`${BASE}/series`)) ?? [];
const briefs = [];
for (const s of series) {
  if (s.id === "tcgp" || /pocket/i.test(s.name)) continue;
  const d = await json(`${BASE}/series/${encodeURIComponent(s.id)}`);
  for (const x of d?.sets ?? []) {
    const n = x.cardCount?.total ?? x.cardCount?.official ?? 0;
    if (!EXCLUDE.test(x.name) && n >= MIN_CARDS) briefs.push({ id: x.id, serie: d.name });
  }
}
console.log(`${briefs.length} sets candidats`);

const out = [];
for (let i = 0; i < briefs.length; i += CHUNK) {
  const raws = await Promise.all(
    briefs.slice(i, i + CHUNK).map(async (b) => ({ b, raw: await json(`${BASE}/sets/${encodeURIComponent(b.id)}`) }))
  );
  for (const { b, raw } of raws) {
    if (!raw) {
      console.warn(`  ! ${b.id} injoignable`);
      continue;
    }
    const cards = raw.cards ?? [];
    const imaged = cards.filter((c) => c.image);
    if (imaged.length < MIN_CARDS || imaged.length / Math.max(cards.length, 1) < MIN_RATIO) continue;
    out.push({
      id: raw.id,
      name: raw.name,
      serie: b.serie,
      logo: raw.logo ?? null,
      total: imaged.length,
      releaseDate: raw.releaseDate ?? "",
      cover: imaged[Math.floor(imaged.length * 0.72)]?.image ?? null,
    });
  }
  process.stdout.write(`\r${Math.min(i + CHUNK, briefs.length)} / ${briefs.length}`);
}
out.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
await writeFile(new URL("../src/data/playable-sets.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`\n${out.length} sets jouables écrits dans src/data/playable-sets.json`);
