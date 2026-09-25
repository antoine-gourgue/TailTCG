"use server";

import { revalidatePath } from "next/cache";
import { bulkAddToCollection } from "@/app/items/actions";
import { isScanLang, ITEM_LANGUAGE } from "@/lib/scan/url";
import type { ScanCandidate } from "@/lib/scan";

export type AddedCard = { id: string; tcgdex_id: string; card_name: string; set_name: string; local_id: string; image_url: string };

/**
 * La carte scannée n'est pas dans la collection : on l'ajoute comme le scan
 * rapide (quasi parfaite, quantité 1, langue du visuel, à compléter), pour
 * enchaîner tout de suite sur la pré-gradation.
 */
export async function addRecognizedCard(c: ScanCandidate): Promise<{ item: AddedCard | null; error: string | null }> {
  const language = isScanLang(c.lang) ? ITEM_LANGUAGE[c.lang] : "FR";
  const res = await bulkAddToCollection(
    [{ tcgdex_id: c.id, card_name: c.name, set_id: c.setId, set_name: c.setName, local_id: c.localId, image_url: c.image }],
    language,
  );
  const it = res.items[0] as { id: string } | undefined;
  if (res.error || !it) return { item: null, error: res.error ?? "Ajout impossible" };
  revalidatePath("/");
  revalidatePath("/pregrades");
  return { item: { id: it.id, tcgdex_id: c.id, card_name: c.name, set_name: c.setName, local_id: c.localId, image_url: c.image }, error: null };
}
