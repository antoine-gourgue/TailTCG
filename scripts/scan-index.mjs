// Index d'empreintes pour le scan de cartes → src/data/scan-index.json
// Pour chaque carte FR du catalogue TCGdex qui a un visuel : télécharge la
// vignette (low.webp) et calcule ses deux empreintes (src/lib/scan/phash.mjs).
// Incrémental : les cartes déjà indexées ne sont pas retéléchargées, un
// nouveau set ne coûte que ses cartes. Sauvegarde toutes les 500 cartes.
//   node scripts/scan-index.mjs            # complète l'index
//   node scripts/scan-index.mjs --set sv08 # un seul set
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { hashCard, toB64 } from "../src/lib/scan/phash.mjs";

const BASE = "https://api.tcgdex.net/v2/fr";
const OUT = new URL("../src/data/scan-index.json", import.meta.url);
const CONCURRENCY = 12;
const SAVE_EVERY = 500;
const onlySet = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, kind = "json", tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "tailtcg-scan-index/1.0" } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!r.ok) return null;
      if (kind === "json") {
        // TCGdex glisse parfois des caractères de contrôle dans les textes
        const txt = (await r.text()).replace(/[\x00-\x1f]+/g, " ");
        return JSON.parse(txt);
      }
      return Buffer.from(await r.arrayBuffer());
    } catch {
      await sleep(600 * (i + 1));
    }
  }
  return null;
}

// ---- index existant (reprise / incrémental) ----
/** @type {{version:number, createdAt:string|null, sets:Record<string,string>, cards:string[][]}} */
let index = { version: 1, createdAt: null, sets: {}, cards: [] };
try {
  index = JSON.parse(await readFile(OUT, "utf8"));
} catch {
  // premier passage
}
const known = new Map(index.cards.map((c) => [c[0], c]));
console.log(`index existant : ${known.size} cartes, ${Object.keys(index.sets).length} sets`);

async function save() {
  index.createdAt = new Date().toISOString();
  index.cards = [...known.values()].sort((a, b) => a[0].localeCompare(b[0]));
  await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(index) + "\n");
}

// ---- sets FR (sans Pokémon Pocket) ----
const pocket = new Set((((await fetchRetry(`${BASE}/series/tcgp`)) ?? {}).sets ?? []).map((s) => s.id));
const sets = ((await fetchRetry(`${BASE}/sets`)) ?? []).filter((s) => !pocket.has(s.id));
const todo = onlySet ? sets.filter((s) => s.id === onlySet) : sets;
console.log(`${todo.length} sets à parcourir`);

let added = 0;
let failed = 0;
let sinceSave = 0;
const t0 = Date.now();

for (const s of todo) {
  const detail = await fetchRetry(`${BASE}/sets/${encodeURIComponent(s.id)}`);
  if (!detail) {
    console.warn(`  ! set ${s.id} injoignable`);
    continue;
  }
  index.sets[detail.id] = detail.name;
  const cards = (detail.cards ?? []).filter((c) => c.image && !known.has(c.id));
  if (cards.length === 0) continue;

  let i = 0;
  const worker = async () => {
    while (i < cards.length) {
      const c = cards[i++];
      const buf = await fetchRetry(`${c.image}/low.webp`, "bin");
      if (!buf) {
        failed++;
        continue;
      }
      try {
        const { whole, art } = await hashCard(buf);
        known.set(c.id, [c.id, c.name, detail.id, c.image, toB64(whole), toB64(art)]);
        added++;
        sinceSave++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${detail.id.padEnd(10)} ${detail.name.slice(0, 28).padEnd(28)} +${cards.length} | total ${known.size} | ${dt}s`);
  if (sinceSave >= SAVE_EVERY) {
    await save();
    sinceSave = 0;
  }
}

await save();
console.log(`\nterminé : +${added} cartes, ${failed} échecs, ${known.size} au total, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
