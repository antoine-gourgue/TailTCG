// Index d'empreintes pour le scan de cartes → src/data/scan-index.json
// Pour chaque carte du catalogue TCGdex qui a un visuel, dans chaque langue de
// l'app (fr, en, ja, de, es, it) : télécharge la vignette (low.webp) et calcule
// ses deux empreintes (src/lib/scan/phash.mjs). Les illustrations sont les
// mêmes d'une langue à l'autre mais pas les cadres ni les textes : indexer
// chaque langue permet de reconnaître une carte anglaise ou japonaise.
// Incrémental : les cartes déjà indexées ne sont pas retéléchargées, un
// nouveau set ne coûte que ses cartes. Sauvegarde toutes les 1000 cartes.
//   node scripts/scan-index.mjs               # complète l'index
//   node scripts/scan-index.mjs --lang ja     # une seule langue
//   node scripts/scan-index.mjs --set sv08    # un seul set (toutes langues)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { hashCard, toB64 } from "../src/lib/scan/phash.mjs";

const LANGS = ["fr", "en", "ja", "de", "es", "it"];
const OUT = new URL("../src/data/scan-index.json", import.meta.url);
const CONCURRENCY = 12;
const SAVE_EVERY = 1000;
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const onlySet = arg("--set");
const onlyLang = arg("--lang");

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

/** URL de visuel attendue (assets.tcgdex.net/<lang>/<série>/<set>/<numéro>) : stockée seulement si elle diffère */
const derivedImage = (lang, serie, setId, id) =>
  `https://assets.tcgdex.net/${lang}/${serie}/${setId}/${id.slice(setId.length + 1)}`;

// ---- index existant (reprise / incrémental) ----
/** @type {{version:number, createdAt:string|null, sets:Record<string,[string,string]>, cards:string[][]}} */
let index = { version: 2, createdAt: null, sets: {}, cards: [] };
try {
  const prev = JSON.parse(await readFile(OUT, "utf8"));
  if (prev.version === 2) index = prev;
  else console.log("ancien format d'index : reconstruction complète");
} catch {
  // premier passage
}
/** clé `lang/id` → entrée [id, lang, nom, setId, empreintes b64 (64 octets), visuel si hors motif] */
const known = new Map(index.cards.map((c) => [`${c[1]}/${c[0]}`, c]));
console.log(`index existant : ${known.size} cartes, ${Object.keys(index.sets).length} sets`);

async function save() {
  index.version = 2;
  index.createdAt = new Date().toISOString();
  index.cards = [...known.values()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(index) + "\n");
}

let added = 0;
let failed = 0;
let sinceSave = 0;
const t0 = Date.now();

for (const lang of onlyLang ? [onlyLang] : LANGS) {
  const BASE = `https://api.tcgdex.net/v2/${lang}`;
  // sans Pokémon Pocket (cartes de l'appli mobile)
  const pocket = new Set((((await fetchRetry(`${BASE}/series/tcgp`)) ?? {}).sets ?? []).map((s) => s.id));
  const sets = ((await fetchRetry(`${BASE}/sets`)) ?? []).filter((s) => !pocket.has(s.id));
  const todo = onlySet ? sets.filter((s) => s.id === onlySet) : sets;
  console.log(`\n[${lang}] ${todo.length} sets`);

  for (const s of todo) {
    const detail = await fetchRetry(`${BASE}/sets/${encodeURIComponent(s.id)}`);
    if (!detail) {
      console.warn(`  ! ${lang}/${s.id} injoignable`);
      continue;
    }
    const serie = detail.serie?.id ?? "";
    index.sets[`${lang}/${detail.id}`] = [detail.name, serie];
    const cards = (detail.cards ?? []).filter((c) => c.image && !known.has(`${lang}/${c.id}`));
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
          const packed = new Uint8Array(64);
          packed.set(whole, 0);
          packed.set(art, 32);
          const img = c.image === derivedImage(lang, serie, detail.id, c.id) ? "" : c.image;
          known.set(`${lang}/${c.id}`, [c.id, lang, c.name, detail.id, toB64(packed), img]);
          added++;
          sinceSave++;
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  ${detail.id.padEnd(10)} ${String(detail.name).slice(0, 26).padEnd(26)} +${cards.length} | total ${known.size} | ${dt}s`);
    if (sinceSave >= SAVE_EVERY) {
      await save();
      sinceSave = 0;
    }
  }
}

await save();
console.log(`\nterminé : +${added} cartes, ${failed} échecs, ${known.size} au total, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
