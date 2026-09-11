"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CardImage } from "@/components/card-image";
import { CardGrid, TileCaption } from "@/components/card-grid-kit";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { TierBadge } from "@/components/game/tier-badge";
import { GradedSlab } from "@/components/graded-slab";
import { type Grade, type Tier } from "@/lib/game";

export type SetGridCard = {
  /** id catalogue (tcgdex) */
  id: string;
  /** id de l'exemplaire possédé (game_cards), pour grader */
  rowId: string | null;
  name: string;
  localId: string;
  image: string | null;
  tier: Tier;
  qty: number;
  grade: Grade | null;
};

/**
 * Grille d'un set dans la collection virtuelle, même grille que le catalogue :
 * possédées en couleur (×n, boîtier si gradée), manquantes grisées. Clic →
 * détail.
 */
export function CollectionSetGrid({ cards, setName }: { cards: SetGridCard[]; setName: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<SetGridCard | null>(null);
  const total = cards.length;

  const view: GameCardView | null = detail
    ? {
        id: detail.rowId ?? undefined,
        image: detail.image,
        name: detail.name,
        set_name: setName,
        local_id: detail.localId,
        tier: detail.tier,
        qty: detail.qty,
        grade: detail.grade,
        gradable: false,
      }
    : null;

  return (
    <>
      <CardGrid>
        {cards.map((c) => {
          const owned = c.qty > 0;
          const inner =
            owned && c.grade ? (
              <GradedSlab
                name={c.name}
                setName=""
                localId={c.localId}
                imageUrl={c.image}
                grade={c.grade.overall}
                centering={c.grade.centering}
                corners={c.grade.corners}
                edges={c.grade.edges}
                surface={c.grade.surface}
              />
            ) : (
              <>
                <div className={`card-tile aspect-[63/88] ${owned ? "" : "opacity-35 grayscale"}`}>
                  <CardImage base={c.image} alt={c.name} />
                  {c.qty > 1 && <span className="tile-badge num right-1.5 top-1.5">×{c.qty}</span>}
                  {owned && <TierBadge tier={c.tier} />}
                </div>
                <TileCaption
                  name={c.name}
                  sub={
                    <span className="num text-faint">
                      {c.localId} / {total}
                    </span>
                  }
                />
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
      </CardGrid>
      <GameCardDetail card={view} onClose={() => setDetail(null)} onGraded={() => router.refresh()} />
    </>
  );
}
