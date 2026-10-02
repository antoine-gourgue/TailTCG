"use server";

import { randomUUID } from "node:crypto";
import { addCardUrl } from "@/lib/scan/url";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adoptPlaceholders } from "@/lib/binder-adopt";
import { snapshotPrices } from "@/lib/cardmarket";
import { fetchCardRarity } from "@/lib/tcgdex";
import { geocodeAddress } from "@/lib/geocode";
import {
  CONDITION_CODES,
  SOURCE_KIND_VALUES,
  GEOCODED_KINDS,
  type ConditionCode,
  type SourceKind,
} from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

export type ItemFormState = { message: string } | null;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

function parseItemFields(formData: FormData): {
  fields?: Omit<ItemInsert, "tcgdex_id" | "card_name" | "set_name" | "set_id" | "local_id" | "image_url">;
  error?: string;
} {
  const condition = str(formData, "condition");
  if (!CONDITION_CODES.includes(condition as ConditionCode)) {
    return { error: "Choisis un état." };
  }

  const quantity = Number.parseInt(str(formData, "quantity") || "1", 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "La quantité doit être un entier ≥ 1." };
  }

  const priceRaw = str(formData, "purchase_price").replace(",", ".");
  const purchase_price = priceRaw === "" ? null : Number.parseFloat(priceRaw);
  if (purchase_price !== null && (Number.isNaN(purchase_price) || purchase_price < 0)) {
    return { error: "Prix payé invalide." };
  }

  const manualRaw = str(formData, "manual_price").replace(",", ".");
  const manual_price = manualRaw === "" ? null : Number.parseFloat(manualRaw);
  if (manual_price !== null && (Number.isNaN(manual_price) || manual_price < 0)) {
    return { error: "Cote perso invalide." };
  }

  return {
    fields: {
      condition,
      quantity,
      purchase_price,
      manual_price,
      purchase_date: strOrNull(formData, "purchase_date"),
      card_type: strOrNull(formData, "card_type"),
      language: str(formData, "language") || "FR",
      source_id: strOrNull(formData, "source_id"),
      graded: formData.get("graded") === "on",
      grade: strOrNull(formData, "grade"),
      notes: strOrNull(formData, "notes"),
    },
  };
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const { fields, error } = parseItemFields(formData);
  if (error || !fields) return { message: error ?? "Formulaire invalide." };

  const tcgdex_id = str(formData, "tcgdex_id");
  const set_id = str(formData, "set_id");
  const image_url = str(formData, "image_url");
  const card_name = str(formData, "card_name");
  const set_name = str(formData, "set_name");
  const local_id = str(formData, "local_id");
  if (!tcgdex_id || !card_name || !set_id || !set_name || !local_id) {
    return { message: "Données de carte manquantes, repasse par la recherche." };
  }

  const supabase = await createClient();

  // Un visuel « storage: » ne peut référencer qu'une carte perso de
  // l'appelant (audit — sinon signature d'un fichier d'un autre compte)
  if (image_url.startsWith("storage:")) {
    const { data: own } = await supabase
      .from("custom_cards")
      .select("id")
      .eq("image_path", image_url.slice("storage:".length))
      .maybeSingle();
    if (!own) return { message: "Visuel invalide." };
  }

  // Rareté intrinsèque (TCGdex), posée automatiquement — pas un choix utilisateur
  const rarity = await fetchCardRarity(tcgdex_id);
  const { data: created, error: dbError } = await supabase
    .from("items")
    .insert({
      ...fields,
      tcgdex_id,
      card_name,
      set_id,
      set_name,
      local_id,
      image_url,
      rarity,
    })
    .select("id")
    .single();

  if (dbError || !created) {
    console.error("createItem:", dbError?.message);
    return { message: "Enregistrement impossible, réessaie." };
  }

  if (fields.manual_price != null) {
    await recordValue(supabase, created.id, fields.manual_price);
  }

  // Trouvée ! Elle sort automatiquement des recherchées, et prend la place
  // de ses pochettes « hors collection » dans les classeurs
  const [, binders] = await Promise.all([
    supabase.from("wishlist").delete().eq("tcgdex_id", tcgdex_id),
    adoptPlaceholders(supabase, [{ id: created.id, tcgdex_id }]),
  ]);
  revalidateBinders(binders);

  // Cote Cardmarket tout de suite (sinon la carte n'a de valeur qu'au cron du lendemain)
  await snapshotPrices([tcgdex_id], { japanese: fields.language === "JP" });

  revalidatePath("/cartes");
  revalidatePath("/wishlist");

  // Carte scannée depuis le téléphone : on la marque ajoutée et on enchaîne
  // sur la suivante de la session, puis sur le récapitulatif
  const scanId = strOrNull(formData, "scan_id");
  if (scanId) {
    const { data: scan } = await supabase
      .from("capture_scans")
      .update({ status: "added", item_id: created.id })
      .eq("id", scanId)
      .select("session_id")
      .maybeSingle();
    if (scan) {
      const { data: next } = await supabase
        .from("capture_scans")
        .select("id, tcgdex_id, lang")
        .eq("session_id", scan.session_id)
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      revalidatePath(`/scan/${scan.session_id}`);
      redirect(next ? addCardUrl({ id: next.tcgdex_id, lang: next.lang, scan: next.id }) : `/scan/${scan.session_id}`);
    }
  }
  redirect("/cartes");
}

