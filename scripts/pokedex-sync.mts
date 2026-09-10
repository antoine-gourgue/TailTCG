/**
 * Synchronise le Pokédex national depuis PokéAPI :
 *  - table `pokedex` (numéro, noms FR/EN, types, génération)
 *  - artworks officiels convertis en WebP 512 px dans le bucket public
 *    « pokedex » (art/<id>.webp)
 *
 * Usage :  node scripts/pokedex-sync.mts [--from 1] [--to 1025] [--skip-images]
 * Lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local.
 * Idempotent : relançable, ne retélécharge pas les images déjà présentes.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const GRAPHQL = "https://beta.pokeapi.co/graphql/v1beta";
const ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const BUCKET = "pokedex";
const SIZE = 512;
const CONCURRENCY = 6;

// ---- Environnement --------------------------------------------------------
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY manquants (.env.local)");
  process.exit(1);
}
const args = process.argv.slice(2);
const argOf = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const FROM = argOf("--from", 1);
const TO = argOf("--to", 1025);
const SKIP_IMAGES = args.includes("--skip-images");

const db = createClient(url, key, { auth: { persistSession: false } });

// ---- Données --------------------------------------------------------------
type Raw = {
  id: number;
  generation_id: number;
  pokemon_v2_pokemonspeciesnames: { name: string; language_id: number }[];
  pokemon_v2_pokemons: { pokemon_v2_pokemontypes: { pokemon_v2_type: { name: string } }[] }[];
};
type Entry = { id: number; name_fr: string; name_en: string | null; types: string[]; generation: number };

async function fetchSpecies(): Promise<Entry[]> {
  const query = `query ($from: Int!, $to: Int!) {
    pokemon_v2_pokemonspecies(order_by: {id: asc}, where: {id: {_gte: $from, _lte: $to}}) {
      id
      generation_id
      pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: [5, 9]}}) { name language_id }
      pokemon_v2_pokemons(where: {is_default: {_eq: true}}) {
        pokemon_v2_pokemontypes(order_by: {slot: asc}) { pokemon_v2_type { name } }
      }
    }
  }`;
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { from: FROM, to: TO } }),
  });
  if (!res.ok) throw new Error(`PokéAPI ${res.status}`);
  const json = (await res.json()) as { data?: { pokemon_v2_pokemonspecies: Raw[] } };
  return (json.data?.pokemon_v2_pokemonspecies ?? []).map((s) => ({
    id: s.id,
    name_fr: s.pokemon_v2_pokemonspeciesnames.find((n) => n.language_id === 5)?.name ?? `#${s.id}`,
    name_en: s.pokemon_v2_pokemonspeciesnames.find((n) => n.language_id === 9)?.name ?? null,
    types: s.pokemon_v2_pokemons[0]?.pokemon_v2_pokemontypes.map((t) => t.pokemon_v2_type.name) ?? [],
    generation: s.generation_id,
  }));
}

// ---- Images ---------------------------------------------------------------
async function ensureBucket() {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/webp"],
  });
  if (error) throw new Error(`Bucket : ${error.message}`);
  console.log(`Bucket « ${BUCKET} » créé (public).`);
}

async function existingArt(): Promise<Set<string>> {
  const names = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage.from(BUCKET).list("art", { limit: 1000, offset });
    if (error) throw new Error(`Listing : ${error.message}`);
    for (const f of data ?? []) names.add(f.name);
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return names;
}

async function syncImage(id: number): Promise<"ok" | "skip" | "fail"> {
  const res = await fetch(ART(id));
  if (!res.ok) return "fail";
  const png = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(png)
    .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const { error } = await db.storage
    .from(BUCKET)
    .upload(`art/${id}.webp`, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
  return error ? "fail" : "ok";
}

// ---- Main -----------------------------------------------------------------
const species = await fetchSpecies();
console.log(`${species.length} espèces (${FROM}–${TO}) récupérées.`);

for (let i = 0; i < species.length; i += 200) {
  const chunk = species.slice(i, i + 200).map((e) => ({ ...e, updated_at: new Date().toISOString() }));
  const { error } = await db.from("pokedex").upsert(chunk, { onConflict: "id" });
  if (error) throw new Error(`Upsert : ${error.message}`);
}
console.log("Table pokedex à jour.");

if (!SKIP_IMAGES) {
  await ensureBucket();
  const have = await existingArt();
  const todo = species.filter((e) => !have.has(`${e.id}.webp`));
  console.log(`${todo.length} artworks à envoyer (${have.size} déjà présents).`);
  let done = 0;
  const failed: number[] = [];
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const e = queue.shift();
        if (!e) return;
        const r = await syncImage(e.id).catch(() => "fail" as const);
        if (r === "fail") failed.push(e.id);
        done++;
        if (done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
      }
    })
  );
  if (failed.length > 0) console.warn(`Échecs (${failed.length}) : ${failed.join(", ")}`);
}
console.log("Terminé.");
