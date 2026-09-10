"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { gradeGameCard } from "@/app/boosters/actions";
import { Sheet } from "@/components/sheet";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { GradedSlab } from "@/components/graded-slab";
import { GRADE_AXES, TIER_LABEL, TIERS, type Grade, type Tier } from "@/lib/game";
import { play } from "@/lib/sfx";

export type GameCardView = {
  /** id de la ligne game_cards, requis pour grader */
  id?: string;
  image: string | null;
  name: string;
  set_name?: string;
  local_id?: string;
  tier: Tier;
  qty?: number;
  isNew?: boolean;
  /** Notes si la carte est déjà gradée */
  grade?: Grade | null;
  /** Peut être gradée maintenant (potentiel caché non révélé) */
  gradable?: boolean;
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
const SCAN_MS = 2100;

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
  const reset = () => setTilt({ rx: 0, ry: 0, active: false });
  const shine = 50 + (tilt.ry / MAX_TILT) * 60;
  const glare = 50 - (tilt.rx / MAX_TILT) * 60;

  return (
    <div className="flex flex-col items-center gap-3">
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
          className="relative aspect-[63/88] w-[min(62vw,270px)] cursor-pointer touch-none [transform-style:preserve-3d]"
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry + (flipped ? 180 : 0)}deg)`,
            transition: tilt.active ? "none" : "transform .5s cubic-bezier(.2,.8,.3,1)",
          }}
        >
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
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setFlipped((f) => !f)} className="btn btn-ghost !py-1.5 text-[13px]">
        <RotateCw size={14} aria-hidden />
        Retourner
      </button>
    </div>
  );
}

/** Analyse en cours : la carte scannée par un faisceau, les axes qui s'allument */
function ScanView({ card }: { card: GameCardView }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[63/88] w-[min(62vw,270px)] overflow-hidden rounded-[4.5%/3.5%] shadow-[0_24px_50px_rgba(0,0,0,.6)]">
        <div className="card-tile h-full w-full">
          <CardImage base={card.image} alt={card.name} quality="high" />
        </div>
        {/* Grille d'analyse */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,transparent_95%,rgba(120,220,255,.25)_100%),linear-gradient(90deg,transparent_95%,rgba(120,220,255,.25)_100%)] bg-[length:14px_14px] opacity-60" />
        {/* Faisceau */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-1/3 animate-[scan-beam_1.1s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-sky-300/40 to-transparent"
        />
        {/* Coins ciblés */}
        {["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"].map((p, i) => (
          <span
            key={p}
            aria-hidden
            className={`absolute ${p} h-5 w-5 animate-pulse rounded-sm border-2 border-sky-300/70`}
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Sparkles size={15} aria-hidden className="animate-pulse text-accent-strong" />
        Analyse en cours…
      </p>
    </div>
  );
}

/** Corps du détail : gradation (scan → boîtier), inclinaison, retournement.
 * L'état est réinitialisé par la `key` du parent à chaque carte ouverte. */
function DetailBody({
  card,
  onGraded,
}: {
  card: GameCardView;
  onGraded?: (id: string, grade: Grade) => void;
}) {
  const [grade, setGrade] = useState<Grade | null>(card.grade ?? null);
  // idle | scanning | done — "done" ré-anime l'entrée du boîtier
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">(card.grade ? "idle" : "idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grade5() {
    if (!card.id || pending) return;
    setPending(true);
    setError(null);
    setPhase("scanning");
    const started = Date.now();
    const res = await gradeGameCard(card.id);
    const wait = Math.max(0, SCAN_MS - (Date.now() - started));
    window.setTimeout(() => {
      setPending(false);
      if ("error" in res) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      setGrade(res.grade);
      setPhase("done");
      play(res.grade.overall >= 9 ? "ultra" : res.grade.overall >= 7 ? "rare" : "flip");
      onGraded?.(card.id!, res.grade);
    }, wait);
  }

  // ——— Carte gradée : le boîtier ———
  if (grade) {
    const fresh = phase === "done";
    return (
      <div>
        <div className={`mx-auto w-[min(66vw,290px)] ${fresh ? "animate-[slab-in_.6s_cubic-bezier(.2,.9,.3,1.2)_both]" : ""}`}>
          <GradedSlab
            name={card.name}
            setName={card.set_name ?? ""}
            localId={card.local_id ?? ""}
            imageUrl={card.image}
            grade={grade.overall}
            centering={grade.centering}
            corners={grade.corners}
            edges={grade.edges}
            surface={grade.surface}
          />
        </div>
        {fresh && (
          <p className="mt-3 text-center text-sm font-medium text-accent-strong animate-[grade-tick_.5s_ease-out_.3s_both]">
            Carte gradée {grade.overall}/10 !
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_BADGE[card.tier]}`}>
            {TIER_LABEL[card.tier]}
          </span>
        </div>
      </div>
    );
  }

  // ——— Analyse en cours ———
  if (phase === "scanning") {
    return (
      <div>
        <ScanView card={card} />
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {GRADE_AXES.map((a, i) => (
            <div key={a.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs text-muted">{a.label}</span>
                <span className="num text-xs text-faint">···</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div
                  className="h-full w-1/3 rounded-full bg-accent/70"
                  style={{ animation: `bar-indet 1s linear ${i * 150}ms infinite` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ——— Carte non gradée : recto interactif + bouton ———
  return (
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
      {card.id && card.gradable !== false && (
        <div className="mt-4">
          <button type="button" onClick={grade5} disabled={pending} className="btn btn-primary w-full !py-3">
            <Sparkles size={15} aria-hidden />
            Faire grader cette carte
          </button>
          <p className="mt-2 text-center text-[11px] text-faint">
            Met la carte sous boîtier : centrage, coins, bords, surface et note globale.
          </p>
          {error && <p className="mt-2 text-center text-sm text-loss">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Détail d'une carte du jeu (booster ou collection). `z` place le dialogue
 * au-dessus de la scène d'ouverture. `onGraded` remonte la note obtenue. */
export function GameCardDetail({
  card,
  onClose,
  onGraded,
  z,
}: {
  card: GameCardView | null;
  onClose: () => void;
  onGraded?: (id: string, grade: Grade) => void;
  z?: string;
}) {
  return (
    <Sheet open={card != null} onClose={onClose} size="sm" label={card?.name ?? "Carte"} z={z}>
      {card && <DetailBody key={card.id ?? card.name} card={card} onGraded={onGraded} />}
    </Sheet>
  );
}