/** Classeurs dont une pochette « hors collection » vient d'être remplacée */
function revalidateBinders(binderIds: string[]) {
  if (binderIds.length === 0) return;
  revalidatePath("/classeurs");
  for (const id of binderIds) revalidatePath(`/classeurs/${id}`);
}

// Historise la valeur estimée du jour (la dernière saisie du jour gagne)
async function recordValue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  value: number
) {
  await supabase.from("item_value_history").upsert(
    {
      item_id: itemId,
      value,
      recorded_at: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "item_id,recorded_at" }
  );
}

export async function updateItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const id = str(formData, "item_id");
  if (!id) return { message: "Exemplaire introuvable." };

  const { fields, error } = parseItemFields(formData);
  if (error || !fields) return { message: error ?? "Formulaire invalide." };

  // Cartes manuelles : nom/set/numéro également éditables
  const card_name = strOrNull(formData, "card_name");
  const metaFields =
    card_name != null
      ? {
          card_name,
          set_name: str(formData, "set_name") || "—",
          local_id: str(formData, "local_id") || "—",
        }
      : {};

  const supabase = await createClient();
  // Éditer une carte lève le drapeau « à compléter » (ajout en masse)
  const { error: dbError } = await supabase
    .from("items")
    .update({ ...fields, ...metaFields, needs_review: false })
    .eq("id", id);

  if (dbError) {
    console.error("updateItem:", dbError.message);
    return { message: "Mise à jour impossible, réessaie." };
  }

  if (fields.manual_price != null) {
    await recordValue(supabase, id, fields.manual_price);
  }

  revalidatePath("/cartes");
  revalidatePath(`/carte/${id}`);
  redirect(`/carte/${id}`);
}

/** Carte d'un set pour l'ajout en masse (métadonnées catalogue) */
export type BulkCard = {
  tcgdex_id: string;
  card_name: string;
  set_id: string;
  set_name: string;
  local_id: string;
  image_url: string;
  /** Rareté connue de l'appelant (page set) ; sinon relevée sur TCGdex */
  rarity?: string | null;
};

/** Rareté intrinsèque (TCGdex) par identifiant, relevée pour les cartes qui ne l'ont pas déjà */
async function raritiesFor(cards: BulkCard[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const c of cards) if (c.rarity != null) map.set(c.tcgdex_id, c.rarity);
  const need = [
    ...new Set(cards.map((c) => c.tcgdex_id).filter((id) => !map.has(id) && !id.startsWith("custom:"))),
  ].slice(0, 60);
  const CHUNK = 6;
  for (let i = 0; i < need.length; i += CHUNK) {
    await Promise.all(
      need.slice(i, i + CHUNK).map(async (id) => {
        map.set(id, await fetchCardRarity(id).catch(() => null));
      })
    );
  }
  return map;
}

