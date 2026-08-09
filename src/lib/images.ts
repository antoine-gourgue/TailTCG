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
