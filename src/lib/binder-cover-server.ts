import { createAdminClient } from "@/lib/supabase/admin";
import { binderStyle } from "@/lib/binder-styles";
import {
  coverLayout,
  coverStoragePaths,
  renderCover,
  type CoverRender,
} from "@/lib/binder-cover";

const BUCKET = "card-photos";

/**
 * Rendu résolu de la couverture sur mesure d'un classeur, ou null si son
 * style n'est pas « sur mesure ». Les images du bucket ne sont signées que
 * si leur chemin appartient à `ownerId` (audit — accès storage cross-tenant).
 */
export async function coverRenderFor(
  style: string | null,
  coverRaw: unknown,
  ownerId: string,
  cardUrl: (itemId: string) => string | null
): Promise<CoverRender | null> {
  if (binderStyle(style) !== "custom") return null;
  const layout = coverLayout(coverRaw);
  const paths = coverStoragePaths(layout).filter((p) => p.startsWith(`${ownerId}/`));
  const byPath = new Map<string, string>();
  if (paths.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600);
    paths.forEach((p, i) => {
      const url = data?.[i]?.signedUrl;
      if (url) byPath.set(p, url);
    });
  }
  return renderCover(layout, (p) => byPath.get(p) ?? null, cardUrl);
}
