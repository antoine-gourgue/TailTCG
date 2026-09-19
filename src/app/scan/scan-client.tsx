"use client";

import { useRouter } from "next/navigation";
import { CardScanner, type ConfirmResult } from "@/components/scan/card-scanner";
import { bulkAddToCollection } from "@/app/items/actions";
import type { ScanCandidate } from "@/lib/scan/index";
import { addCardUrl, ITEM_LANGUAGE } from "@/lib/scan/url";

/**
 * Scan direct sur mobile, à la chaîne : chaque carte reconnue s'ajoute en un
 * geste (état « quasi parfaite », quantité 1, langue du visuel, marquée à
 * compléter) et on passe à la suivante ; la fiche d'ajout complète reste à
 * un tap pour ceux qui veulent préciser tout de suite.
 */
export function ScanClient() {
  const router = useRouter();

  async function quickAdd(card: ScanCandidate): Promise<ConfirmResult> {
    const res = await bulkAddToCollection(
      [
        {
          tcgdex_id: card.id,
          card_name: card.name,
          set_id: card.setId,
          set_name: card.setName,
          local_id: card.localId,
          image_url: card.image,
        },
      ],
      ITEM_LANGUAGE[card.lang],
    );
    if (res.error) return { status: "error", error: res.error };
    return { status: "continue" };
  }

  return (
    <CardScanner
      onConfirm={quickAdd}
      detailsHref={addCardUrl}
      onClose={() => router.push("/recherche")}
    />
  );
}
