import "server-only";

/**
 * Cote TCGplayer des cartes japonaises, lue dans l'export public TCGCSV
 * (catégorie 85, sans compte ni clé) — reprise de GoupixDex (Léo). Sert de
 * repli aux cartes japonaises sans cote Cardmarket : sets que TCGdex ne cote
 * pas, sets complétés par Limitless. Prix marché, sinon moyen, sinon le plus
 * bas, de l'impression normale du numéro (la plus haute de ses finitions),
 * converti en euros approximativement.
 */

const TCGCSV = "https://tcgcsv.com/tcgplayer";
const JAPANESE_CATEGORY = 85;
/** Conversion indicative des prix TCGplayer (dollars) */
export const USD_TO_EUR = 0.92;

/** Groupes TCGplayer japonais sans le code TCGdex en tête du nom (avant 2011, jumeaux XY, SM1p…) */
const JAPANESE_GROUPS: Record<string, number> = {
  ADV1: 24129, ADV2: 24139, ADV3: 24128, ADV4: 24124, ADV5: 24119,
  E1: 23730, E2: 23731, E3: 23732, E4: 23733, E5: 23734,
  L1a: 24025, L1b: 24026, L2: 24021, L3: 24024, LL: 24022, MC: 24567,
  PCG1: 24117, PCG2: 24114, PCG3: 24135, PCG4: 24103, PCG5: 24101,
  PCG6: 24085, PCG7: 24084, PCG8: 24099, PCG9: 24090, PCG10: 24053,
  PMCG1: 23721, PMCG2: 23722, PMCG3: 23723, PMCG4: 23724, PMCG5: 23725, PMCG6: 23726,
  SM1p: 23880, SM2p: 23693, SM3p: 23694, SM4p: 23707, SM5p: 23695,
  VS1: 24180,
  XY11a: 23916, XY11b: 23917, XY1a: 23914, XY1b: 23915,
  XY5a: 23921, XY5b: 23922, XY8a: 23925, XY8b: 23926,
  neo1: 23727, neo2: 23728, neo3: 23720, neo4: 23729,
  web1: 24141,
};

type Row = Record<string, unknown>;
type Product = { productId: number; name: string; url?: string; extendedData?: { name: string; value: unknown }[] };
type PriceRow = { productId: number; marketPrice?: number | null; midPrice?: number | null; lowPrice?: number | null };

/** Exports en mémoire de l'instance : une journée, cinq minutes seulement pour un export qui n'a pas répondu */
const TTL_MS = 24 * 3600 * 1000;
const FAILED_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { until: number; rows: Row[] }>();

async function tcgcsv(path: string): Promise<Row[]> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.rows;
  let rows: Row[] | null = null;
  try {
    // Pas de cache de données Next : un export de set dépasse sa limite (2 Mo)
    const res = await fetch(`${TCGCSV}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      const json = (await res.json()) as { results?: unknown };
      rows = Array.isArray(json.results) ? json.results.filter((r): r is Row => !!r && typeof r === "object") : [];
    }
  } catch {
    rows = null;
  }
  cache.set(path, { until: Date.now() + (rows ? TTL_MS : FAILED_TTL_MS), rows: rows ?? [] });
  return rows ?? [];
}

/** Numéro comparable entre sources : « TG01 » ≡ « TG1 », « 083/080 » ≡ « 83 » */
function normNumber(n: string): string {
  const raw = n.split("/")[0].trim().toUpperCase();
  return raw.replace(/^([A-Z]*)0*(\d+)([A-Z]*)$/, "$1$2$3");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** Groupe TCGplayer d'un set japonais (identifiant TCGdex ou code Limitless), null si introuvable ou ambigu */
async function japaneseGroup(setId: string): Promise<number | null> {
  // Code Limitless « SM1+ » ≡ identifiant TCGdex « SM1p »
  const candidates = [...new Set([setId, setId.replace(/\+$/, "p")])];
  for (const id of candidates) if (JAPANESE_GROUPS[id]) return JAPANESE_GROUPS[id];
  // Extensions récentes : le nom du groupe commence par le code (« M2: Inferno X »)
  const groups = await tcgcsv(`${JAPANESE_CATEGORY}/groups`);
  for (const id of candidates) {
    const code = new RegExp(`^${escapeRe(id)}[:\\s]`, "i");
    const matches = groups.filter((g) => code.test(String(g.name ?? "")));
    if (matches.length === 1 && typeof matches[0].groupId === "number") return matches[0].groupId;
  }
  return null;
}

export type JapaneseTcgplayerPrice = { usd: number; eur: number; url: string };

/**
 * Cote TCGplayer d'une carte japonaise par set et numéro (« M2 », « 083 »),
 * null quand TCGplayer ne liste pas la carte ou qu'elle n'a aucun prix.
 */
export async function japaneseTcgplayerPrice(setId: string, localId: string): Promise<JapaneseTcgplayerPrice | null> {
  if (!setId || !localId) return null;
  const group = await japaneseGroup(setId);
  if (group == null) return null;
  const wanted = normNumber(localId);
  // Impression normale d'abord : « Charcadet - 083/080 » plutôt que « … (Master Ball) »
  let product: Product | null = null;
  for (const row of (await tcgcsv(`${JAPANESE_CATEGORY}/${group}/products`)) as Product[]) {
    const number = String(row.extendedData?.find((e) => e.name === "Number")?.value ?? "");
    if (!number || normNumber(number) !== wanted) continue;
    const variant = String(row.name ?? "").includes("(");
    if (!product || (!variant && String(product.name ?? "").includes("("))) product = row;
  }
  if (!product) return null;
  let usd: number | null = null;
  for (const row of (await tcgcsv(`${JAPANESE_CATEGORY}/${group}/prices`)) as PriceRow[]) {
    if (row.productId !== product.productId) continue;
    const picked = [row.marketPrice, row.midPrice, row.lowPrice].find((v): v is number => typeof v === "number" && v > 0);
    if (picked != null) usd = usd == null ? picked : Math.max(usd, picked);
  }
  if (usd == null) return null;
  return {
    usd: Math.round(usd * 100) / 100,
    eur: Math.round(usd * USD_TO_EUR * 100) / 100,
    url: typeof product.url === "string" && product.url ? product.url : `https://www.tcgplayer.com/product/${product.productId}`,
  };
}

/** Set et numéro d'un identifiant de carte (« SV4a-347 », « SV-P-001 ») */
export function splitCardId(id: string): { setId: string; localId: string } | null {
  const i = id.lastIndexOf("-");
  if (i <= 0 || i === id.length - 1) return null;
  return { setId: id.slice(0, i), localId: id.slice(i + 1) };
}
