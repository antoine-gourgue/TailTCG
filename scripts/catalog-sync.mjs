// Catalogue de cartes en base (tables catalog_sets / catalog_cards) :
//   - FR et JA depuis TCGdex (sets, cartes, visuels par convention quand
//     l'API ne les liste pas), le FR complété par les cartes que l'anglais
//     a en plus ;
//   - JA complété par Limitless (limitlesstcg.com/cards/jp) pour les sets
//     absents, vides ou partiels chez TCGdex : numéro, nom japonais, nom
//     anglais, rareté, visuel de leur CDN ;
//   - FR : visuels manquants (Shiny Vault, galeries, McDonald's, kits,
//     énergies, 30th Classic Collection…) pris chez pokemontcg.io (données
//     publiques GitHub, par numéro puis par nom anglais) puis Limitless
//     international (grille du set). Scans anglais, à défaut de français.
// Idempotent (upsert). Service role via .env.local ou les variables du job nocturne.
//
//   node scripts/catalog-sync.mjs [--lang fr|ja] [--set <id>] [--no-limitless]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "./lib/env.mjs";

const sb = supabaseAdminEnv();
if (!sb) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY manquants (.env.local ou variables du job)");
  process.exit(1);
}
const db = createClient(sb.url, sb.key, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const ONLY_LANG = opt("--lang");
const ONLY_SET = opt("--set");
const NO_LIMITLESS = args.includes("--no-limitless");
const LANGS = ONLY_LANG ? [ONLY_LANG] : ["fr", "ja"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 TailTCG-catalog";
const setLogos = JSON.parse(readFileSync("src/data/set-logos.json", "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, kind = "json", tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (r.status === 404) return null;
      if (r.ok) {
        if (kind === "json") {
          try {
            return JSON.parse(await r.text());
          } catch {}
        } else return await r.text();
      }
    } catch {}
    await sleep(500 * (i + 1));
  }
  console.warn(`  ! injoignable : ${url}`);
  return undefined;
}
async function head(url) {
  try {
    return (await fetch(url, { method: "HEAD", headers: { "user-agent": UA } })).ok;
  } catch {
    return false;
  }
}
async function run(items, fn, n = 6) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}
async function upsert(table, rows) {
  // un même identifiant deux fois dans un lot (variantes d'un numéro chez
  // Limitless) ferait échouer l'upsert : on garde la première occurrence
  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(`${r.lang}/${r.id}`) ? false : seen.add(`${r.lang}/${r.id}`)));
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await db.from(table).upsert(unique.slice(i, i + 500), { onConflict: "lang,id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
/** Chemin de visuel par convention (même règle que src/lib/tcgdex.ts) */
const guessImage = (lang, serie, set, n) =>
  lang === "ja"
    ? `https://assets.tcgdex.net/ja/${serie}/${set}/${n}`
    : `https://assets.tcgdex.net/en/${serie.toLowerCase()}/${set.toLowerCase()}/${n}`;

// ---------------------------------------------------------------- TCGdex
async function syncTcgdex(lang) {
  const series = (await get(`https://api.tcgdex.net/v2/${lang}/series`)) ?? [];
  const setRows = [];
  const cardRows = [];
  const listed = new Map(); // set id → nb de cartes chez TCGdex
  for (const s of series) {
    if (s.id === "tcgp" || /pocket/i.test(s.name)) continue; // Pokémon Pocket : pas des cartes physiques
    const serie = await get(`https://api.tcgdex.net/v2/${lang}/series/${encodeURIComponent(s.id)}`);
    if (!serie) continue;
    const sets = (serie.sets ?? []).filter((x) => !ONLY_SET || x.id === ONLY_SET);
    await run(sets, async (x) => {
      const d = await get(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(x.id)}`);
      if (!d) return;
      let cards = (d.cards ?? []).map((c) => ({ ...c, card_lang: null }));
      // FR incomplet : cartes que l'anglais a en plus
      if (lang === "fr") {
        const en = await get(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(x.id)}`);
        if (en?.cards) {
          const have = new Set(cards.map((c) => c.localId));
          for (const c of en.cards) if (!have.has(c.localId)) cards.push({ ...c, card_lang: "en" });
        }
      }
      // visuels par convention, sondés une fois par set en japonais
      const serieId = d.serie?.id ?? s.id;
      const missing = cards.filter((c) => !c.image);
      if (missing.length) {
        const first = missing[0];
        const fill = await head(`${guessImage(first.card_lang ?? lang, serieId, d.id, first.localId)}/low.webp`);
        if (fill) for (const c of missing) c.image = guessImage(c.card_lang ?? lang, serieId, d.id, c.localId);
      }
      listed.set(d.id, cards.length);
      setRows.push({
        lang, id: d.id, name: d.name, serie_id: serieId, serie_name: serie.name, serie_logo: serie.logo ?? null,
        logo: d.logo ?? setLogos[lang]?.[d.id] ?? null, symbol: d.symbol ?? null, release_date: d.releaseDate ?? null,
        card_count_total: d.cardCount?.total ?? null, card_count_official: d.cardCount?.official ?? null, source: "tcgdex",
        updated_at: new Date().toISOString(),
      });
      for (const c of cards) {
        cardRows.push({
          lang, id: c.id, set_id: d.id, local_id: c.localId, name: c.name, name_en: c.card_lang === "en" ? c.name : null,
          image: c.image ?? null, rarity: null, source: "tcgdex", card_lang: c.card_lang, updated_at: new Date().toISOString(),
        });
      }
      console.log(`  ${lang}/${d.id.padEnd(10)} ${String(cards.length).padStart(4)} cartes`);
    });
  }
  await upsert("catalog_sets", setRows);
  await upsert("catalog_cards", cardRows);
  console.log(`TCGdex ${lang} : ${setRows.length} sets, ${cardRows.length} cartes`);
  return { listed, series };
}

