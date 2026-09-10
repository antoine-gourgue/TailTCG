"use client";

import { useState } from "react";
import { CardImage } from "@/components/card-image";
import { GameCardDetail } from "@/components/game/card-detail";
import type { Tier } from "@/lib/game";

export type SetGridCard = {
  id: string;
  name: string;
  localId: string;
  image: string | null;
  tier: Tier;
  qty: number;
};

/**
 * Grille d'un set dans la collection virtuelle : les cartes possédées en
 * couleur (×n si doublon), les manquantes grisées. Un clic sur une carte
 * possédée en ouvre le détail.
 */
export function CollectionSetGrid({ cards, setName }: { cards: SetGridCard[]; setName: string }) {
  const [detail, setDetail] = useState<SetGridCard | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {cards.map((c) => {
          const owned = c.qty > 0;
          const inner = (
            <>
              <div className={`card-tile aspect-[63/88] ${owned ? "" : "opacity-35 grayscale"}`}>
                <CardImage base={c.image} alt={c.name} />
                {c.qty > 1 && <span className="tile-badge num right-1.5 top-1.5">×{c.qty}</span>}
              </div>
              <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
              <p className="num text-[11px] text-faint">{c.localId}</p>
            </>
          );
          return (
            <li key={c.id}>
              {owned ? (
                <button
                  type="button"
                  onClick={() => setDetail(c)}
                  aria-label={`Voir ${c.name}`}
                  className="group block w-full text-left"
                >
                  {inner}
                </button>
              ) : (
                <div aria-hidden>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <GameCardDetail
        card={detail ? { ...detail, local_id: detail.localId, set_name: setName } : null}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
