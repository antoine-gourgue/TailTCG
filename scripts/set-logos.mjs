// Logos des sets que TCGdex ne fournit pas (81 sets FR, tous les sets JA),
// récupérés ailleurs, convertis en webp et auto-hébergés dans
// public/set-logos/<lang>/<id>.webp ; la table src/data/set-logos.json est
// injectée par src/lib/tcgdex.ts quand TCGdex n'a pas de logo.
//
// Sources, dans l'ordre (Pokécardex d'abord : ce sont de vrais logos, pas des
// symboles ou des numéros) :
//   FR : Pokécardex (pokecardex.b-cdn.net/assets/images/logos/<code>.png, code =
//        ptcgoCode de pokemontcg.io, ex. 30th → 30C) → logo anglais de TCGdex →
//        pokemontcg.io (images.pokemontcg.io/<id>/logo.png, identifiants sans
//        zéros de tête, « .5 » → « pt5 ») → Limitless (codes à la main) →
//        Bulbapedia (fichier « <nom anglais> Logo.png », API MediaWiki)
//   JA : Limitless (s3.limitlesstcg.com/sets/jp/<code>.png, mêmes codes que
//        TCGdex, logos corrects) → Pokécardex (…/logos_jp/<code>.png, en
//        secours pour les sets que Limitless n'a pas) → Bulbapedia (liste des
//        extensions japonaises)
//
//   node scripts/set-logos.mjs [--force] [--lang fr|ja]
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import sharp from "sharp";

const OUT_DIR = "public/set-logos";
const TABLE = "src/data/set-logos.json";
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.includes("--lang") ? process.argv[process.argv.indexOf("--lang") + 1] : null;

/** Identifiant pokemontcg.io depuis l'identifiant TCGdex (sv09 → sv9, sv03.5 → sv3pt5, me01 → me1) */
const pokemontcgId = (id) => id.replace(/^([a-z]+)0*(\d+)(\.5)?(.*)$/i, (_, p, n, half, rest) => `${p}${n}${half ? "pt5" : ""}${rest}`);
/** Identifiants pokemontcg.io quand la règle ne suffit pas (collections McDonald's, kits dresseur, sous-sets) */
const POKEMONTCG_ID = {
  "2011bw": "mcd11", "2012bw": "mcd12", "2014xy": "mcd14", "2015xy": "mcd15", "2016xy": "mcd16", "2017sm": "mcd17",
  "2018sm-fr": "mcd18", "2019sm-fr": "mcd19", "2021swsh": "mcd21", "2022swsh": "mcd22",
  "tk-ex-latia": "tk1a", "tk-ex-latio": "tk1b", "tk-ex-p": "tk2a", "tk-ex-m": "tk2b",
  cel25cc: "cel25c", "30th": "me55", "30th-c": "me55c", "swsh4.5sv": "swsh45sv",
};
/** Codes Limitless (international) pour les sets sans logo ailleurs */
const LIMITLESS_EN = { "30th": "30C", "30th-c": "30C", mee: "MEE", mep: "MEP", cel25cc: "CEL", "swsh4.5sv": "SHF" };
/** Codes Limitless (japonais) quand ils diffèrent de TCGdex (promos, sets « + ») */
const LIMITLESS_JA = { "SV-P": "SVP", "S-P": "SP", "SM-P": "SMP", "M-P": "MP", "XY-P": "XYP", "BW-P": "BWP", "SM1+": "SM1p" };

