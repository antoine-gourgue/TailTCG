import { createAdminClient } from "@/lib/supabase/admin";

const PREFIX = "storage:";

/**
 * Les cartes hors catalogue stockent leur visuel en `storage:<chemin>` :
 * remplace ces valeurs par des URLs signées 1 h (bucket privé).
 */
export async function signStorageImages<T extends { image_url: string | null }>(
  rows: T[]
): Promise<T[]> {
  const paths = [
    ...new Set(
      rows
        .filter((r) => r.image_url?.startsWith(PREFIX))
        .map((r) => r.image_url!.slice(PREFIX.length))
    ),
  ];
  if (paths.length === 0) return rows;

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