/**
 * Ajoute plusieurs cartes d'un coup depuis un set : chaque exemplaire est
 * créé avec des valeurs minimales (quantité 1, langue du catalogue, état
 * « quasi parfaite ») et marqué « à compléter » jusqu'à sa première édition.
 */
export async function bulkAddToCollection(cards: BulkCard[], language: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté", added: 0, items: [] };

  const clean = cards
    .filter(
      (c) => c.tcgdex_id && c.card_name && c.set_id && c.set_name && c.local_id
    )
    .slice(0, 500);
  if (clean.length === 0) return { error: null, added: 0, items: [] };

  const { LANGUAGES } = await import("@/lib/domain");
  const lang = (LANGUAGES as readonly string[]).includes(language)
    ? language
    : "FR";

  const rarityById = await raritiesFor(clean);
  const rows: ItemInsert[] = clean.map((c) => ({
    tcgdex_id: c.tcgdex_id,
    card_name: c.card_name,
    set_id: c.set_id,
    set_name: c.set_name,
    local_id: c.local_id,
    // On ne stocke jamais un chemin « storage: » par ce chemin en masse
    image_url: c.image_url?.startsWith("storage:") ? "" : c.image_url ?? "",
    condition: "NM",
    language: lang,
    quantity: 1,
    rarity: rarityById.get(c.tcgdex_id) ?? null,
    needs_review: true,
  }));

  const { data: created, error } = await supabase
    .from("items")
    .insert(rows)
    .select("id, tcgdex_id");
  if (error) {
    console.error("bulkAddToCollection:", error.message);
    return { error: "Ajout impossible, réessaie.", added: 0, items: [] };
  }

  // Ces cartes sortent des recherchées et prennent la place de leurs
  // pochettes « hors collection » dans les classeurs
  const [, binders] = await Promise.all([
    supabase
      .from("wishlist")
      .delete()
      .in(
        "tcgdex_id",
        clean.map((c) => c.tcgdex_id)
      ),
    adoptPlaceholders(supabase, created ?? []),
  ]);
  revalidateBinders(binders);

  // Cote Cardmarket tout de suite pour les cartes ajoutées
  await snapshotPrices(
    (created ?? []).map((c) => c.tcgdex_id),
    { japanese: lang === "JP" }
  );

  revalidatePath("/cartes");
  revalidatePath("/wishlist");
  return { error: null, added: clean.length, items: created ?? [] };
}

export type BatchRow = BulkCard & {
  condition: string;
  quantity: number;
  /** Prix payé à l'unité */
  purchase_price: number | null;
  /** Valeur estimée à l'unité ; null = suit la cote */
  manual_price: number | null;
  /** Propres à la carte ; absents = ceux du lot */
  purchase_date?: string | null;
  source_id?: string | null;
  notes?: string | null;
};
export type BatchCommon = {
  language: string;
  purchase_date: string | null;
  source_id: string | null;
};

const price = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

/**
 * Ajout en lot depuis la page dédiée (sélection d'un set) : chaque carte
 * arrive avec son état, sa quantité, son prix payé et sa valeur, renseignés
 * carte par carte — rien n'est « à compléter » ensuite. Langue, date d'achat
 * et boutique valent pour tout le lot.
 */
