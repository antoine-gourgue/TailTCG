"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCw } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/game";

export type GameCardView = {
  image: string | null;
  name: string;
  set_name?: string;
  local_id?: string;
  tier: Tier;
  qty?: number;
  isNew?: boolean;
};

export const TIER_BADGE: Record<Tier, string> = {
  common: "bg-neutral-700/90 text-neutral-100",
  uncommon: "bg-emerald-700/90 text-emerald-50",
  rare: "bg-sky-700/90 text-sky-50",
  holo: "bg-violet-700/90 text-violet-50",
  ultra: "bg-amber-500/95 text-black",
  secret: "bg-gradient-to-r from-amber-300 via-rose-300 to-sky-300 text-black",
};

const rareOrBetter = (t: Tier) => TIERS.indexOf(t) >= TIERS.indexOf("holo");
const MAX_TILT = 16;

/** Carte qu'on incline au doigt/à la souris et qu'on retourne : reflet
 * holographique pour les rares, dos officiel au verso. */
function TiltCard({ card }: { card: GameCardView }) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false });
  const [flipped, setFlipped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const holo = rareOrBetter(card.tier);

  function onMove(e: ReactPointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * MAX_TILT, ry: px * MAX_TILT, active: true });
  }
  function reset() {
    setTilt({ rx: 0, ry: 0, active: false });
  }

  // Position du reflet, suit l'inclinaison
  const shine = 50 + (tilt.ry / MAX_TILT) * 60;
  const glare = 50 - (tilt.rx / MAX_TILT) * 60;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="[perspective:1100px]">
        <div
          ref={ref}
          onPointerMove={onMove}
          onPointerLeave={reset}
          onPointerUp={reset}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          aria-label="Incliner ou retourner la carte"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className="relative aspect-[63/88] w-[min(66vw,290px)] cursor-pointer touch-none [transform-style:preserve-3d]"
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry + (flipped ? 180 : 0)}deg)`,
            transition: tilt.active ? "none" : "transform .5s cubic-bezier(.2,.8,.3,1)",
          }}
        >
          {/* Recto */}
          <div className="absolute inset-0 [backface-visibility:hidden]">
            <div className="card-tile h-full w-full !shadow-[0_24px_50px_rgba(0,0,0,.6)]">
              <CardImage base={card.image} alt={card.name} quality="high" />
              {holo && (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 mix-blend-color-dodge"
                    style={{
                      opacity: tilt.active ? 0.5 : 0.25,
                      background: `radial-gradient(120% 120% at ${shine}% ${glare}%, rgba(255,255,255,.55), rgba(120,220,255,.25) 30%, rgba(196,150,255,.2) 55%, transparent 75%)`,
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
                    style={{
                      background: `repeating-linear-gradient(${115 + tilt.ry * 2}deg, rgba(255,80,120,.5) 0 8%, rgba(255,214,102,.5) 8% 16%, rgba(120,255,180,.5) 16% 24%, rgba(96,190,255,.5) 24% 32%, rgba(196,150,255,.5) 32% 40%)`,
                    }}
                  />
                </>
              )}
              {card.qty != null && card.qty > 1 && (
                <span className="tile-badge num right-2 top-2 !text-xs">×{card.qty}</span>
              )}
            </div>
          </div>
          {/* Verso */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="btn btn-ghost !py-1.5 text-[13px]"
      >
        <RotateCw size={14} aria-hidden />
        Retourner
      </button>
    </div>
  );
}

/** Détail d'une carte du jeu (booster ou collection virtuelle). Passe `z`
 * au-dessus de la scène d'ouverture. */
export function GameCardDetail({
  card,
  onClose,
  z,
}: {
  card: GameCardView | null;
  onClose: () => void;
  /** Classe Tailwind de z-index, ex. "z-[80]" au-dessus de la scène */
  z?: string;
}) {
  return (
    <Sheet open={card != null} onClose={onClose} size="sm" label={card?.name ?? "Carte"} z={z}>
      {card && (
        <div>
          <TiltCard card={card} />
          <div className="mt-4 text-center">
            <p className="display text-xl font-semibold leading-tight">{card.name}</p>
            <p className="mt-1 text-sm text-muted">
              {card.set_name}
              {card.local_id && <span className="num text-faint"> · {card.local_id}</span>}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_BADGE[card.tier]}`}>
                {TIER_LABEL[card.tier]}
              </span>
              {card.isNew && (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
                  Nouvelle
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
