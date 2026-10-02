/**
 * Lot de cartes à ajouter : la sélection d'un set part vers la page d'ajout
 * en lot (/ajouter/lot) par sessionStorage — gardée le temps de l'onglet,
 * elle survit à un rechargement de la page.
 */
export type BatchCard = {
  tcgdex_id: string;
  card_name: string;
  set_id: string;
  set_name: string;
  local_id: string;
  image_url: string;
  rarity: string | null;
  /** Cote Cardmarket à l'unité, repère pour les prix */
  price: number | null;
};

export type BatchDraft = {
  /** Langue des exemplaires (FR, JP…) */
  language: string;
  /** Retour vers la page d'origine (le set) */
  back: { href: string; label: string };
  cards: BatchCard[];
};

const KEY = "tailtcg-batch-add";

export function saveBatchDraft(draft: BatchDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {}
}

export function loadBatchDraft(): BatchDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    const draft = raw ? (JSON.parse(raw) as BatchDraft) : null;
    return draft && Array.isArray(draft.cards) && draft.cards.length > 0 ? draft : null;
  } catch {
    return null;
  }
}

export function clearBatchDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