// ------------------------------------------------------------- Limitless
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function parseDate(txt) {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/.exec(txt);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function parseList(html) {
  const i = html.indexOf("<table");
  const j = html.indexOf("</table>", i);
  if (i < 0 || j < 0) return [];
  const rows = [];
  for (const tr of html.slice(i, j).matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((m) => strip(m[1]));
    if (cells.length < 5 || cells[0] === "Set") continue;
    rows.push({ set: cells[0], no: cells[1], name: cells[2], type: cells[3], rarity: cells[4] });
  }
  return rows;
}
/** Code comparable entre TCGdex et Limitless : « SV-P » ≡ « SVP », « SM1+ » ≡ « SM1p », « sm2+ » ≡ « SM2p » */
const codeKey = (c) => c.toUpperCase().replace(/\+/g, "P").replace(/-/g, "");
const limitlessImage = (code, no) => `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${code}/${code}_${no}_R_JP.png`;

/** Cartes TCGdex sans visuel d'un set : on leur donne le scan Limitless du même numéro */
async function fillImages(setId, code, jp) {
  const { data } = await db.from("catalog_cards").select("*").eq("lang", "ja").eq("set_id", setId).eq("source", "tcgdex").is("image", null);
  if (!data?.length) return 0;
  const byNo = new Map(jp.map((r) => [(/^\d+$/.test(r.no) ? r.no.padStart(3, "0") : r.no), r.no]));
  const rows = data.filter((c) => byNo.has(c.local_id)).map((c) => ({ ...c, image: limitlessImage(code, byNo.get(c.local_id)), updated_at: new Date().toISOString() }));
  if (rows.length) await upsert("catalog_cards", rows);
  return rows.length;
}

async function syncLimitless(listed, series) {
  const index = await get("https://limitlesstcg.com/cards/jp", "text");
  if (!index) return;
  const codes = new Map();
  for (const m of index.matchAll(/href="\/cards\/jp\/([A-Za-z0-9+.-]+)"[^>]*>(.*?)<\/a>/gs)) {
    const code = m[1];
    const name = strip(m[2]).replace(new RegExp(`\\s*${code.replace(/[.+]/g, "\\$&")}$`), "");
    if (!codes.has(code) && name) codes.set(code, name);
  }
  console.log(`Limitless : ${codes.size} sets japonais`);
  const serieName = new Map(series.map((s) => [s.id, s.name]));
  // set TCGdex correspondant à un code Limitless (codes équivalents, celui qui a des cartes)
  const tcgdexByKey = new Map();
  for (const [id, n] of listed) {
    const k = codeKey(id);
    if (!tcgdexByKey.has(k) || (listed.get(tcgdexByKey.get(k)) ?? 0) < n) tcgdexByKey.set(k, id);
  }
  const setRows = [];
  const cardRows = [];
  let scraped = 0;
  let filled = 0;
  await run([...codes], async ([code, enName]) => {
    if (ONLY_SET && code !== ONLY_SET) return;
    const page = await get(`https://limitlesstcg.com/cards/jp/${encodeURIComponent(code)}?display=list`, "text");
    if (!page) return;
    const jp = parseList(page);
    if (jp.length === 0) return;
    const tcgdexId = tcgdexByKey.get(codeKey(code));
    if (tcgdexId) {
      // visuels manquants des cartes TCGdex de ce set
      const n = await fillImages(tcgdexId, code, jp);
      if (n) {
        filled += n;
        console.log(`  limitless/${code.padEnd(8)} ${String(n).padStart(4)} visuels → ${tcgdexId}`);
      }
    }
    // TCGdex a déjà au moins autant de cartes : rien d'autre à faire
    if ((listed.get(tcgdexId ?? code) ?? 0) >= jp.length) return;
    const enPage = await get(`https://limitlesstcg.com/cards/jp/${encodeURIComponent(code)}?display=list&translate=en`, "text");
    const en = new Map(parseList(enPage ?? "").map((r) => [r.no, r.name]));
    const info = /<div class="infobox-line">(.*?)<\/div>/s.exec(page);
    const date = info ? parseDate(strip(info[1])) : null;
    const prefix = (/^[A-Za-z]+/.exec(code) ?? [code])[0];
    const known = Boolean(tcgdexId);
    if (!known) {
      setRows.push({
        lang: "ja", id: code, name: enName, serie_id: prefix, serie_name: serieName.get(prefix) ?? prefix, serie_logo: null,
        logo: setLogos.ja?.[code] ?? null, symbol: null, release_date: date, card_count_total: jp.length, card_count_official: null,
        source: "limitless", updated_at: new Date().toISOString(),
      });
    }
    for (const r of jp) {
      const n = /^\d+$/.test(r.no) ? r.no.padStart(3, "0") : r.no;
      cardRows.push({
        lang: "ja", id: `${code}-${n}`, set_id: code, local_id: n, name: r.name, name_en: en.get(r.no) ?? null,
        image: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${code}/${code}_${r.no}_R_JP.png`,
        rarity: r.rarity || null, source: "limitless", card_lang: null, updated_at: new Date().toISOString(),
      });
    }
    scraped++;
    console.log(`  limitless/${code.padEnd(8)} ${String(jp.length).padStart(4)} cartes${known ? " (complète TCGdex)" : " (set absent de TCGdex)"}`);
  }, 4);
  // sets partiels chez TCGdex : on n'écrase pas ses cartes, on ajoute les manquantes
  const tcgdexIds = new Set();
  for (let i = 0; i < cardRows.length; i += 500) {
    const ids = cardRows.slice(i, i + 500).map((c) => c.id);
    const { data } = await db.from("catalog_cards").select("id").eq("lang", "ja").eq("source", "tcgdex").in("id", ids);
    for (const r of data ?? []) tcgdexIds.add(r.id);
  }
  const fresh = cardRows.filter((c) => !tcgdexIds.has(c.id));
  await upsert("catalog_sets", setRows);
  await upsert("catalog_cards", fresh);
  console.log(`Limitless : ${scraped} sets scrapés, ${setRows.length} sets ajoutés, ${fresh.length} cartes ajoutées (${cardRows.length - fresh.length} déjà chez TCGdex), ${filled} visuels complétés sur des cartes TCGdex`);
}

// -------------------------------------------------------- International (FR)
/** Identifiants pokemontcg.io : règle (sv09 → sv9, sv03.5 → sv3pt5, me01 → me1) et exceptions */
const POKEMONTCG_ID = {
  "2011bw": "mcd11", "2012bw": "mcd12", "2014xy": "mcd14", "2015xy": "mcd15", "2016xy": "mcd16", "2017sm": "mcd17",
  "2018sm-fr": "mcd18", "2019sm-fr": "mcd19", "2021swsh": "mcd21", "2022swsh": "mcd22",
  "tk-ex-latia": "tk1a", "tk-ex-latio": "tk1b", "tk-ex-p": "tk2a", "tk-ex-m": "tk2b",
  cel25cc: "cel25c", "30th": "me55", "30th-c": "me55c", "swsh4.5sv": "swsh45sv",
};
const pokemontcgId = (id) => POKEMONTCG_ID[id] ?? id.replace(/^([a-z]+)0*(\d+)(\.5)?(.*)$/i, (_, p, n, half, rest) => `${p}${n}${half ? "pt5" : ""}${rest}`);
/** Codes Limitless internationaux pour les promos (les autres se trouvent par nom) */
const LIMITLESS_EN_CODE = { svp: "SVP", swshp: "SP", smp: "SMP", xyp: "XYP", bwp: "BWP", dpp: "DPP", hgssp: "HSP", np: "NP", basep: "WP", "30th": "30C" };
/** Numéro comparable : « TG01 » ≡ « TG1 », « SV001 » ≡ « SV1 », « 001 » ≡ « 1 » */
const normNo = (n) => String(n).toUpperCase().replace(/^([A-Z]*)0*(\d+)([A-Z]*)$/, "$1$2$3");
/** Nom comparable : minuscules sans accents ni ponctuation, sans le niveau « LV.X » que TCGdex omet parfois */
const normName = (n) =>
  String(n)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\blv\.?\s*x\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

async function syncInternationalImages() {
  // sets FR dont des cartes TCGdex n'ont pas de visuel
  const missing = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("catalog_cards").select("*").eq("lang", "fr").eq("source", "tcgdex").is("image", null).range(from, from + 999);
    if (!data?.length) break;
    missing.push(...data);
    if (data.length < 1000) break;
  }
  const bySet = new Map();
  for (const c of missing) bySet.set(c.set_id, [...(bySet.get(c.set_id) ?? []), c]);
  console.log(`International : ${missing.length} cartes FR sans visuel dans ${bySet.size} sets`);
  if (!bySet.size) return;

  // liste Limitless internationale : nom normalisé → code
  const limByName = new Map();
  const index = await get("https://limitlesstcg.com/cards/en", "text");
  for (const m of (index ?? "").matchAll(/href="\/cards\/en\/([A-Za-z0-9-]+)"[^>]*>(.*?)<\/a>/gs)) {
    const code = m[1];
    const name = strip(m[2]).replace(new RegExp(`\\s*${code}$`), "");
    if (name && !limByName.has(normName(name))) limByName.set(normName(name), code);
  }
  let filled = 0;
  for (const [setId, cards] of bySet) {
    if (ONLY_SET && setId !== ONLY_SET) continue;
    const en = await get(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(setId)}`);
    const enName = en?.name && en.name !== "None" ? en.name : null;
    const enNames = new Map((en?.cards ?? []).map((c) => [c.localId, normName(c.name)]));
    /** numéro/nom → URL, par source, dans l'ordre */
    const sources = [];
    // pokemontcg.io (JSON public du dépôt)
    const ptcg = await get(`https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${pokemontcgId(setId)}.json`);
    if (Array.isArray(ptcg) && ptcg.length) {
      const first = ptcg[0]?.images?.large ?? ptcg[0]?.images?.small;
      if (first && (await head(first))) {
        sources.push({ name: "pokemontcg.io", byNo: new Map(ptcg.map((c) => [normNo(c.number), c.images?.large ?? c.images?.small])), byName: new Map(ptcg.map((c) => [normName(c.name), c.images?.large ?? c.images?.small])) });
      }
    }
    // Limitless : code par table, sinon par nom (sans le suffixe de sous-set)
    let code = LIMITLESS_EN_CODE[setId] ?? null;
    if (!code && enName) {
      const base = enName.replace(/\s+(Trainer Gallery|Galarian Gallery|Shiny Vault|Classic Collection)$/i, "");
      code = limByName.get(normName(base)) ?? null;
    }
    if (code) {
      const grid = await get(`https://limitlesstcg.com/cards/en/${encodeURIComponent(code)}`, "text");
      const byNo = new Map();
      for (const m of (grid ?? "").matchAll(/href="\/cards\/en\/[^/"]+\/([^"/?]+)"[^>]*>\s*<img[^>]+src="([^"]+)"/g)) {
        byNo.set(normNo(m[1]), m[2].replace(/_SM\.png$/, ".png"));
      }
      if (byNo.size) sources.push({ name: `Limitless ${code}`, byNo, byName: new Map() });
    }
    if (!sources.length) {
      console.log(`  fr/${setId.padEnd(12)} aucune source (${cards.length} cartes)`);
      continue;
    }
    const rows = [];
    const used = {};
    for (const c of cards) {
      let url = null;
      let src = null;
      for (const s of sources) {
        url = s.byNo.get(normNo(c.local_id)) ?? (enNames.get(c.local_id) ? s.byName.get(enNames.get(c.local_id)) : null) ?? null;
        if (url) {
          src = s.name;
          break;
        }
      }
      if (!url) continue;
      used[src] = (used[src] ?? 0) + 1;
      rows.push({ ...c, image: url, updated_at: new Date().toISOString() });
    }
    if (rows.length) await upsert("catalog_cards", rows);
    filled += rows.length;
    console.log(`  fr/${setId.padEnd(12)} ${String(rows.length).padStart(3)} / ${String(cards.length).padStart(3)} visuels ${Object.entries(used).map(([k, v]) => `${k} ${v}`).join(", ") || "(aucune correspondance)"}`);
  }
  console.log(`International : ${filled} visuels complétés`);
}

/**
 * Cartes que pokemontcg.io connaît et que TCGdex n'a pas (ex. les trois Mew
 * R/G/B des 30 ans) : ajoutées au set FR avec le visuel et le nom anglais,
 * source « pokemontcg ». Garde-fou : au plus 10 % du set (sinon c'est une
 * numérotation différente, pas des cartes manquantes). DRY_EXTRAS=1 : liste
 * sans écrire.
 */
async function syncInternationalExtras() {
  const { data: sets } = await db.from("catalog_sets").select("id, serie_id").eq("lang", "fr").eq("source", "tcgdex");
  let addedTotal = 0;
  for (const st of sets ?? []) {
    if (ONLY_SET && st.id !== ONLY_SET) continue;
    const ptcg = await get(`https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${pokemontcgId(st.id)}.json`);
    if (!Array.isArray(ptcg) || !ptcg.length) continue;
    const { data: have } = await db.from("catalog_cards").select("id, local_id").eq("lang", "fr").eq("set_id", st.id);
    if (!have?.length) continue;
    const known = new Set(have.map((c) => normNo(c.local_id)));
    const extras = ptcg.filter((c) => !known.has(normNo(c.number)));
    if (!extras.length) continue;
    if (extras.length > Math.max(3, Math.ceil(0.1 * ptcg.length))) {
      console.log(`  fr/${st.id.padEnd(12)} ${extras.length} cartes en plus chez pokemontcg.io : numérotation différente, ignoré`);
      continue;
    }
    const rows = [];
    for (const c of extras) {
      const image = c.images?.large ?? c.images?.small ?? null;
      if (!image || !(await head(image))) continue;
      const n = String(c.number).toUpperCase();
      rows.push({
        lang: "fr",
        id: `${st.id}-${n}`,
        set_id: st.id,
        local_id: n,
        name: c.name,
        name_en: c.name,
        image,
        rarity: c.rarity ?? null,
        source: "pokemontcg",
        card_lang: "en",
        updated_at: new Date().toISOString(),
      });
    }
    if (!rows.length) continue;
    console.log(`  fr/${st.id.padEnd(12)} +${rows.length} cartes pokemontcg.io : ${rows.map((r) => `${r.local_id} ${r.name}`).join(", ")}${process.env.DRY_EXTRAS ? " (essai)" : ""}`);
    if (!process.env.DRY_EXTRAS) {
      await upsert("catalog_cards", rows);
      addedTotal += rows.length;
    }
  }
  console.log(`International : ${addedTotal} cartes ajoutées depuis pokemontcg.io`);
}

const t0 = Date.now();
for (const lang of LANGS) {
  const { listed, series } = await syncTcgdex(lang);
  if (lang === "ja" && !NO_LIMITLESS) await syncLimitless(listed, series);
  if (lang === "fr" && !NO_LIMITLESS) {
    await syncInternationalImages();
    await syncInternationalExtras();
  }
}
console.log(`terminé en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
