// Catalogue des produits scellés → table sealed_products (Supabase).
// Fusionne trois sources publiques, sans clé :
// - TCGplayer via TCGCSV (base) : les produits scellés de chaque extension,
//   leurs visuels officiels et le prix marché en dollars ;
// - TCGdex : nom FR, logo et série de l'extension (apparié par nom) ;
// - Cardmarket : la liste publique des produits non-unitaires, pour l'idProduct
//   et donc la cote € via le guide de prix local (cardmarket_price_guide).
// Le type (ETB, display, booster, tin…) est déduit du nom par règles.
// Idempotent (upsert). Service role via .env.local ou les variables du job nocturne.
//   node scripts/sealed-catalog.mjs
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "./lib/env.mjs";

const admin = supabaseAdminEnv();
if (!admin) {
  console.error("Variables Supabase absentes.");
  process.exit(1);
}
const db = createClient(admin.url, admin.key, { auth: { persistSession: false } });

const UA = { "User-Agent": "TailTCG-sealed-catalog/1.0" };
const POKEMON = 3; // catégorie TCGplayer
const CM_NONSINGLES = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      try {
        return JSON.parse(buf.toString("utf8"));
      } catch {
        return JSON.parse(new TextDecoder("windows-1252").decode(buf));
      }
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

/** Nom normalisé pour l'appariement : minuscules, sans accents, sans préfixe « SV08: », sans ponctuation */
function norm(s) {
  let t = String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  t = t.replace(/^[a-z]{1,5}\d*(?:\.\d+)?[a-z]?:\s*/, "");
  t = t.replace(/[^a-z0-9 ]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Type de produit déduit du nom (règles dans l'ordre : la première qui matche) */
const KIND_RULES = [
  ["elite trainer box", "etb"],
  ["etb", "etb"],
  ["build & battle", "box_set"],
  ["build battle", "box_set"],
  ["booster box", "display"],
  ["booster display", "display"],
  ["sleeved booster case", "display"],
  ["booster case", "display"],
  ["display", "display"],
  ["booster bundle", "display"],
  ["premium collection", "box_set"],
  ["ultra-premium", "box_set"],
  ["ultra premium", "box_set"],
  ["special collection", "box_set"],
  ["collection", "box_set"],
  ["gift box", "box_set"],
  ["box set", "box_set"],
  ["tin", "tin"],
  ["blister", "blister"],
  ["checklane", "blister"],
  ["theme deck", "theme_deck"],
  ["deck", "theme_deck"],
  ["trainer kit", "trainer_kit"],
  ["booster pack", "booster"],
  ["booster", "booster"],
  ["bundle", "box_set"],
  ["box", "box_set"],
];
function kindOf(name) {
  const low = name.toLowerCase();
  for (const [needle, kind] of KIND_RULES) if (low.includes(needle)) return kind;
  return "autre";
}
const NON_PHYSICAL = ["code card", "online code", "ptcgo", "tcg live", "[code]", "(code)"];
const isNonPhysical = (name) => NON_PHYSICAL.some((k) => name.toLowerCase().includes(k));
const isWholesale = (name) => /\bcase\b(?!.*sleeved)|\[case\]|\bcarton\b/i.test(name) && !/sleeved booster case/i.test(name);
/** Une carte à l'unité porte un numéro ou une rareté dans ses données étendues */
const isCard = (p) => (p.extendedData ?? []).some((e) => e.name === "Number" || e.name === "Rarity");

/** Retire les parenthèses et crochets parasites : « (Retail) », « (Exclusive) », « [Set of 4] », « (3 Cards) » */
const stripParens = (s) => String(s).replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "");

/** Termes TCGplayer → termes Cardmarket (appliqués sur le nom normalisé) */
const CM_SYNONYMS = [
  [/\bsleeved booster pack\b/g, "sleeved booster"],
  [/\bbooster pack\b/g, "booster"],
  [/\bsingle pack blisters?\b/g, "1 pack blister"],
  [/\b(\d) pack blisters\b/g, "$1 pack blister"],
  [/\bblisters\b/g, "blister"],
];
const applySyn = (s) => CM_SYNONYMS.reduce((t, [re, rep]) => t.replace(re, rep), s).replace(/\s+/g, " ").trim();

/**
 * Variantes du nom TCGplayer à essayer côté Cardmarket. Le Pokémon entre
 * crochets (« 3 Pack Blisters [Quagsire] ») est replacé juste après le nom
 * d'extension, comme Cardmarket l'écrit (« Surging Sparks: Quagsire 3-Pack Blister »).
 */
function cmVariants(name, setNorm) {
  const bracket = norm((String(name).match(/\[([^\]]+)\]/) ?? [])[1] ?? "");
  const bases = [norm(name), norm(stripParens(name))];
  const out = new Set();
  for (const b of bases) {
    for (const v of [b, applySyn(b)]) {
      out.add(v);
      if (bracket && setNorm && v.startsWith(setNorm)) {
        const rest = v.slice(setNorm.length).replace(bracket, "").replace(/\s+/g, " ").trim();
        out.add(`${setNorm} ${bracket} ${rest}`.replace(/\s+/g, " ").trim());
      }
    }
  }
  return [...out].filter(Boolean);
}

// ---- Cardmarket : nom → idProduct (global) et par extension (reste du nom) ----
async function loadCardmarket() {
  const payload = await getJSON(CM_NONSINGLES);
  const products = (payload?.products ?? []).filter((p) => Number.isInteger(p.idProduct) && typeof p.name === "string");
  const global = new Map();
  const byExp = new Map();
  for (const p of products) {
    // Deux clés par produit : nom complet, et nom sans parenthèses (« Booster (6 Cards) » → « Booster »)
    const n = norm(p.name);
    for (const key of new Set([n, norm(stripParens(p.name))])) if (key && !global.has(key)) global.set(key, p.idProduct);
    if (Number.isInteger(p.idExpansion)) {
      if (!byExp.has(p.idExpansion)) byExp.set(p.idExpansion, []);
      byExp.get(p.idExpansion).push({ n, id: p.idProduct });
    }
  }
  // Par extension : libellé = plus long préfixe commun des noms, reste = nom moins le libellé
  const expIndex = new Map(); // norm(libellé) → Map(reste → idProduct)
  for (const list of byExp.values()) {
    const words = list.map((x) => x.n.split(" "));
    let lcp = words[0] ?? [];
    for (const w of words) {
      let k = 0;
      while (k < lcp.length && k < w.length && lcp[k] === w[k]) k++;
      lcp = lcp.slice(0, k);
    }
    const label = lcp.join(" ");
    if (!label) continue;
    const bucket = expIndex.get(label) ?? new Map();
    for (const x of list) {
      const rest = x.n.startsWith(label) ? x.n.slice(label.length).trim() : x.n;
      if (!bucket.has(rest)) bucket.set(rest, x.id);
    }
    expIndex.set(label, bucket);
  }
  console.log(`Cardmarket : ${products.length} produits non-unitaires, ${expIndex.size} extensions`);
  return { global, expIndex };
}

function matchCardmarket(cm, productName, setNorm) {
  const variants = cmVariants(productName, setNorm);
  for (const v of variants) {
    const hit = cm.global.get(v);
    if (hit) return hit;
  }
  const bucket = cm.expIndex.get(setNorm);
  if (!bucket) return null;
  for (const v of variants) {
    const rest = v.startsWith(setNorm) ? v.slice(setNorm.length).trim() : v;
    const hit = bucket.get(rest);
    if (hit) return hit;
  }
  return null;
}

/** Séries : abréviation TCGplayer → nom TCGdex (EN, normalisé) */
const SERIES = {
  sm: "sun moon",
  swsh: "sword shield",
  sv: "scarlet violet",
  bw: "black white",
  dp: "diamond pearl",
  hgss: "heartgold soulsilver",
  xy: "xy",
  me: "mega evolution",
};
const SERIES_PHRASES = [...new Set(Object.values(SERIES))];

/**
 * Clés candidates pour retrouver une extension TCGdex depuis un nom de groupe
 * TCGplayer : « SM - Guardians Rising » → « guardians rising » ; « SM Base Set »
 * → « sun moon » ; « Scarlet & Violet 151 » → « 151 ».
 */
function setKeys(groupName) {
  const n = norm(groupName);
  const keys = new Set([n]);
  const noAbbr = n.replace(/^(sm|swsh|sv|bw|dp|hgss|xy|me|ex)\s+/, "");
  // « SM Base Set », « XY Base Set », « Sword & Shield Base Set » = le premier
  // set de la série : ses clés passent avant tout le reste.
  const base = n.match(/^(.*?)\s+base set$/)?.[1];
  if (base) {
    if (SERIES[base]) keys.add(SERIES[base]);
    keys.add(base);
  }
  for (const phrase of SERIES_PHRASES) {
    // « Sword & Shield Base Set » désigne le set « Sword & Shield » (clé `base`
    // déjà ajoutée), pas « Base Set » de 1999 : on ne retient jamais ce reste-là.
    for (const src of [n, noAbbr]) {
      if (src.startsWith(phrase + " ")) {
        const rest = src.slice(phrase.length + 1);
        if (rest !== "base set") keys.add(rest);
      }
    }
  }
  // Nom sans préfixe d'abréviation, en dernier — jamais s'il se réduit à
  // « base set » (collision avec le Set de Base de 1999).
  if (noAbbr !== n && noAbbr !== "base set") keys.add(noAbbr);
  return [...keys].filter(Boolean);
}

// ---- TCGdex : extension EN/FR → id, nom FR, logo, série ----
async function loadTcgdex() {
  const enSets = new Map(((await getJSON("https://api.tcgdex.net/v2/en/sets")) ?? []).map((s) => [s.id, s.name ?? ""]));
  const series = (await getJSON("https://api.tcgdex.net/v2/fr/series")) ?? [];
  const index = new Map();
  /** id de série TCGdex (sv, swsh, sm, base, neo…) → { id, nom FR, logo } */
  const serieMeta = new Map(
    series.map((s) => [String(s.id).toLowerCase(), { id: String(s.id).toLowerCase(), name: s.name ?? "", logo: s.logo ? `${s.logo}.webp` : null }]),
  );
  for (const serie of series) {
    const detail = await getJSON(`https://api.tcgdex.net/v2/fr/series/${serie.id}`);
    for (const st of detail?.sets ?? []) {
      const info = {
        set_id: st.id,
        set_name_fr: st.name ?? "",
        set_logo: st.logo ? `${st.logo}.webp` : null,
        serie_id: String(serie.id).toLowerCase(),
      };
      for (const key of new Set([norm(enSets.get(st.id) ?? ""), norm(st.name ?? "")])) {
        if (key && !index.has(key)) index.set(key, info);
      }
    }
    await sleep(60);
  }
  console.log(`TCGdex : ${index.size} clés d'extension, ${serieMeta.size} séries`);
  return { index, serieMeta };
}

const AUTRES = { id: "autres", name: "Autres", logo: null };
/** Préfixe TCGplayer (« SV08: », « SM - », « HS—… ») → id de série TCGdex */
const PREFIX_TO_ID = { sv: "sv", sve: "sv", swsh: "swsh", sm: "sm", xy: "xy", bw: "bw", dp: "dp", pl: "pl", hgss: "hgss", hs: "hgss", col: "col", ex: "ex", me: "me", mee: "me", pop: "pop", neo: "neo", tk: "tk" };
/** Début de nom (normalisé) → id de série TCGdex, pour les groupes sans préfixe */
const PHRASE_TO_ID = [
  ["scarlet violet", "sv"], ["sword shield", "swsh"], ["sun moon", "sm"], ["black white", "bw"], ["diamond pearl", "dp"],
  ["platinum", "pl"], ["heartgold soulsilver", "hgss"], ["call of legends", "col"], ["mega evolution", "me"], ["pop series", "pop"],
  ["trainer kit", "tk"], ["mcdonald", "mc"], ["expedition", "ecard"], ["aquapolis", "ecard"], ["skyridge", "ecard"], ["e card", "ecard"],
  ["base set", "base"], ["jungle", "base"], ["fossil", "base"], ["team rocket", "base"], ["gym ", "base"], ["legendary collection", "base"],
  ["neo ", "neo"], ["southern islands", "neo"], ["ex ", "ex"],
];
/** Série d'un groupe TCGplayer non apparié à une extension TCGdex : par préfixe, puis par début de nom, sinon « Autres » */
function fallbackSerie(groupName, serieMeta) {
  const n = norm(groupName);
  const raw = String(groupName ?? "");
  const abbr = (raw.match(/^([A-Za-z]+)\d/) ?? raw.match(/^([A-Za-z]+)\s*[:—-]/))?.[1]?.toLowerCase();
  const byAbbr = abbr && PREFIX_TO_ID[abbr] ? serieMeta.get(PREFIX_TO_ID[abbr]) : null;
  if (byAbbr) return byAbbr;
  for (const [phrase, id] of PHRASE_TO_ID) {
    if ((n === phrase.trim() || n.startsWith(phrase)) && serieMeta.has(id)) return serieMeta.get(id);
  }
  return AUTRES;
}

// ---- TCGCSV : extensions → produits scellés + prix ----
async function loadTcgcsv() {
  const groups = (await getJSON(`https://tcgcsv.com/tcgplayer/${POKEMON}/groups`))?.results ?? [];
  const out = [];
  for (const g of groups) {
    const [prod, price] = await Promise.all([
      getJSON(`https://tcgcsv.com/tcgplayer/${POKEMON}/${g.groupId}/products`),
      getJSON(`https://tcgcsv.com/tcgplayer/${POKEMON}/${g.groupId}/prices`),
    ]);
    const products = (prod?.results ?? []).filter((p) => !isCard(p) && !isNonPhysical(p.name ?? "") && !isWholesale(p.name ?? ""));
    if (!products.length) {
      await sleep(150);
      continue;
    }
    const priceById = new Map();
    for (const p of price?.results ?? []) {
      if (p.marketPrice && (p.subTypeName === "Normal" || !priceById.has(p.productId))) priceById.set(p.productId, p.marketPrice);
    }
    out.push({ group: g, products, priceById });
    await sleep(250);
  }
  console.log(`TCGCSV : ${groups.length} extensions, ${out.length} avec produits scellés`);
  return out;
}

// ---- Assemblage + upsert ----
const [cm, { index: tcgdex, serieMeta }, groups] = await Promise.all([loadCardmarket(), loadTcgdex(), loadTcgcsv()]);
const rows = [];
let withSet = 0;
let withCm = 0;
for (const { group, products, priceById } of groups) {
  const setClean = String(group.name ?? "")
    .replace(/^[A-Za-z]+\d*(?:\.\d+)?[a-z]?:\s*/, "")
    .replace(/^(SM|SWSH|SV|BW|DP|HGSS|XY|ME|EX)\s+-\s+/i, "")
    .trim();
  const setNorm = norm(group.name);
  let td = null;
  for (const key of setKeys(group.name)) {
    td = tcgdex.get(key) ?? null;
    if (td) break;
  }
  const sr = (td && serieMeta.get(td.serie_id)) || fallbackSerie(group.name, serieMeta);
  const released = group.publishedOn ? String(group.publishedOn).slice(0, 10) : null;
  for (const p of products) {
    const cmId = matchCardmarket(cm, p.name, td ? norm(td.set_name_fr) : setNorm) ?? matchCardmarket(cm, p.name, setNorm);
    if (td) withSet++;
    if (cmId) withCm++;
    rows.push({
      id: p.productId,
      name: p.name,
      kind: kindOf(p.name),
      group_id: group.groupId,
      set_name: setClean,
      set_id: td?.set_id ?? null,
      set_name_fr: td?.set_name_fr ?? null,
      serie: sr.name,
      serie_id: sr.id,
      serie_logo: sr.logo,
      set_logo: td?.set_logo ?? null,
      released_on: released,
      image: String(p.imageUrl ?? "").replace(/_200w\.jpg$/, "_400w.jpg"),
      cardmarket_id: cmId,
      price_usd: priceById.get(p.productId) ?? null,
      updated_at: new Date().toISOString(),
    });
  }
}
console.log(`\n${rows.length} produits scellés | extension TCGdex : ${withSet} (${Math.round((100 * withSet) / rows.length)} %) | idProduct Cardmarket : ${withCm} (${Math.round((100 * withCm) / rows.length)} %)`);
const kinds = {};
for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
console.log("par type :", JSON.stringify(kinds));

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("sealed_products").upsert(rows.slice(i, i + 500), { onConflict: "id" });
  if (error) {
    console.error("upsert :", error.message);
    process.exit(1);
  }
}
console.log("sealed_products à jour.");