export async function addBatchToCollection(
  cards: BatchRow[],
  common: BatchCommon
): Promise<{ error: string | null; added: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté", added: 0 };

  const clean = cards
    .filter((c) => c.tcgdex_id && c.card_name && c.set_id && c.set_name && c.local_id)
    .slice(0, 500);
  if (clean.length === 0) return { error: "Aucune carte à ajouter.", added: 0 };

  const { LANGUAGES } = await import("@/lib/domain");
  const language = (LANGUAGES as readonly string[]).includes(common.language) ? common.language : "FR";
  const dateOf = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  // Provenances : seulement les siennes (la RLS ne laisse voir que celles-là)
  const wanted = [...new Set([common.source_id, ...clean.map((c) => c.source_id)].filter((s): s is string => !!s))];
  const own = new Set<string>();
  if (wanted.length > 0) {
    const { data } = await supabase.from("sources").select("id").in("id", wanted);
    for (const s of data ?? []) own.add(s.id);
  }
  const sourceOf = (s: string | null | undefined) => (s && own.has(s) ? s : null);
  const lotDate = dateOf(common.purchase_date);
  const lotSource = sourceOf(common.source_id);

  const rarityById = await raritiesFor(clean);
  const rows: ItemInsert[] = clean.map((c) => ({
    tcgdex_id: c.tcgdex_id,
    card_name: c.card_name,
    set_id: c.set_id,
    set_name: c.set_name,
    local_id: c.local_id,
    image_url: c.image_url?.startsWith("storage:") ? "" : c.image_url ?? "",
    condition: CONDITION_CODES.includes(c.condition as ConditionCode) ? c.condition : "NM",
    language,
    quantity: Number.isInteger(c.quantity) && c.quantity >= 1 ? Math.min(c.quantity, 99) : 1,
    purchase_price: price(c.purchase_price),
    manual_price: price(c.manual_price),
    purchase_date: dateOf(c.purchase_date) ?? lotDate,
    source_id: sourceOf(c.source_id) ?? lotSource,
    notes: c.notes?.trim().slice(0, 1000) || null,
    rarity: rarityById.get(c.tcgdex_id) ?? null,
    needs_review: false,
  }));

  const { data: created, error } = await supabase
    .from("items")
    .insert(rows)
    .select("id, tcgdex_id, manual_price");
  if (error) {
    console.error("addBatchToCollection:", error.message);
    return { error: "Ajout impossible, réessaie.", added: 0 };
  }

  // Valeurs saisies : premier point de leur historique ; les cartes sortent
  // des recherchées et prennent leurs pochettes « hors collection »
  const [, , binders] = await Promise.all([
    Promise.all(
      (created ?? []).filter((c) => c.manual_price != null).map((c) => recordValue(supabase, c.id, c.manual_price!))
    ),
    supabase
      .from("wishlist")
      .delete()
      .in(
        "tcgdex_id",
        clean.map((c) => c.tcgdex_id)
      ),
    adoptPlaceholders(supabase, created ?? []),
  ]);
  revalidateBinders(binders);

  await snapshotPrices(
    (created ?? []).map((c) => c.tcgdex_id),
    { japanese: language === "JP" }
  );

  revalidatePath("/cartes");
  revalidatePath("/collection");
  revalidatePath("/wishlist");
  return { error: null, added: rows.length };
}