// ------------------------------------------------------------ Pokécardex
// De vrais logos (pas des symboles/numéros) ; codes = ptcgoCode (FR) ou dérivés
// de l'id TCGdex (JA). Sondés en premier : si le code ne renvoie pas d'image,
// on retombe sur les autres sources.
const PCX = "https://pokecardex.b-cdn.net/assets/images";
const PCX_HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TailTCG-logos)" };
/** Exceptions FR : id TCGdex → code Pokécardex (quand le ptcgoCode ne suffit pas) */
const POKECARDEX_FR = {
  "2011bw": "MC1", "2012bw": "MC2", "2013bw": "MC3", "2014xy": "MC4", "2015xy": "MC5",
  "2016xy": "MC6", "2017sm": "MC7", "2018sm-fr": "MC8", "2019sm-fr": "MC9", "2021swsh": "MC10", "2022swsh": "MC11",
};
/** Exceptions JA : id TCGdex → code Pokécardex */
const POKECARDEX_JA = { "SV-P": "SV-P", "M-P": "M-P", "SM1+": "SM1+", "SM3+": "SM3+" };
/**
 * Codes Pokécardex à NE PAS utiliser en JA : la numérotation Pokécardex diffère
 * de TCGdex et le code renvoie le logo d'un AUTRE set (ex. Pokécardex XY1B =
 * Collection X, alors que TCGdex XY1b = Collection Y). Ces sets gardent le
 * logo Limitless (correct), Pokécardex ne sert qu'en secours.
 */
const POKECARDEX_JA_BLOCK = new Set(["XY1b", "CS1a", "CS1b"]);
/** Codes Pokécardex candidats pour un set FR (le premier qui renvoie une image gagne) */
function pokecardexFrCodes(id, ptcgoCode) {
  const out = [];
  if (POKECARDEX_FR[id]) out.push(POKECARDEX_FR[id]);
  if (ptcgoCode) out.push(ptcgoCode);
  out.push(id.toUpperCase());
  return [...new Set(out)];
}
/**
 * Codes Pokécardex candidats pour un set JA : l'id tel quel puis en majuscules
 * (Pokécardex majuscule tout). Pas de dérivation « sans lettre finale » : elle
 * renvoyait le logo d'un set voisin (CS1a → CS1 = Collection Sheet BW).
 */
function pokecardexJaCodes(id) {
  if (POKECARDEX_JA_BLOCK.has(id)) return [];
  const out = [];
  if (POKECARDEX_JA[id]) out.push(POKECARDEX_JA[id]);
  out.push(id, id.toUpperCase());
  return [...new Set(out)];
}

