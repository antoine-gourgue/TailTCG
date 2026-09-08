"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createBinder(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binders")
    .insert({ name })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Création impossible");

  revalidatePath("/classeurs");
  // Étape suivante de la création : choisir le design dans l'éditeur
  redirect(`/classeurs/${data.id}/editeur`);
}

export async function renameBinder(formData: FormData) {
  const binderId = String(formData.get("binder_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!binderId || !name) return;

  const supabase = await createClient();
  await supabase.from("binders").update({ name }).eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
}

export async function deleteBinder(formData: FormData) {
  const binderId = String(formData.get("binder_id") ?? "");
  if (!binderId) return;

  const supabase = await createClient();
  await supabase.from("binders").delete().eq("id", binderId);

  revalidatePath("/classeurs");
  redirect("/classeurs");
}

export async function addItemsToBinder(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };

  const supabase = await createClient();
  // Chaque nouvelle carte prend la pochette suivante ; celles déjà rangées
  // gardent la leur
  const [{ data: links }, { data: wanted }] = await Promise.all([
    supabase.from("binder_items").select("item_id, position").eq("binder_id", binderId),
    supabase.from("binder_placeholders").select("position").eq("binder_id", binderId),
  ]);
  const present = new Set((links ?? []).map((l) => l.item_id));
  let pocket =
    Math.max(
      -1,
      ...(links ?? []).map((l) => l.position ?? -1),
      ...(wanted ?? []).map((w) => w.position)
    ) + 1;
  const fresh = [...new Set(itemIds)].filter((id) => !present.has(id));
  if (fresh.length === 0) return { error: null };

  const { error } = await supabase.from("binder_items").insert(
    fresh.map((item_id) => ({ binder_id: binderId, item_id, position: pocket++ }))
  );

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/**
 * Crée un classeur reprenant tout un set, dans l'ordre des numéros : les
 * cartes possédées remplissent leur pochette, les manquantes deviennent des
 * cartes « hors collection » (placeholders) — la complétion se voit dans les
 * pages. Redirige vers le classeur créé.
 */
export async function createBinderFromSet(setId: string, lang: "fr" | "ja") {
  if (!setId) return { error: "Set manquant" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { getSet } = await import("@/lib/tcgdex");
  const set = await getSet(setId, lang);
  if (!set || (set.cards ?? []).length === 0) return { error: "Set introuvable ou vide" };

  // Ordre par numéro (les numéros non numériques passent après)
  const cards = [...set.cards].sort((a, b) => {
    const na = Number.parseInt(a.localId, 10);
    const nb = Number.parseInt(b.localId, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localId.localeCompare(b.localId, "fr");
  });

  // Exemplaires possédés de ce set (actifs, non vendus)
  const { data: owned } = await supabase
    .from("items")
    .select("id, tcgdex_id")
    .eq("set_id", set.id)
    .is("deleted_at", null)
    .is("sold_at", null);
  const ownedByTcgdex = new Map<string, string>();
  for (const o of owned ?? []) {
    if (!ownedByTcgdex.has(o.tcgdex_id)) ownedByTcgdex.set(o.tcgdex_id, o.id);
  }

  // Design par défaut : couverture sur mesure noire et lisse, logo de
  // l'extension au centre, code de l'extension en bas à gauche.
  const zones: Record<string, Json> = {
    bl: {
      type: "text",
      text: set.id,
      size: "sm",
      weight: "bold",
      color: "#ffffff",
      font: "mono",
    },
  };
  if (set.logo && /^https:\/\/assets\.tcgdex\.net\//.test(set.logo)) {
    zones.mc = {
      type: "logo",
      setId: set.id,
      setName: set.name,
      url: set.logo,
      size: "lg",
    };
  }
  const cover: Json = {
    bg: { kind: "color", color: "#1f1f23", image: null, card: null, dim: 35 },
    zones,
  };

  const { data: binder, error: bErr } = await supabase
    .from("binders")
    .insert({
      name: set.name,
      page_grid: "3x3",
      style: "custom",
      color: null,
      cover,
    })
    .select("id")
    .single();
  if (bErr || !binder) return { error: bErr?.message ?? "Création impossible" };

  const items: { binder_id: string; item_id: string; position: number }[] = [];
  const placeholders: {
    binder_id: string;
    tcgdex_id: string;
    card_name: string;
    set_name: string;
    local_id: string;
    image_url: string | null;
    position: number;
  }[] = [];
  cards.forEach((c, i) => {
    const itemId = ownedByTcgdex.get(c.id);
    if (itemId) {
      items.push({ binder_id: binder.id, item_id: itemId, position: i });
    } else {
      placeholders.push({
        binder_id: binder.id,
        tcgdex_id: c.id,
        card_name: c.name,
        set_name: set.name,
        local_id: c.localId,
        image_url:
          c.image && /^https:\/\/assets\.tcgdex\.net\//.test(c.image) ? c.image : null,
        position: i,
      });
    }
  });
  if (items.length > 0) await supabase.from("binder_items").insert(items);
  if (placeholders.length > 0) await supabase.from("binder_placeholders").insert(placeholders);

  revalidatePath("/classeurs");
  // Étape suivante : choisir le design dans l'éditeur
  redirect(`/classeurs/${binder.id}/editeur`);
}

export async function createBinderAndAdd(name: string, itemIds: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom manquant" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binders")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Création impossible" };

  if (itemIds.length > 0) {
    await supabase.from("binder_items").insert(
      itemIds.map((item_id, i) => ({ binder_id: data.id, item_id, position: i }))
    );
  }

  revalidatePath("/classeurs");
  return { error: null, binderId: data.id };
}

export async function removeItemsFromBinder(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("binder_items")
    .delete()
    .eq("binder_id", binderId)
    .in("item_id", itemIds);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Ordre manuel des classeurs (glisser-déposer sur la page Classeurs) */
export async function reorderBinders(binderIds: string[]) {
  if (binderIds.length === 0) return { error: null };
  const supabase = await createClient();
  const results = await Promise.all(
    binderIds.map((id, i) =>
      supabase.from("binders").update({ position: i }).eq("id", id)
    )
  );
  revalidatePath("/classeurs");
  return { error: results.find((r) => r.error)?.error?.message ?? null };
}

/**
 * Ordre manuel des cartes dans un classeur (ancienne grille réordonnable).
 * Compacte les positions : à ne plus utiliser sur un classeur en pages,
 * où `position` est un numéro de pochette avec des trous.
 */
export async function reorderBinderItems(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };
  const supabase = await createClient();
  const results = await Promise.all(
    itemIds.map((itemId, i) =>
      supabase
        .from("binder_items")
        .update({ position: i })
        .eq("binder_id", binderId)
        .eq("item_id", itemId)
    )
  );
  revalidatePath(`/classeurs/${binderId}`);
  return { error: results.find((r) => r.error)?.error?.message ?? null };
}

/**
 * Apparence du classeur : couleur de tranche, style et cartes de couverture,
 * format des pages et options de design (feuilles, anneaux, pochettes…)
 */
export async function updateBinderStyle(
  binderId: string,
  color: string | null,
  coverItemIds: string[],
  style: string,
  pageGridCode?: string,
  design?: unknown
) {
  if (!binderId) return { error: "Classeur manquant" };
  const { BINDER_COLORS } = await import("@/lib/binder-colors");
  const { binderStyle, binderStyleCovers } = await import("@/lib/binder-styles");
  const { pageGrid } = await import("@/lib/binder-pages");
  const { binderDesign } = await import("@/lib/binder-design");
  const safeColor =
    color && BINDER_COLORS.some((c) => c.code === color) ? color : null;
  const safeStyle = binderStyle(style);

  const supabase = await createClient();
  // Seules les cartes réellement dans le classeur peuvent servir de couverture
  const { data: links } = await supabase
    .from("binder_items")
    .select("item_id")
    .eq("binder_id", binderId);
  const memberIds = new Set((links ?? []).map((l) => l.item_id));
  const covers = coverItemIds
    .filter((id) => memberIds.has(id))
    .slice(0, binderStyleCovers(safeStyle));

  const { error } = await supabase
    .from("binders")
    .update({
      color: safeColor,
      cover_item_ids: covers.length ? covers : null,
      style: safeStyle,
      ...(pageGridCode != null ? { page_grid: pageGrid(pageGridCode).code } : {}),
      ...(design !== undefined ? { design: binderDesign(design) } : {}),
    })
    .eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Fiche carte : remplace l'appartenance de l'exemplaire par la sélection */
export async function setItemBinders(itemId: string, binderIds: string[]) {
  if (!itemId) return { error: "Carte manquante" };

  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("binder_items")
    .delete()
    .eq("item_id", itemId);
  if (delError) return { error: delError.message };

  if (binderIds.length > 0) {
    // La carte prend la pochette suivante dans chacun des classeurs
    const [{ data: links }, { data: wanted }] = await Promise.all([
      supabase.from("binder_items").select("binder_id, position").in("binder_id", binderIds),
      supabase.from("binder_placeholders").select("binder_id, position").in("binder_id", binderIds),
    ]);
    const last = new Map<string, number>();
    for (const l of [...(links ?? []), ...(wanted ?? [])]) {
      last.set(l.binder_id, Math.max(last.get(l.binder_id) ?? -1, l.position ?? -1));
    }
    const { error } = await supabase.from("binder_items").insert(
      binderIds.map((binder_id) => ({
        binder_id,
        item_id: itemId,
        position: (last.get(binder_id) ?? -1) + 1,
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/classeurs");
  revalidatePath(`/carte/${itemId}`);
  return { error: null };
}

/** Pages : nombre minimal de pages du classeur (feuilles vides ajoutées à l'avance) */
export async function setBinderPageCount(binderId: string, count: number) {
  if (!UUID_RE.test(binderId)) return { error: "Classeur invalide" };
  if (!Number.isInteger(count) || count < 0 || count > 400) {
    return { error: "Nombre de pages invalide" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("binders")
    .update({ page_count: count })
    .eq("id", binderId);
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

// ---- Pages de pochettes ----------------------------------------------------
// Une pochette contient soit un exemplaire possédé (`i:<item_id>`), soit une
// carte hors collection du catalogue (`w:<placeholder_id>`).

type PocketRef = { kind: "i" | "w"; id: string };
type Db = Awaited<ReturnType<typeof createClient>>;

function parsePocketKey(key: string): PocketRef | null {
  const m = key.match(/^([iw]):(.+)$/);
  if (!m || !UUID_RE.test(m[2])) return null;
  return { kind: m[1] as "i" | "w", id: m[2] };
}

/** Position d'une carte dans le classeur — undefined si elle n'y est pas */
async function pocketOf(db: Db, binderId: string, ref: PocketRef) {
  if (ref.kind === "i") {
    const { data } = await db
      .from("binder_items")
      .select("position")
      .eq("binder_id", binderId)
      .eq("item_id", ref.id)
      .maybeSingle();
    return data ? data.position : undefined;
  }
  const { data } = await db
    .from("binder_placeholders")
    .select("position")
    .eq("binder_id", binderId)
    .eq("id", ref.id)
    .maybeSingle();
  return data ? data.position : undefined;
}

async function setPocket(db: Db, binderId: string, ref: PocketRef, position: number) {
  const res =
    ref.kind === "i"
      ? await db
          .from("binder_items")
          .update({ position })
          .eq("binder_id", binderId)
          .eq("item_id", ref.id)
      : await db
          .from("binder_placeholders")
          .update({ position })
          .eq("binder_id", binderId)
          .eq("id", ref.id);
  return res.error?.message ?? null;
}

/** Occupant d'une pochette (exemplaire ou carte hors collection), sauf `except` */
async function occupantOf(
  db: Db,
  binderId: string,
  pocket: number,
  except?: PocketRef
): Promise<PocketRef | null> {
  const [{ data: items }, { data: wanted }] = await Promise.all([
    db.from("binder_items").select("item_id").eq("binder_id", binderId).eq("position", pocket),
    db.from("binder_placeholders").select("id").eq("binder_id", binderId).eq("position", pocket),
  ]);
  for (const r of items ?? []) {
    if (!(except?.kind === "i" && except.id === r.item_id)) return { kind: "i", id: r.item_id };
  }
  for (const r of wanted ?? []) {
    if (!(except?.kind === "w" && except.id === r.id)) return { kind: "w", id: r.id };
  }
  return null;
}

/** Pages : déplace une carte vers une pochette — échange si elle est occupée */
export async function movePocket(binderId: string, key: string, toPocket: number) {
  const ref = parsePocketKey(key);
  if (!UUID_RE.test(binderId) || !ref) return { error: "Classeur ou carte invalide" };
  if (!Number.isInteger(toPocket) || toPocket < 0) return { error: "Pochette invalide" };

  const db = await createClient();
  const from = await pocketOf(db, binderId, ref);
  if (from === undefined) return { error: "Carte absente du classeur" };
  const occupant = await occupantOf(db, binderId, toPocket, ref);
  if (occupant && from == null) return { error: "Pochette occupée" };

  const errors = await Promise.all([
    setPocket(db, binderId, ref, toPocket),
    occupant && from != null ? setPocket(db, binderId, occupant, from) : Promise.resolve(null),
  ]);
  revalidatePath(`/classeurs/${binderId}`);
  return { error: errors.find((e) => e != null) ?? null };
}

/** Pages : range un exemplaire de la collection dans une pochette libre (ou l'y déplace) */
export async function placeItemInPocket(binderId: string, itemId: string, pocket: number) {
  if (!UUID_RE.test(binderId) || !UUID_RE.test(itemId)) {
    return { error: "Classeur ou carte invalide" };
  }
  if (!Number.isInteger(pocket) || pocket < 0) return { error: "Pochette invalide" };

  const db = await createClient();
  const ref: PocketRef = { kind: "i", id: itemId };
  if (await occupantOf(db, binderId, pocket, ref)) return { error: "Pochette occupée" };
  const current = await pocketOf(db, binderId, ref);
  const error =
    current !== undefined
      ? await setPocket(db, binderId, ref, pocket)
      : ((
          await db
            .from("binder_items")
            .insert({ binder_id: binderId, item_id: itemId, position: pocket })
        ).error?.message ?? null);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  revalidatePath(`/carte/${itemId}`);
  return { error };
}

/** Pages : range une carte du catalogue qu'on ne possède pas (hors collection) */
export async function placeWantedInPocket(
  binderId: string,
  card: {
    id: string;
    tcgdex_id: string;
    card_name: string;
    set_name: string;
    local_id: string;
    image_url: string | null;
  },
  pocket: number
) {
  if (!UUID_RE.test(binderId) || !UUID_RE.test(card.id)) {
    return { error: "Classeur ou carte invalide" };
  }
  if (!Number.isInteger(pocket) || pocket < 0) return { error: "Pochette invalide" };
  const tcgdexId = card.tcgdex_id.trim();
  const name = card.card_name.trim();
  if (!tcgdexId || tcgdexId.startsWith("custom:") || !name) return { error: "Carte invalide" };

  const db = await createClient();
  if (await occupantOf(db, binderId, pocket)) return { error: "Pochette occupée" };
  const { error } = await db.from("binder_placeholders").insert({
    id: card.id,
    binder_id: binderId,
    tcgdex_id: tcgdexId.slice(0, 60),
    card_name: name.slice(0, 120),
    set_name: card.set_name.trim().slice(0, 120),
    local_id: card.local_id.trim().slice(0, 20),
    // Seuls les visuels du CDN TCGdex sont acceptés
    image_url:
      card.image_url && /^https:\/\/assets\.tcgdex\.net\//.test(card.image_url)
        ? card.image_url
        : null,
    position: pocket,
  });

  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Pages : retire une carte de CE classeur — un exemplaire reste dans la collection */
export async function removeFromPocket(binderId: string, key: string) {
  const ref = parsePocketKey(key);
  if (!UUID_RE.test(binderId) || !ref) return { error: "Classeur ou carte invalide" };

  const db = await createClient();
  const { error } =
    ref.kind === "i"
      ? await db.from("binder_items").delete().eq("binder_id", binderId).eq("item_id", ref.id)
      : await db.from("binder_placeholders").delete().eq("binder_id", binderId).eq("id", ref.id);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  if (ref.kind === "i") revalidatePath(`/carte/${ref.id}`);
  return { error: error?.message ?? null };
}
