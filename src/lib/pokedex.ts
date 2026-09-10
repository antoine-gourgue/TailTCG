/**
 * Pokédex national : référentiel en table `pokedex` (rempli par
 * scripts/pokedex-sync.mts depuis PokéAPI), artworks dans le bucket public
 * « pokedex ». Dans un classeur, un Pokémon occupe une pochette comme carte
 * « hors collection » (binder_placeholders) avec tcgdex_id `pokedex:<n>` —
 * il n'entre jamais dans la collection.
 */

export type PokedexEntry = { id: number; name: string; types: string[]; generation: number };

export const POKEDEX_PREFIX = "pokedex:";
export const POKEDEX_SET_NAME = "Pokédex";

/** Numéro national derrière un tcgdex_id `pokedex:<n>`, sinon null */
export function pokedexIdOf(tcgdexId: string | null | undefined): number | null {
  if (!tcgdexId?.startsWith(POKEDEX_PREFIX)) return null;
  const n = Number(tcgdexId.slice(POKEDEX_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Artwork officiel (WebP 512 px) servi par le bucket public */
export function artworkUrl(id: number): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pokedex/art/${id}.webp`;
}

/** N° de Pokédex sur 4 chiffres (1025 espèces) */
export const dexNumber = (id: number) => String(id).padStart(4, "0");

export const GENERATIONS: { gen: number; region: string }[] = [
  { gen: 1, region: "Kanto" },
  { gen: 2, region: "Johto" },
  { gen: 3, region: "Hoenn" },
  { gen: 4, region: "Sinnoh" },
  { gen: 5, region: "Unys" },
  { gen: 6, region: "Kalos" },
  { gen: 7, region: "Alola" },
  { gen: 8, region: "Galar" },
  { gen: 9, region: "Paldea" },
];

export const generationLabel = (gen: number) => {
  const g = GENERATIONS.find((x) => x.gen === gen);
  return g ? `Génération ${g.gen} · ${g.region}` : `Génération ${gen}`;
};

export const TYPE_FR: Record<string, string> = {
  normal: "Normal",
  fire: "Feu",
  water: "Eau",
  electric: "Électrik",
  grass: "Plante",
  ice: "Glace",
  fighting: "Combat",
  poison: "Poison",
  ground: "Sol",
  flying: "Vol",
  psychic: "Psy",
  bug: "Insecte",
  rock: "Roche",
  ghost: "Spectre",
  dragon: "Dragon",
  dark: "Ténèbres",
  steel: "Acier",
  fairy: "Fée",
};

export const TYPE_COLOR: Record<string, string> = {
  normal: "#a8a77a",
  fire: "#ee8130",
  water: "#6390f0",
  electric: "#f7d02c",
  grass: "#7ac74c",
  ice: "#96d9d6",
  fighting: "#c22e28",
  poison: "#a33ea1",
  ground: "#e2bf65",
  flying: "#a98ff3",
  psychic: "#f95587",
  bug: "#a6b91a",
  rock: "#b6a136",
  ghost: "#735797",
  dragon: "#6f35fc",
  dark: "#705746",
  steel: "#b7b7ce",
  fairy: "#d685ad",
};

/** minuscules sans accents, pour la recherche par nom */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Filtre nom (sans accents) ou numéro (avec ou sans zéros) */
export function matchPokemon(p: PokedexEntry, needle: string): boolean {
  if (!needle) return true;
  const n = needle.trim();
  if (/^\d+$/.test(n)) return p.id === Number(n) || dexNumber(p.id).startsWith(n);
  return normalizeName(p.name).includes(normalizeName(n));
}
