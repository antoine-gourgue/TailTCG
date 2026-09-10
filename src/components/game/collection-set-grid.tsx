"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CardImage } from "@/components/card-image";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { gradeTone, type Grade, type Tier } from "@/lib/game";

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
        gradable: detail.rowId != null,
      }
    : null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {cards.map((c) => {
          const owned = c.qty > 0;
          const tone = c.grade ? gradeTone(c.grade.overall) : null;
          const inner = (
            <>
              <div
                className={`card-tile aspect-[63/88] ${owned ? "" : "opacity-35 grayscale"}`}
                style={tone ? { outline: `2px solid ${tone.ring}`, outlineOffset: "-2px" } : undefined}
              >
                <CardImage base={c.image} alt={c.name} />
                {c.grade && tone && (
                  <span
                    className="absolute left-1/2 top-1.5 flex -translate-x-1/2 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow"
                    style={{ background: tone.ring, color: tone.text }}
                  >
                    <span className="num">{c.grade.overall}</span>
                  </span>
                )}
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
      <GameCardDetail card={view} onClose={() => setDetail(null)} onGraded={() => router.refresh()} />
    </>
  );
}
