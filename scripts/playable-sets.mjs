// Instantané des sets jouables pour les boosters, embarqué dans le dépôt :
//   - src/data/playable-sets.json : la liste (carrousel, totaux)
//   - src/data/sets/<id>.json     : les cartes tirables de chaque set (nom FR,
//                                   image, rareté) → ouverture sans TCGdex
//   - src/data/sets/index.ts      : imports dynamiques par id
// Mêmes critères que src/lib/game-sets.ts : ≥ 30 cartes avec visuel sur le
// CDN, ≥ 80 % du set, ni promo, ni énergie, ni Pocket. À relancer quand un
// nouveau set sort :  node scripts/playable-sets.mjs
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";

const BASE = "https://api.tcgdex.net/v2/fr";
const GRAPHQL = "https://api.tcgdex.net/v2/graphql";
const EXCLUDE = /promo|énergie|energie|energy|black star|mcdonald|pocket/i;
const MIN_CARDS = 30;
const MIN_RATIO = 0.8;
const CHUNK = 6;
const OUT_DIR = new URL("../src/data/sets/", import.meta.url);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function json(url, init, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status === 429 || r.status >= 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

/** Raretés d'un set en une requête GraphQL (les fiches de set n'en ont pas) */
async function rarities(setId) {
  const query = `{ cards(filters: {id: "${setId}-"}, pagination: {page: 1, itemsPerPage: 2000}) { id rarity } }`;
  const d = await json(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const map = new Map();
  for (const c of d?.data?.cards ?? []) if (c.id.startsWith(`${setId}-`)) map.set(c.id, c.rarity ?? null);
  return map;
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

await mkdir(OUT_DIR, { recursive: true });
const list = [];
const pools = [];
for (let i = 0; i < briefs.length; i += CHUNK) {
  const batch = await Promise.all(
    briefs.slice(i, i + CHUNK).map(async (b) => {
      const raw = await json(`${BASE}/sets/${encodeURIComponent(b.id)}`);
      if (!raw) return { b, raw: null };
      const cards = raw.cards ?? [];
      const imaged = cards.filter((c) => c.image);
      if (imaged.length < MIN_CARDS || imaged.length / Math.max(cards.length, 1) < MIN_RATIO) return { b, raw, skip: true };
      const rar = await rarities(b.id);
      return { b, raw, imaged, rar };
    })
  );
  for (const { b, raw, skip, imaged, rar } of batch) {
    if (!raw) {
      console.warn(`\n  ! ${b.id} injoignable`);
      continue;
    }
    if (skip) continue;
    if (rar.size === 0) console.warn(`\n  ! ${b.id} : raretés indisponibles (tout en commune)`);
    list.push({
      id: raw.id,
      name: raw.name,
      serie: b.serie,
      logo: raw.logo ?? null,
      total: imaged.length,
      releaseDate: raw.releaseDate ?? "",
      cover: imaged[Math.floor(imaged.length * 0.72)]?.image ?? null,
    });
    pools.push({
      id: raw.id,
      name: raw.name,
      serie: b.serie,
      cards: imaged.map((c) => ({
        id: c.id,
        localId: c.localId,
        name: c.name,
        image: c.image,
        rarity: rar.get(c.id) ?? null,
      })),
    });
  }
  process.stdout.write(`\r${Math.min(i + CHUNK, briefs.length)} / ${briefs.length}`);
}

list.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
await writeFile(new URL("../src/data/playable-sets.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");

// Fichiers par set, index d'imports dynamiques, et nettoyage des anciens
const keep = new Set(pools.map((p) => `${p.id}.json`));
for (const f of await readdir(OUT_DIR)) {
  if (f.endsWith(".json") && !keep.has(f)) await rm(new URL(f, OUT_DIR));
}
for (const p of pools) await writeFile(new URL(`${p.id}.json`, OUT_DIR), JSON.stringify(p) + "\n");
const index =
  "// Généré par scripts/playable-sets.mjs — ne pas modifier à la main\n" +
  "export const SET_POOLS: Record<string, () => Promise<{ default: unknown }>> = {\n" +
  pools
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `  ${JSON.stringify(p.id)}: () => import(${JSON.stringify(`./${p.id}.json`)}),`)
    .join("\n") +
  "\n};\n";
await writeFile(new URL("index.ts", OUT_DIR), index);

const cards = pools.reduce((n, p) => n + p.cards.length, 0);
const known = pools.reduce((n, p) => n + p.cards.filter((c) => c.rarity).length, 0);
console.log(`\n${list.length} sets jouables, ${cards} cartes (${known} avec rareté) écrits dans src/data`);
