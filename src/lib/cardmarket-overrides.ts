import OVERRIDES from "@/data/cardmarket-overrides.json";

/**
 * Corrige l'idProduct Cardmarket quand celui de TCGdex est faux. TCGdex a
 * mappé plusieurs cartes **Prime** de l'ère HGSS sur leur version banale du
 * même set (ex. Électrode Prime pointait sur l'Électrode commune à 0,29 €).
 * La table (`src/data/cardmarket-overrides.json`, `tcgdex_id → idProduct`) est
 * générée depuis le catalogue produits public de Cardmarket
 * (products_singles_6.json) : on garde, pour une carte Prime, le produit du
 * même set dont le nom porte « Prime ». Régénérer si de nouveaux cas apparaissent.
 */
const MAP = OVERRIDES as Record<string, number>;

export function overrideCardmarketId(
  tcgdexId: string | null | undefined,
  fallback: number | null | undefined
): number | null {
  if (tcgdexId && Object.prototype.hasOwnProperty.call(MAP, tcgdexId)) return MAP[tcgdexId];
  return fallback ?? null;
}
