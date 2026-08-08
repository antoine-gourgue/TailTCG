"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import { toggleWishlist, type WishlistState } from "@/app/wishlist/actions";
import type { CardMeta } from "@/components/item-form";

// « Je la cherche » : ajoute/retire la carte des recherchées
export function WishlistButton({
  card,
  initialWished,
}: {
  card: CardMeta;
  initialWished: boolean;
}) {
  const [state, formAction, pending] = useActionState<WishlistState, FormData>(
    toggleWishlist,
    null
  );
  const wished = state?.wished ?? initialWished;

  return (
    <form action={formAction}>
      <input type="hidden" name="tcgdex_id" value={card.tcgdexId} />
      <input type="hidden" name="card_name" value={card.name} />
      <input type="hidden" name="set_id" value={card.setId} />
      <input type="hidden" name="set_name" value={card.setName} />
      <input type="hidden" name="local_id" value={card.localId} />
      <input type="hidden" name="image_url" value={card.imageBase} />
      <button
        type="submit"
        disabled={pending}
        className={`btn w-full ${
          wished
            ? "border border-accent bg-accent-soft font-medium text-accent-strong"
            : "btn-ghost"
        }`}
      >
        <Star
          size={15}
          aria-hidden
          fill={wished ? "currentColor" : "none"}
        />
        {pending
          ? "…"
          : wished
            ? "Dans mes recherchées"
            : "Je la cherche"}
      </button>
    </form>
  );
}