// ---- Relevé du jour : cote € (guide Cardmarket local) par produit apparié ----
// Même ordre de référence que src/lib/cardmarket.ts : trend, avg7, avg30, avg1, avg.
const cmIds = [...new Set(rows.map((r) => r.cardmarket_id).filter((v) => Number.isInteger(v)))];
const byCm = new Map();
for (let i = 0; i < cmIds.length; i += 500) {
  const { data } = await db.from("cardmarket_price_guide").select("id_product, trend, avg7, avg30, avg1, avg").in("id_product", cmIds.slice(i, i + 500));
  for (const g of data ?? []) {
    const ref = [g.trend, g.avg7, g.avg30, g.avg1, g.avg].find((v) => typeof v === "number" && v > 0);
    if (ref != null) byCm.set(g.id_product, ref);
  }
}
const today = new Date().toISOString().slice(0, 10);
const snaps = rows.filter((r) => byCm.has(r.cardmarket_id)).map((r) => ({ product_id: r.id, day: today, price: byCm.get(r.cardmarket_id) }));
for (let i = 0; i < snaps.length; i += 500) {
  const { error } = await db.from("sealed_price_snapshots").upsert(snaps.slice(i, i + 500), { onConflict: "product_id,day" });
  if (error) {
    console.error("relevés :", error.message);
    process.exit(1);
  }
}
console.log(`relevé du ${today} : ${snaps.length} cotes enregistrées.`);
