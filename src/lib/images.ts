import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

const PREFIX = "storage:";

/** Un chemin d'objet appartient à `ownerId` s'il est préfixé de son UUID */
function ownsPath(path: string, ownerId: string | undefined): boolean {
  return ownerId != null && path.startsWith(`${ownerId}/`);
}

/**
 * Les cartes hors catalogue stockent leur visuel en `storage:<chemin>` :
 * remplace ces valeurs par des URLs signées 1 h (bucket privé).
 * `ownerId` borne la signature aux fichiers du propriétaire courant :
 * on ne signe jamais le chemin d'un autre compte (audit — accès storage
 * cross-tenant).
 */
export async function signStorageImages<T extends { image_url: string | null }>(
  rows: T[],
  ownerId: string
): Promise<T[]> {
  const paths = [
    ...new Set(
      rows
        .filter((r) => r.image_url?.startsWith(PREFIX))
        .map((r) => r.image_url!.slice(PREFIX.length))
        .filter((p) => ownsPath(p, ownerId))
    ),
  ];
  if (paths.length === 0) {
    // Neutralise les chemins non signés (y compris ceux d'un autre compte)
    return rows.map((r) =>
      r.image_url?.startsWith(PREFIX) ? { ...r, image_url: "" } : r
    );
  }

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("card-photos")
    .createSignedUrls(paths, 3600);
  const byPath = new Map(paths.map((p, i) => [p, data?.[i]?.signedUrl ?? ""]));

  return rows.map((r) =>
    r.image_url?.startsWith(PREFIX)
      ? { ...r, image_url: byPath.get(r.image_url.slice(PREFIX.length)) ?? "" }
      : r
  );
}

export type GradingVisualRow = {
  item_id: string;
  rectified_path: string | null;
};

/**
 * Remplace le visuel des exemplaires pré-gradés par leur carte redressée
 * (calque de la pré-gradation). `gradings` doit être trié du plus récent
 * au plus ancien — la première ligne par exemplaire gagne. `ownerId` borne
 * la signature aux fichiers du propriétaire courant.
 */
export async function applyRectifiedImages<
  T extends { id: string | null; image_url: string | null },
>(
  gradings: GradingVisualRow[] | null,
  rows: T[],
  ownerId: string
): Promise<T[]> {
  const latest = new Map<string, string>();
  for (const g of gradings ?? []) {
    if (
      g.rectified_path &&
      !latest.has(g.item_id) &&
      ownsPath(g.rectified_path, ownerId)
    ) {
      latest.set(g.item_id, g.rectified_path);
    }
  }
  const ids = [...latest.keys()].filter((id) => rows.some((r) => r.id === id));
  if (ids.length === 0) return rows;

  const admin = createAdminClient();
  const paths = ids.map((id) => latest.get(id)!);
  const { data } = await admin.storage
    .from("card-photos")
    .createSignedUrls(paths, 3600);
  const urlById = new Map(ids.map((id, i) => [id, data?.[i]?.signedUrl]));

  return rows.map((r) => {
    const url = r.id ? urlById.get(r.id) : null;
    return url ? { ...r, image_url: url } : r;
  });
}

type RepairableRow = {
  id: string | null;
  tcgdex_id: string | null;
  image_url: string | null;
  language?: string | null;
};

/**
 * Visuels manquants d'exemplaires déjà ajoutés : quand TCGdex n'avait pas le
 * scan, l'ajout enregistrait une adresse d'asset devinée qui n'existe pas (ou
 * rien), d'où « Pas d'image » alors que la page du set montre la carte. Si le
 * catalogue a trouvé le visuel ailleurs (pokemontcg.io, Limitless), on le
 * reprend : à l'affichage, et en base (client de l'utilisateur, RLS) pour
 * que classeurs, fiche et vitrine en profitent aussi. Une adresse TCGdex
 * n'est remplacée que par un visuel venu d'un autre CDN ; une adresse vide,
 * par tout visuel du catalogue. Même chose pour une adresse scrydex (CDN de
 * pokemontcg.io, qui liste des visuels avant de les avoir) que le catalogue
 * a remplacée depuis, par TCGplayer par exemple (Mew R/G/B des 30 ans).
 */
export async function repairCatalogImages<T extends RepairableRow>(
  supabase: SupabaseClient<Database>,
  rows: T[]
): Promise<T[]> {
  const suspect = (r: T) =>
    !!r.id &&
    !!r.tcgdex_id &&
    !r.tcgdex_id.startsWith("custom:") &&
    (!r.image_url || r.image_url.includes("assets.tcgdex.net") || r.image_url.startsWith("https://images.scrydex.com/"));
  const ids = [...new Set(rows.filter(suspect).map((r) => r.tcgdex_id as string))];
  if (ids.length === 0) return rows;

  const admin = createAdminClient();
  const catalog = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from("catalog_cards")
      .select("id, lang, image")
      .in("id", ids.slice(i, i + 500))
      .not("image", "is", null);
    for (const c of data ?? []) if (c.image) catalog.set(`${c.lang}:${c.id}`, c.image);
  }

  const fixes: { id: string; image: string }[] = [];
  const out = rows.map((r) => {
    if (!suspect(r)) return r;
    const lang = r.language === "JP" ? "ja" : "fr";
    const image =
      catalog.get(`${lang}:${r.tcgdex_id}`) ?? catalog.get(`${lang === "ja" ? "fr" : "ja"}:${r.tcgdex_id}`);
    if (!image || image === r.image_url) return r;
    if (r.image_url && image.includes("assets.tcgdex.net")) return r;
    fixes.push({ id: r.id as string, image });
    return { ...r, image_url: image };
  });

  // Réparation en base, bornée : le reste suivra au prochain affichage
  await Promise.all(
    fixes.slice(0, 200).map((f) => supabase.from("items").update({ image_url: f.image }).eq("id", f.id))
  );
  return out;
}
