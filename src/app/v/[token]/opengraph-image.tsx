import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur } from "@/lib/domain";
import { renderCollectionOg, ogCardUrl, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Collection partagée sur TailTCG";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aperçu riche du lien de vitrine (WhatsApp, Discord, iMessage…)
export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let title = "Collection partagée";
  let subtitle = "Vitrine en lecture seule";
  let cardUrls: string[] = [];

  if (UUID_RE.test(token)) {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("owner_id, display_name")
      .eq("share_token", token)
      .maybeSingle();

    if (settings) {
      if (settings.display_name) {
        title = `La collection de ${settings.display_name}`;
      }
      const { data: items } = await admin
        .from("collection_value")
        .select("image_url, quantity, current_price, sold_at")
        .eq("owner_id", settings.owner_id)
        .order("created_at", { ascending: false });

      let count = 0;
      let value = 0;
      let hasValue = false;
      for (const i of items ?? []) {
        if (i.sold_at != null) continue;
        count += i.quantity ?? 1;
        if (i.current_price != null) {
          value += i.current_price * (i.quantity ?? 1);
          hasValue = true;
        }
      }
      subtitle = `${count} carte${count > 1 ? "s" : ""}${
        hasValue ? ` · ${formatEur(value)}` : ""
      }`;
      cardUrls = (items ?? [])
        .filter((i) => i.sold_at == null)
        .map((i) => ogCardUrl(i.image_url))
        .filter((u): u is string => u != null)
        .slice(0, 3);
    }
  }

  return renderCollectionOg({ title, subtitle, cardUrls });
}