/** Suppression douce en masse : les exemplaires partent à la corbeille */
export async function bulkDeleteItems(ids: string[]) {
  const clean = [...new Set(ids)].filter(Boolean).slice(0, 1000);
  if (clean.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", clean)
    .is("deleted_at", null);
  if (error) {
    console.error("bulkDeleteItems:", error.message);
    return { error: "Suppression impossible, réessaie.", count: 0 };
  }
  revalidatePath("/cartes");
  return { error: null, count: clean.length };
}

export type QuickValueState = { ok: boolean; message?: string } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Actualisation rapide de la valeur estimée depuis la fiche (point daté)
export async function updateItemValue(
  _prev: QuickValueState,
  formData: FormData
): Promise<QuickValueState> {
  const id = str(formData, "item_id");
  if (!id) return { ok: false, message: "Exemplaire introuvable." };

  const raw = str(formData, "value").replace(",", ".");
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value) || value < 0) {
    return { ok: false, message: "Valeur invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ manual_price: value })
    .eq("id", id);
  if (error) {
    console.error("updateItemValue:", error.message);
    return { ok: false, message: "Impossible, réessaie." };
  }

  await recordValue(supabase, id, value);

  revalidatePath("/cartes");
  revalidatePath(`/carte/${id}`);
  return { ok: true };
}

/**
 * Réévaluation en masse (page /cartes/reevaluer) : nouvelle valeur estimée à
 * l'unité par exemplaire, un point daté du jour chacun — une valeur gardée
 * telle quelle compte aussi comme réévaluée. RLS : seuls les exemplaires de
 * l'utilisateur sont touchés.
 */
export async function revalueItems(
  rows: { id: string; value: number }[]
): Promise<{ error: string | null; count: number }> {
  const clean = new Map<string, number>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.id !== "string" || !UUID_RE.test(r.id)) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      return { error: "Une valeur est invalide.", count: 0 };
    }
    clean.set(r.id, Math.round(v * 100) / 100);
  }
  if (clean.size === 0) return { error: "Aucune valeur à enregistrer.", count: 0 };
  if (clean.size > 500) return { error: "500 cartes au plus à la fois.", count: 0 };

  const supabase = await createClient();
  const entries = [...clean];
  const done: string[] = [];
  for (let i = 0; i < entries.length; i += 20) {
    const results = await Promise.all(
      entries.slice(i, i + 20).map(([id, value]) =>
        supabase.from("items").update({ manual_price: value }).eq("id", id).select("id")
      )
    );
    for (const { data, error } of results) {
      if (error) console.error("revalueItems:", error.message);
      for (const row of data ?? []) done.push(row.id);
    }
  }
  if (done.length === 0) return { error: "Mise à jour impossible, réessaie.", count: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const { error: histError } = await supabase.from("item_value_history").upsert(
    done.map((id) => ({ item_id: id, value: clean.get(id)!, recorded_at: today })),
    { onConflict: "item_id,recorded_at" }
  );
  if (histError) console.error("revalueItems (historique):", histError.message);

  revalidatePath("/cartes");
  revalidatePath("/collection");
  for (const id of done) revalidatePath(`/carte/${id}`);
  return { error: null, count: done.length };
}

export type SellState = { ok: boolean; message?: string } | null;

// Marque un exemplaire vendu (il sort de la collection active)
export async function markItemSold(
  _prev: SellState,
  formData: FormData
): Promise<SellState> {
  const id = str(formData, "item_id");
  if (!id) return { ok: false, message: "Exemplaire introuvable." };

  const raw = str(formData, "sold_price").replace(",", ".");
  const sold_price = Number.parseFloat(raw);
  if (Number.isNaN(sold_price) || sold_price < 0) {
    return { ok: false, message: "Prix de vente invalide." };
  }
  const sold_at =
    strOrNull(formData, "sold_at") ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ sold_price, sold_at })
    .eq("id", id);
  if (error) {
    console.error("markItemSold:", error.message);
    return { ok: false, message: "Impossible, réessaie." };
  }

  revalidatePath("/cartes");
  revalidatePath(`/carte/${id}`);
  return { ok: true };
}

// Annule une vente : l'exemplaire revient dans la collection active
export async function cancelSale(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("items")
    .update({ sold_price: null, sold_at: null })
    .eq("id", id);
  revalidatePath("/cartes");
  revalidatePath(`/carte/${id}`);
}

// Supprime un relevé de valeur erroné et recale la valeur actuelle de la
// carte sur le dernier relevé restant
export async function deleteValuePoint(formData: FormData): Promise<void> {
  const pointId = str(formData, "point_id");
  if (!pointId) return;

  const supabase = await createClient();
  // La RLS garantit que le relevé m'appartient
  const { data: point } = await supabase
    .from("item_value_history")
    .select("id, item_id")
    .eq("id", pointId)
    .single();
  if (!point) return;

  await supabase.from("item_value_history").delete().eq("id", pointId);

  const { data: latest } = await supabase
    .from("item_value_history")
    .select("value")
    .eq("item_id", point.item_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("items")
    .update({ manual_price: latest?.value ?? null })
    .eq("id", point.item_id);

  revalidatePath("/cartes");
  revalidatePath(`/carte/${point.item_id}`);
}

// Suppression douce : l'exemplaire part à la corbeille (Paramètres),
// restaurable pendant 30 jours avant purge automatique par le cron
export async function deleteItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/cartes");
  redirect(`/cartes?deleted=${id}`);
}