const j = async (u, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return null;
};
const bin = async (u, headers = {}) => {
  try {
    const r = await fetch(u, { headers });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
};
const exists = (p) => access(p).then(() => true, () => false);

// ---------------------------------------------------------------- Bulbapedia
const BULBA = "https://bulbapedia.bulbagarden.net/w/api.php";
const BULBA_UA = "TailTCG/1.0 (logos de sets ; contact via le dépôt GitHub)";
async function bulbaJson(params) {
  const u = `${BULBA}?${new URLSearchParams({ format: "json", ...params })}`;
  try {
    const r = await fetch(u, { headers: { "user-agent": BULBA_UA } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
/** URL du fichier image d'un titre « File:… » (null si absent) */
async function bulbaFileUrl(title) {
  const d = await bulbaJson({ action: "query", titles: title, prop: "imageinfo", iiprop: "url", redirects: "1" });
  const page = Object.values(d?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}
/**
 * Visuel d'un set par sa page Bulbapedia (recherche sur le nom anglais) :
 * le fichier « …Logo… » de la page, sinon son symbole « SetSymbol… ».
 */
/** Sets dont la page Bulbapedia ne porte pas leur nom (sous-collections) : page et mot-clé du visuel */
const BULBA_PAGE = { rc: ["Legendary Treasures (TCG)", "Radiant"], exu: ["Unseen Forces (TCG)", "Unown"] };

async function bulbaPageVisual(enName, setId) {
  if (BULBA_PAGE[setId]) {
    const [title, kw] = BULBA_PAGE[setId];
    const d = await bulbaJson({ action: "query", titles: title, prop: "images", imlimit: "100", redirects: "1" });
    const images = Object.values(d?.query?.pages ?? {})[0]?.images?.map((i) => i.title) ?? [];
    const pick = images.find((t) => t.toLowerCase().includes(kw.toLowerCase()) && /logo|symbol/i.test(t));
    return pick ? bulbaFileUrl(pick) : null;
  }
  // « XY trainer Kit (Latios) » → base « XY Trainer Kit », variante « Latios »
  const variant = /\(([^)]+)\)\s*$/.exec(enName)?.[1] ?? null;
  // titres Bulbapedia en toutes lettres : « SM trainer Kit » → « Sun & Moon Trainer Kit »
  const ERA = { DP: "Diamond & Pearl", HS: "HeartGold & SoulSilver", BW: "Black & White", SM: "Sun & Moon" };
  const base = enName
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/trainer Kit/i, "Trainer Kit")
    .replace(/^(DP|HS|BW|SM)\b/, (m) => ERA[m]);
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = (t) => norm(t).split(" ").filter((w) => w.length > 2);
  let hit = null;
  for (const q of [variant ? `${base} ${variant}` : base, base]) {
    const search = await bulbaJson({ action: "query", list: "search", srsearch: `${q} TCG`, srlimit: "10" });
    hit = (search?.query?.search ?? []).find((r) => {
      const t = norm(r.title);
      return r.title.includes("(TCG)") && words(q).every((w) => t.includes(w));
    });
    if (hit) break;
  }
  if (!hit) return null;
  const d = await bulbaJson({ action: "query", titles: hit.title, prop: "images", imlimit: "100", redirects: "1" });
  const images = Object.values(d?.query?.pages ?? {})[0]?.images?.map((i) => i.title) ?? [];
  const logos = images.filter((t) => /logo/i.test(t) && !/project|pok.mon tcg logo/i.test(t));
  const symbols = images.filter((t) => /^File:SetSymbol/i.test(t));
  const ofVariant = (list) => (variant ? list.find((t) => norm(t).includes(norm(variant))) : null);
  const pick = ofVariant(logos) ?? ofVariant(symbols) ?? (variant && symbols.length > 1 ? null : logos[0] ?? symbols[0]) ?? null;
  return pick ? bulbaFileUrl(pick) : null;
}

/** Nom japonais comparable : NFKC, sans espaces ni ponctuation, minuscules */
const normJa = (t) => t.normalize("NFKC").replace(/[\s・:\-–—'’!?&.,()「」『』]/g, "").toLowerCase();
/**
 * Liste Bulbapedia des extensions japonaises : nom japonais → fichier logo.
 * Chaque ligne du tableau porte le symbole, le logo, « nom japonais<br>nom
 * traduit », l'équivalent anglais, le nombre de cartes et la date.
 */
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
/** « November 20, 2020 » → « 2020-11-20 » */
function isoDate(txt) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(txt);
  const mo = m ? MONTHS[m[1].toLowerCase()] : null;
  return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}
async function bulbaJapaneseLogos() {
  // HTML rendu (les URL d'images y sont réelles ; les titres du wikitexte ne se résolvent pas toujours)
  const d = await bulbaJson({ action: "parse", page: "List of Japanese Pokémon Trading Card Game expansions", prop: "text" });
  const html = d?.parse?.text?.["*"] ?? "";
  const byName = new Map();
  const byDate = new Map();
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  for (const tr of html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const row = tr[1];
    const img = [...row.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).find((u) => /logo/i.test(u));
    if (!img) continue;
    // vignette → original : /media/upload/thumb/a/b/X.png/110px-X.png → /media/upload/a/b/X.png
    const url = (img.startsWith("//") ? `https:${img}` : img).replace(/\/thumb\/([^/]+\/[^/]+\/[^/]+)\/\d+px-[^/]+$/, "/$1");
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => text(m[1]));
    const jpCell = cells.find((c) => /[぀-ヿ一-鿿]/.test(c));
    if (jpCell) {
      const name = jpCell.split(/\s{2,}|(?<=[぀-ヿ一-鿿…])\s(?=[A-Z])/)[0].trim();
      const key = normJa(name);
      // un nom porté par plusieurs sets (« 拡張パック ») n'identifie rien
      if (key) byName.set(key, byName.has(key) ? null : url);
    }
    const date = isoDate(row);
    if (date) byDate.set(date, byDate.has(date) ? null : url);
  }
  return { byName, byDate };
}

let table = { fr: {}, ja: {} };
try {
  table = JSON.parse(await readFile(TABLE, "utf8"));
} catch {}

async function save(lang, id, buf, source) {
  const file = `${OUT_DIR}/${lang}/${id}.webp`;
  await mkdir(`${OUT_DIR}/${lang}`, { recursive: true });
  await sharp(buf).resize({ width: 480, height: 200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toFile(file);
  table[lang][id] = `/set-logos/${lang}/${id}`;
  console.log(`  ✓ ${lang}/${id} ← ${source}`);
}

/** Déjà téléchargé ? */
async function have(lang, id) {
  if (FORCE || !(await exists(`${OUT_DIR}/${lang}/${id}.webp`))) return false;
  table[lang][id] = `/set-logos/${lang}/${id}`;
  return true;
}

/** Essaie les sources dans l'ordre, renvoie true si un logo a été enregistré */
async function fetchLogo(lang, id, candidates) {
  for (const [source, url, headers] of candidates) {
    const buf = await bin(url, headers);
    if (buf) {
      await save(lang, id, buf, source);
      return true;
    }
  }
  return false;
}

const summary = {};
if (!ONLY || ONLY === "fr") {
  const sets = (await j("https://api.tcgdex.net/v2/fr/sets")) ?? [];
  const todo = sets.filter((s) => !s.logo);
  // ptcgoCode (= code Pokécardex international) par identifiant pokemontcg.io
  const ptcgSets = (await j("https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json")) ?? [];
  const ptcgoByPokemontcgId = new Map(ptcgSets.map((s) => [s.id, s.ptcgoCode]));
  console.log(`FR : ${todo.length} sets sans logo chez TCGdex`);
  let ok = 0;
  const missing = [];
  for (const s of todo) {
    if (await have("fr", s.id)) {
      ok++;
      continue;
    }
    const en = await j(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`);
    const cands = [];
    // Pokécardex d'abord (vrais logos)
    const ptcgoCode = ptcgoByPokemontcgId.get(POKEMONTCG_ID[s.id] ?? pokemontcgId(s.id));
    for (const code of pokecardexFrCodes(s.id, ptcgoCode)) {
      cands.push([`Pokécardex ${code}`, `${PCX}/logos/${encodeURIComponent(code)}.png`, PCX_HEADERS]);
    }
    if (en?.logo) cands.push(["TCGdex en", `${en.logo}.webp`], ["TCGdex en", `${en.logo}.png`]);
    cands.push(["pokemontcg.io", `https://images.pokemontcg.io/${POKEMONTCG_ID[s.id] ?? pokemontcgId(s.id)}/logo.png`]);
    if (LIMITLESS_EN[s.id]) cands.push(["Limitless", `https://s3.limitlesstcg.com/sets/en/${LIMITLESS_EN[s.id]}.png`]);
    // Bulbapedia : « <nom anglais> Logo EN.png » ou « <nom anglais> Logo.png »,
    // sinon la page du set (recherche) : son logo, ou à défaut son symbole
    const enName = en?.name && en.name !== "None" ? en.name : null;
    if (enName) {
      for (const title of [`File:${enName} Logo EN.png`, `File:${enName} Logo.png`]) {
        const url = await bulbaFileUrl(title);
        if (url) cands.push([`Bulbapedia ${title}`, url, { "user-agent": BULBA_UA }]);
      }
      // pas pour les fourre-tout (jumbo, W Promotional) ni les sets Pocket (A*, B*), exclus de l'app
      if (!/^(jumbo|wp)$|^[AB]\d/.test(s.id)) {
        const pageImg = await bulbaPageVisual(enName, s.id);
        if (pageImg) cands.push([`Bulbapedia ${pageImg.split("/").pop()}`, pageImg, { "user-agent": BULBA_UA }]);
      }
    }
    if (await fetchLogo("fr", s.id, cands)) ok++;
    else missing.push(s.id);
  }
  summary.fr = { total: todo.length, ok, missing };
}
if (!ONLY || ONLY === "ja") {
  const sets = (await j("https://api.tcgdex.net/v2/ja/sets")) ?? [];
  // + les sets japonais que seul Limitless connaît (catalogue en base, source limitless)
  try {
    const html = await (await fetch("https://limitlesstcg.com/cards/jp", { headers: { "user-agent": "Mozilla/5.0 TailTCG-logos" } })).text();
    const known = new Set(sets.map((s) => s.id));
    for (const m of html.matchAll(/href="\/cards\/jp\/([A-Za-z0-9+.-]+)"[^>]*>(.*?)<\/a>/gs)) {
      const code = m[1];
      if (known.has(code)) continue;
      known.add(code);
      const name = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      sets.push({ id: code, name, limitlessOnly: true });
    }
  } catch {}
  const todo = sets.filter((s) => !s.logo);
  console.log(`JA : ${todo.length} sets sans logo chez TCGdex (dont ${todo.filter((s) => s.limitlessOnly).length} connus de Limitless seulement)`);
  let ok = 0;
  const missing = [];
  const left = [];
  for (const s of todo) {
    if (await have("ja", s.id)) {
      ok++;
      continue;
    }
    // Limitless d'abord (source curée, codes = ids TCGdex : logos corrects),
    // Pokécardex en secours pour les sets que Limitless n'a pas (ceux qui
    // affichaient un numéro) — codes dérivés, donc en second pour éviter une
    // mauvaise correspondance là où Limitless est déjà bon.
    const code = LIMITLESS_JA[s.id] ?? s.id;
    const cands = [["Limitless", `https://s3.limitlesstcg.com/sets/jp/${encodeURIComponent(code)}.png`]];
    for (const pc of pokecardexJaCodes(s.id)) {
      cands.push([`Pokécardex ${pc}`, `${PCX}/logos_jp/${encodeURIComponent(pc)}.png`, PCX_HEADERS]);
    }
    if (await fetchLogo("ja", s.id, cands)) ok++;
    else left.push(s);
  }
  // Bulbapedia par nom japonais pour ce qui reste
  const bulba = left.length ? await bulbaJapaneseLogos() : { byName: new Map(), byDate: new Map() };
  console.log(`Bulbapedia : ${bulba.byName.size} noms et ${bulba.byDate.size} dates référencés, ${left.length} sets à tenter`);
  for (const s of left) {
    if (s.limitlessOnly) {
      missing.push(s.id);
      continue;
    }
    let url = bulba.byName.get(normJa(s.name)) ?? null;
    if (!url) {
      // nom ambigu ou différent : par date de sortie
      const detail = await j(`https://api.tcgdex.net/v2/ja/sets/${encodeURIComponent(s.id)}`);
      if (detail?.releaseDate) url = bulba.byDate.get(detail.releaseDate) ?? null;
    }
    if (url && (await fetchLogo("ja", s.id, [[`Bulbapedia ${url.split("/").pop()}`, url, { "user-agent": BULBA_UA }]]))) ok++;
    else missing.push(s.id);
  }
  summary.ja = { total: todo.length, ok, missing };
}

// table triée, stable dans git
const sorted = { fr: Object.fromEntries(Object.entries(table.fr).sort()), ja: Object.fromEntries(Object.entries(table.ja).sort()) };
await writeFile(TABLE, JSON.stringify(sorted, null, 2) + "\n");
for (const [lang, s] of Object.entries(summary)) {
  console.log(`\n${lang.toUpperCase()} : ${s.ok}/${s.total} logos récupérés | manquants (${s.missing.length}) : ${s.missing.join(" ")}`);
}
