"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { Package, RotateCw, Sparkles, Tag } from "lucide-react";
import { gradeGameCard } from "@/app/boosters/actions";
import { setForTrade } from "@/app/boosters/trade-actions";
import { RarityPill } from "@/components/game/tier-badge";
import { Sheet } from "@/components/sheet";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { GradedSlab } from "@/components/graded-slab";
import { GRADE_AXES, gradeLabel, TIERS, type Grade, type Tier } from "@/lib/game";
import { play } from "@/lib/sfx";

export type GameCardView = {
  /** id de la ligne game_cards, requis pour grader */
  id?: string;
  image: string | null;
  name: string;
  set_name?: string;
  local_id?: string;
  tier: Tier;
  /** Rareté TCGdex brute (« Double rare »…) ; le palier sert de secours */
  rarity?: string | null;
  set_id?: string;
  /** Total de cartes du set, pour « 087 / 120 » */
  set_total?: number | null;
  qty?: number;
  isNew?: boolean;
  /** Date d'obtention (ISO) */
  obtained_at?: string | null;
  /** Sur la place d'échange ; absent = pas d'action d'échange */
  for_trade?: boolean;
  /** Avancement du set de la carte */
  setProgress?: { owned: number; total: number } | null;
  /** Notes si la carte est déjà gradée */
  grade?: Grade | null;
  /** Peut être gradée maintenant (potentiel caché non révélé) */
  gradable?: boolean;
};

/** Teinte de fond de la fiche selon le palier */
const TINT: Record<Tier, string> = {
  common: "rgba(120,120,130,.35)",
  uncommon: "rgba(16,185,129,.3)",
  rare: "rgba(56,189,248,.3)",
  holo: "rgba(167,139,250,.38)",
  ultra: "rgba(251,191,36,.35)",
  secret: "rgba(253,164,175,.38)",
};

