"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { gradeTone, type Grade, type Tier } from "@/lib/game";

export type OwnedCard = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
  tier: Tier;
  grade: Grade | null;
};

/**
 * Toutes les cartes possédées (une tuile par exemplaire) : clic pour le
 * détail, faire grader, voir les notes. Les gradées portent un sceau.
 */
export function GameCardsGrid({ cards }: { cards: OwnedCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<OwnedCard | null>(null);
  const [onlyGraded, setOnlyGraded] = useState(false);

  const list = onlyGraded ? cards.filter((c) => c.grade) : cards;
  const gradedCount = cards.filter((c) => c.grade).length;

  const view: GameCardView | null = open
    ? {
        id: open.id,
        image: open.image,
        name: open.name,
        set_name: open.setName,
        local_id: open.localId,
        tier: open.tier,
        grade: open.grade,
        gradable: true,
      }
    : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyGraded(false)}
          aria-pressed={!onlyGraded}
          className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
            !onlyGraded ? "bg-accent text-accent-ink" : "border border-edge text-muted hover:text-foreground"
          }`}
        >
          Toutes <span className="num opacity-70">{cards.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setOnlyGraded(true)}
          aria-pressed={onlyGraded}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
            onlyGraded ? "bg-accent text-accent-ink" : "border border-edge text-muted hover:text-foreground"
          }`}
        >
          <BadgeCheck size={14} aria-hidden />
          Gradées <span className="num opacity-70">{gradedCount}</span>
        </button>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl bg-raised/60 px-4 py-8 text-center text-sm text-muted">
          {onlyGraded ? "Aucune carte gradée pour l'instant." : "Aucune carte."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {list.map((c) => {
            const tone = c.grade ? gradeTone(c.grade.overall) : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  aria-label={`Voir ${c.name}`}
                  className="group block w-full text-left"
                >
                  <div
                    className="card-tile aspect-[63/88]"
                    style={tone ? { outline: `2px solid ${tone.ring}`, outlineOffset: "-2px" } : undefined}
                  >
                    <CardImage base={c.image} alt={c.name} />
                    {c.grade && tone && (
                      <span
                        className="absolute left-1/2 top-1.5 flex -translate-x-1/2 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow"
                        style={{ background: tone.ring, color: tone.text }}
                      >
                        <span className="num">{c.grade.overall}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-faint">{c.setName}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <GameCardDetail
        card={view}
        onClose={() => setOpen(null)}
        onGraded={() => router.refresh()}
      />
    </>
  );
}
