import { SET_POOLS } from "@/data/sets";

/**
 * Cartes tirables d'un set, embarquées dans le dépôt (générées par
 * `scripts/playable-sets.mjs`) : le jeu n'a plus besoin de TCGdex au moment
 * d'ouvrir un booster ni d'afficher un set, ce qui en prod échouait
 * (« Set introuvable ») dès que l'API ralentissait ou limitait Vercel.
 */
export type PoolCard = {
  id: string;
  localId: string;
  name: string;
  /** Base d'image SANS extension (ajouter /low.webp…) */
  image: string;
  rarity: string | null;
};
export type SetPool = { id: string; name: string; serie: string; cards: PoolCard[] };

const SET_ID = /^[a-z0-9.\-]{1,40}$/i;

/** Le set embarqué, ou null s'il n'est pas dans l'instantané */
export async function loadSetPool(id: string): Promise<SetPool | null> {
  if (!SET_ID.test(id)) return null;
  const loader = SET_POOLS[id];
  if (!loader) return null;
  try {
    return (await loader()).default as SetPool;
  } catch {
    return null;
  }
}
