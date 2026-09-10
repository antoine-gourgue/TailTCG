"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CardImage } from "@/components/card-image";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
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
 * Grille d'un set dans la collection virtuelle : possédées en couleur
 * (×n, sceau de note si gradée), manquantes grisées. Clic → détail, où l'on
 * peut faire grader la carte.
 */
export function CollectionSetGrid({ cards, setName }: { cards: SetGridCard[]; setName: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<SetGridCard | null>(null);

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
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {cards.map((c) => {
          const owned = c.qty > 0;
          const inner = (
            <>
              {owned && c.grade ? (
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
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                  <p className="num text-[11px] text-faint">{c.localId}</p>
                </>
              )}
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
      <GameCardDetail card={view} onClose={() => setDetail(null)} onGraded={() => router.refresh()} />
    </>
  );
}