export async function restoreItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("items").update({ deleted_at: null }).eq("id", id);

  revalidatePath("/cartes");
  revalidatePath("/parametres");
}

/** Corbeille : suppression définitive (photos et historique compris) */
export async function purgeItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", id).not("deleted_at", "is", null);

  revalidatePath("/parametres");
}

/** Enregistre une pré-gradation (atelier guidé de la fiche carte).
 * FormData pour transporter le visuel redressé (calque carte). */
export async function saveGrading(formData: FormData) {
  const itemId = str(formData, "item_id");
  if (!itemId) return { error: "Carte manquante" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  // L'exemplaire doit appartenir à l'appelant avant tout upload (audit)
  const { data: owned } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();
  if (!owned) return { error: "Exemplaire introuvable" };

  const num = (k: string) => Number.parseInt(str(formData, k), 10);

  // Visuels redressés (recto/verso) : bucket privé, comme les photos perso.
  // Chemin en UUID aléatoire (pas d'itemId brut), taille et type validés.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  async function uploadRectified(field: string): Promise<string | null> {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) return null;
    if (file.size > 5_000_000 || !file.type.startsWith("image/")) return null;
    // WebP depuis l'atelier (plus léger), JPEG toléré pour les anciens clients
    const webp = file.type === "image/webp";
    const path = `${user!.id}/gradings/${randomUUID()}.${webp ? "webp" : "jpg"}`;
    const { error: upError } = await admin.storage
      .from("card-photos")
      .upload(path, file, { contentType: webp ? "image/webp" : "image/jpeg" });
    return upError ? null : path;
  }

  const rectified_path = await uploadRectified("rectified");
  const rectified_verso_path = await uploadRectified("rectified_verso");

  // Prises faites au scan : elles rejoignent la galerie de la carte (recto, verso)
  if (str(formData, "attach_photos") === "1") {
    const { count } = await admin.from("item_photos").select("id", { count: "exact", head: true }).eq("item_id", itemId);
    const rows = [
      rectified_path && { path: rectified_path, label: "Recto (scan)" },
      rectified_verso_path && { path: rectified_verso_path, label: "Verso (scan)" },
    ].filter((r): r is { path: string; label: string } => !!r);
    if (rows.length > 0) {
      await admin.from("item_photos").insert(rows.map((r, i) => ({ owner_id: user!.id, item_id: itemId, path: r.path, label: r.label, position: (count ?? 0) + i })));
    }
  }

  const { error } = await supabase.from("item_gradings").insert({
    item_id: itemId,
    centering: num("centering"),
    corners: num("corners"),
    edges: num("edges"),
    surface: num("surface"),
    grade: num("grade"),
    ratios: JSON.parse(str(formData, "ratios") || "null"),
    details: JSON.parse(str(formData, "details") || "null"),
    rectified_path,
    rectified_verso_path,
  });

  revalidatePath(`/carte/${itemId}`);
  revalidatePath("/pregrades");
  return { error: error?.message ?? null };
}

export type SourceOption = {
  id: string;
  name: string;
  kind: SourceKind;
  city: string | null;
  url: string | null;
};

export async function createSource(input: {
  name: string;
  kind: SourceKind;
  address?: string;
  city?: string;
  url?: string;
}): Promise<{ source?: SourceOption; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Le nom est obligatoire." };
  if (!SOURCE_KIND_VALUES.includes(input.kind)) {
    return { error: "Type de source invalide." };
  }

  const address = input.address?.trim() || null;
  const city = input.city?.trim() || null;

  // Boutique physique : géocodée à l'enregistrement (Nominatim, 1 requête)
  const coords =
    GEOCODED_KINDS.includes(input.kind) ? await geocodeAddress(address, city) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .insert({
      name,
      kind: input.kind,
      address,
      city,
      url: input.url?.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    .select("id, name, kind, city, url")
    .single();

  if (error || !data) {
    return { error: `Création impossible : ${error?.message ?? "inconnue"}` };
  }

  return { source: data as SourceOption };
}
