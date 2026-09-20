/**
 * Sets que TCGdex sépare mais que l'app présente en un seul, comme
 * Pokécardex et Cardmarket : la Collection Classique des 30 ans fait partie
 * de l'extension 30ᵉ Anniversaire (191 cartes en tout). Les cartes du set
 * enfant gardent leur identifiant TCGdex (30th-c-001…) ; seul leur numéro
 * affiché est préfixé pour ne pas se confondre avec ceux du set parent.
 */
export const MERGED_INTO: Record<string, string> = { "30th-c": "30th" };
export const MERGED_CHILDREN: Record<string, string[]> = { "30th": ["30th-c"] };
/** Préfixe du numéro affiché des cartes d'un set enfant (Collection Classique → C001) */
export const MERGED_PREFIX: Record<string, string> = { "30th-c": "C" };

/**
 * Numéros imprimés des cartes de la Collection Classique (leur numéro
 * d'origine, comme sur Pokécardex et sur la carte elle-même) ; TCGdex les
 * numérote 001–030 dans l'ordre de ces numéros.
 */
export const MERGED_NUMBERS: Record<string, string> = {
  "30th-c-001": "4/102",
  "30th-c-002": "5/109",
  "30th-c-003": "11/113",
  "30th-c-004": "11/101",
  "30th-c-005": "18/132",
  "30th-c-006": "19/109",
  "30th-c-007": "25/111",
  "30th-c-008": "33/181",
  "30th-c-009": "41/122",
  "30th-c-010": "43/146",
  "30th-c-011": "47/127",
  "30th-c-012": "50/185",
  "30th-c-013": "57/111",
  "30th-c-014": "58/102",
  "30th-c-015": "69/132",
  "30th-c-016": "85/124",
  "30th-c-017": "89/149",
  "30th-c-018": "94/102",
  "30th-c-019": "99/102",
  "30th-c-020": "100/102",
  "30th-c-021": "101/101",
  "30th-c-022": "106/106",
  "30th-c-023": "106/160",
  "30th-c-024": "106/105",
  "30th-c-025": "108/115",
  "30th-c-026": "114/264",
  "30th-c-027": "123/172",
  "30th-c-028": "138/202",
  "30th-c-029": "149/147",
  "30th-c-030": "203/193",
};
/** Numéro affiché d'une carte : son numéro imprimé si le set est fusionné, sinon le numéro TCGdex */
export function displayLocalId(id: string, localId: string): string {
  if (MERGED_NUMBERS[id]) return MERGED_NUMBERS[id];
  const set = Object.keys(MERGED_PREFIX).find((k) => id.startsWith(`${k}-`));
  return set ? `${MERGED_PREFIX[set]}${localId}` : localId;
}