/** « il y a 2 h », « hier », « il y a 5 j » */
function since(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

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
          className="relative aspect-[63/88] w-[min(58vw,230px)] cursor-pointer touch-none [transform-style:preserve-3d]"
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

/** Corps du détail : visuel inclinable à gauche, identité, chiffres et actions
 * à droite (empilés sur mobile). Gradation : scan puis boîtier. L'état est
 * réinitialisé par la `key` du parent à chaque carte ouverte. */
function DetailBody({
  card,
  onGraded,
}: {
  card: GameCardView;
  onGraded?: (id: string, grade: Grade) => void;
}) {
  const [grade, setGrade] = useState<Grade | null>(card.grade ?? null);
  // idle | scanning | done — "done" ré-anime l'entrée du boîtier
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onTrade, setOnTrade] = useState(card.for_trade ?? false);
  const [tradeBusy, startTrade] = useTransition();

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
  function toggleTrade() {
    if (!card.id) return;
    const next = !onTrade;
    setOnTrade(next);
    startTrade(async () => {
      const res = await setForTrade(card.id!, next);
      if ("error" in res) {
        setOnTrade(!next);
        setError(res.error);
      }
    });
  }

  const fresh = phase === "done";
  const obtained = since(card.obtained_at);
  const pct = card.setProgress?.total ? Math.round((card.setProgress.owned / card.setProgress.total) * 100) : null;
  const tradeKnown = card.for_trade !== undefined && !!card.id;

  const visual =
    phase === "scanning" ? (
      <ScanView card={card} />
    ) : grade ? (
      <div className={`mx-auto w-[min(62vw,250px)] ${fresh ? "animate-[slab-in_.6s_cubic-bezier(.2,.9,.3,1.2)_both]" : ""}`}>
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
    ) : (
      <TiltCard card={card} />
    );

  return (
    <div className="-mx-5 -mt-4 sm:-mt-5">
      {/* Fond teinté par le palier, visuel et identité */}
      <div className="relative overflow-hidden rounded-t-2xl">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(80% 60% at 30% 20%, ${TINT[card.tier]}, transparent 70%)` }} />
        <div className="relative grid gap-5 px-5 pb-4 pt-7 sm:grid-cols-[250px_minmax(0,1fr)] sm:items-start sm:pt-6">
          <div>{visual}</div>
          <div className="min-w-0 sm:pr-8">
            <p className="label-xs text-accent-strong">
              {card.set_name ?? "Carte"}
              {card.local_id && (
                <span className="num">
                  {" "}
                  · {card.local_id}
                  {card.set_total ? ` / ${card.set_total}` : ""}
                </span>
              )}
            </p>
            <h2 className="display mt-0.5 flex flex-wrap items-center gap-2 text-2xl font-bold leading-[1.1] tracking-tight">
              {card.name}
              <RarityPill rarity={card.rarity} tier={card.tier} />
              {card.isNew && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-ink">Nouvelle</span>}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {obtained ? `Obtenue ${obtained}` : "Tirée dans un booster"}
              {card.qty != null && card.qty > 0 && (
                <>
                  {" "}
                  · <span className="num font-semibold text-foreground">{card.qty}</span> exemplaire{card.qty > 1 ? "s" : ""}
                </>
              )}
            </p>
            {fresh && grade && (
              <p className="mt-2 text-sm font-medium text-accent-strong animate-[grade-tick_.5s_ease-out_.3s_both]">
                Carte gradée {grade.overall}/10 !
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-2xl bg-background/60 px-3 py-2.5 ring-1 ring-ring">
                <p className="label-xs !text-[10px] text-muted">Gradation</p>
                <p className={`num truncate text-sm font-bold leading-tight ${grade ? "text-[#f4c361]" : ""}`}>{grade ? `${gradeLabel(grade.overall)} ${grade.overall}` : phase === "scanning" ? "Analyse…" : "Non gradée"}</p>
                <p className="truncate text-[11px] text-muted">{grade ? "boîtier TailTCG" : card.gradable === false ? "depuis la collection" : "potentiel caché"}</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-background/60 px-3 py-2.5 ring-1 ring-ring">
                <p className="label-xs !text-[10px] text-muted">Échange</p>
                <p className="truncate text-sm font-bold leading-tight">{tradeKnown ? (onTrade ? "Sur la place" : "Possible") : "Même rareté"}</p>
                <p className="truncate text-[11px] text-muted">{onTrade ? "visible des dresseurs" : "contre une carte de même palier"}</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-background/60 px-3 py-2.5 ring-1 ring-ring">
                <p className="label-xs !text-[10px] text-muted">Dans le set</p>
                <p className="num truncate text-sm font-bold leading-tight">{card.setProgress ? `${card.setProgress.owned} / ${card.setProgress.total}` : "—"}</p>
                <p className="truncate text-[11px] text-muted">{pct != null ? `${pct} % possédé` : card.set_name ?? ""}</p>
              </div>
            </div>

            {(grade || phase === "scanning") && (
              <div className="mt-3">
                <p className="label-xs !text-[10px] mb-1.5 text-muted">Sous-notes</p>
                <div className="grid grid-cols-4 gap-2">
                  {GRADE_AXES.map((a, i) => (
                    <div key={a.key} className="rounded-xl bg-raised/60 px-2.5 py-2">
                      <p className="label-xs !text-[10px] truncate text-muted">{a.label}</p>
                      {grade ? (
                        <p className="num font-bold">{grade[a.key]}</p>
                      ) : (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                          <div className="h-full w-1/3 rounded-full bg-accent/70" style={{ animation: `bar-indet 1s linear ${i * 150}ms infinite` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 px-5 pt-3">
        {card.id && card.gradable !== false && !grade && phase !== "scanning" && (
          <button type="button" onClick={grade5} disabled={pending} className="btn btn-primary shadow-lg shadow-accent/30">
            <Sparkles size={15} aria-hidden />
            Faire grader
          </button>
        )}
        {tradeKnown && (
          <button type="button" onClick={toggleTrade} disabled={tradeBusy} className={`btn ${onTrade ? "bg-accent-soft text-accent-strong ring-1 ring-accent" : "btn-ghost"}`}>
            <Tag size={15} aria-hidden />
            {onTrade ? "Retirer de la place" : "Mettre à l’échange"}
          </button>
        )}
        {card.set_id && (
          <Link href={`/boosters?set=${encodeURIComponent(card.set_id)}`} className="btn btn-ghost">
            <Package size={15} aria-hidden />
            Ouvrir {card.set_name ?? "le set"}
          </Link>
        )}
      </div>
      {error && <p className="px-5 pt-2 text-sm text-loss">{error}</p>}
      {card.id && card.gradable !== false && !grade && phase !== "scanning" && (
        <p className="px-5 pt-2 text-[11px] text-faint">La gradation révèle centrage, coins, bords, surface et la note globale, puis met la carte sous boîtier.</p>
      )}
      <div className="h-1" />
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
    <Sheet open={card != null} onClose={onClose} size="xl" label={card?.name ?? "Carte"} z={z}>
      {card && <DetailBody key={card.id ?? card.name} card={card} onGraded={onGraded} />}
    </Sheet>
  );
}
