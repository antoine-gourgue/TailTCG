import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

/**
 * Une carte qui entre dans la collection prend la place de ses emplacements
 * « hors collection » dans les classeurs : chaque pochette qui attendait
 * cette carte TCGdex (binder_placeholders) devient la pochette de
 * l'exemplaire (même classeur, même position), et l'attente disparaît.
 * Plusieurs exemplaires ajoutés d'un coup se répartissent un par pochette
 * dans un même classeur. Renvoie les classeurs touchés (revalidation).
 * Portée par le RLS : seuls les classeurs de l'appelant sont concernés.
 */
export async function adoptPlaceholders(
  db: Db,
  items: { id: string; tcgdex_id: string }[]
): Promise<string[]> {
  const byCard = new Map<string, string[]>();
  for (const it of items) {
    // Les cartes perso ne peuvent pas être attendues dans un classeur
    if (!it.tcgdex_id || it.tcgdex_id.startsWith("custom:")) continue;
    byCard.set(it.tcgdex_id, [...(byCard.get(it.tcgdex_id) ?? []), it.id]);
  }
  if (byCard.size === 0) return [];

  const { data: wanted } = await db
    .from("binder_placeholders")
    .select("id, binder_id, tcgdex_id, position")
    .in("tcgdex_id", [...byCard.keys()]);
  if (!wanted || wanted.length === 0) return [];

  // Un exemplaire par pochette dans un même classeur ; un même exemplaire
  // peut en revanche occuper une pochette dans plusieurs classeurs
  const usedInBinder = new Map<string, Set<string>>();
  const links: { binder_id: string; item_id: string; position: number }[] = [];
  const adopted: string[] = [];
  for (const w of wanted) {
    const used = usedInBinder.get(w.binder_id) ?? new Set<string>();
    const itemId = (byCard.get(w.tcgdex_id) ?? []).find((id) => !used.has(id));
    if (!itemId) continue;
    used.add(itemId);
    usedInBinder.set(w.binder_id, used);
    links.push({ binder_id: w.binder_id, item_id: itemId, position: w.position });
    adopted.push(w.id);
  }
  if (links.length === 0) return [];

  // L'exemplaire prend la pochette d'abord, l'attente est retirée ensuite :
  // en cas d'échec au milieu, la carte reste visible dans le classeur
  const { error } = await db
    .from("binder_items")
    .upsert(links, { onConflict: "binder_id,item_id", ignoreDuplicates: true });
  if (error) {
    console.error("adoptPlaceholders:", error.message);
    return [];
  }
  await db.from("binder_placeholders").delete().in("id", adopted);
  return [...new Set(links.map((l) => l.binder_id))];
}
