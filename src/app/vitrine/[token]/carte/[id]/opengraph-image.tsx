import { createAdminClient } from "@/lib/supabase/admin";
import { renderCollectionOg, ogCardUrl, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Classeur partagé sur TailTCG";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aperçu riche du lien direct d'un classeur
export default async function Image({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;

  let title = "Classeur partagé";
  let subtitle = "Vitrine en lecture seule";
  let cardUrls: string[] = [];

  if (UUID_RE.test(token) && UUID_RE.test(id)) {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("owner_id, display_name")
      .eq("share_token", token)
      .maybeSingle();
    const { data: binder } = settings
      ? await admin
          .from("binders")
          .select("id, name, owner_id, cover_item_ids")
          .eq("id", id)
          .maybeSingle()
      : { data: null };

    if (settings && binder && binder.owner_id === settings.owner_id) {
      title = binder.name;
      const { data: links } = await admin
        .from("binder_items")
        .select("item_id")
        .eq("binder_id", binder.id);
      const memberIds = (links ?? []).map((l) => l.item_id);
      subtitle = settings.display_name
        ? `Un classeur de ${settings.display_name} · ${memberIds.length} carte${
            memberIds.length > 1 ? "s" : ""
          }`
        : `${memberIds.length} carte${memberIds.length > 1 ? "s" : ""}`;

      if (memberIds.length > 0) {
        const { data: items } = await admin
          .from("collection_value")
          .select("id, image_url")
          .in("id", memberIds);
        const byId = new Map((items ?? []).map((i) => [i.id, i.image_url]));
        const ordered = [
          ...(binder.cover_item_ids ?? []),
          ...memberIds.filter((m) => !(binder.cover_item_ids ?? []).includes(m)),
        ];
        cardUrls = ordered
          .map((mid) => ogCardUrl(byId.get(mid) ?? null))
          .filter((u): u is string => u != null)
          .slice(0, 3);
      }
    }
  }

  return renderCollectionOg({
    title,
    subtitle,
    cardUrls,
    cta: "Voir le classeur",
  });
}
