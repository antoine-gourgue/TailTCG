"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Package, X } from "lucide-react";
import type { DrawnCard, OpenResult } from "@/app/boosters/actions";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { Toast } from "@/components/toast";
import { formatCountdown, TIER_LABEL, type Tier } from "@/lib/game";

export type StageSet = { id: string; name: string; serie: string; logo: string | null; total: number };
type Pack = Exclude<OpenResult, { error: string }>;
type Stage = "sealed" | "tearing" | "opened" | "revealing";
type Reveal = { remaining: DrawnCard[]; revealed: DrawnCard[]; flipping: string | null };

const noopSubscribe = () => () => {};
/** Part de la bande à parcourir pour que l'emballage cède */
const TEAR_TRAVEL = 0.72;
const FLIP_MS = 750;

const TIER_CLASS: Record<Tier, string> = {
  common: "!bg-neutral-700/90 !text-neutral-100",
  uncommon: "!bg-emerald-700/90 !text-emerald-50",
  rare: "!bg-sky-700/90 !text-sky-50",
  holo: "!bg-violet-700/90 !text-violet-50",
  ultra: "!bg-amber-500/95 !text-black",
  secret: "!bg-gradient-to-r !from-amber-300 !via-rose-300 !to-sky-300 !text-black",
};
const BURST_COLOR: Partial<Record<Tier, string>> = {
  holo: "rgba(167, 139, 250, .55)",
  ultra: "rgba(251, 191, 36, .6)",
  secret: "rgba(253, 164, 175, .65)",
};
const rareOrBetter = (t: Tier) => t === "holo" || t === "ultra" || t === "secret";

/** Bord crénelé de l'emballage (haut de la bande / haut du corps une fois déchiré) */
const TEETH = 16;
const zig = (edge: "top" | "bottom", depth: number) => {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) {
    const x = ((i / TEETH) * 100).toFixed(2);
    const y = i % 2 ? depth : 0;
    pts.push(edge === "top" ? `${x}% ${y}%` : `${x}% ${100 - y}%`);
  }
  return edge === "top"
    ? `polygon(${pts.join(",")}, 100% 100%, 0 100%)`
    : `polygon(0 0, 100% 0, ${pts.reverse().join(",")})`;
};
const CLIP_BODY_TORN = zig("top", 3);
const CLIP_STRIP = zig("bottom", 30);

/**
 * Scène d'ouverture plein écran : l'emballage se déchire au doigt (ou à la
 * souris) le long de la bande du haut, les cartes en sortent en pile et se
 * retournent une à une. Aucune règle de jeu ici : `onOpen` fait le tirage.
 */
export function BoosterStage({
  set,
  onOpen,
  onOpened,
  onClose,
  unlimited,
  stock,
  nextAt,
  now,
}: {
  set: StageSet;
  onOpen: (setId: string) => Promise<OpenResult>;
  onOpened?: (res: Pack) => void;
  onClose: () => void;
  unlimited: boolean;
  stock: number;
  nextAt: number | null;
  now: number;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [stage, setStage] = useState<Stage>("sealed");
  const [progress, setProgress] = useState(0);
  const [pack, setPack] = useState<Pack | null>(null);
  const [rv, setRv] = useState<Reveal>({ remaining: [], revealed: [], flipping: null });
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tear = useRef<{ id: number; startX: number; width: number } | null>(null);
  const rvRef = useRef(rv);
  const busy = useRef(false);

  useEffect(() => {
    rvRef.current = rv;
  }, [rv]);

  // Échap referme la scène quand rien n'est en cours
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (stage === "sealed" || stage === "revealing")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onClose]);

  const canOpen = unlimited || stock > 0;
  const done = stage === "revealing" && rv.remaining.length === 0 && !rv.flipping;
  const newCount = rv.revealed.filter((c) => c.isNew).length;

  // ——— Emballage : inclinaison 3D sous le pointeur ———
  function tilt(e: ReactPointerEvent<HTMLDivElement>) {
    const el = packRef.current;
    if (!el || stage !== "sealed" || tear.current) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    // Inclinaison légère : l'emballage ne doit pas fuir sous le pointeur
    el.style.transform = `perspective(1400px) rotateY(${dx * 7}deg) rotateX(${-dy * 5}deg)`;
  }
  function untilt() {
    const el = packRef.current;
    if (el) el.style.transform = "";
  }

  // ——— Déchirure : on attrape l'emballage n'importe où et on tire vers la droite ———
  function onStripDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== "sealed" || !canOpen || e.button !== 0) return;
    const r = packRef.current?.getBoundingClientRect();
    if (!r) return;
    tear.current = { id: e.pointerId, startX: e.clientX, width: r.width };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché : le glisser continue sans capture
    }
    untilt();
  }
  function onStripMove(e: ReactPointerEvent<HTMLDivElement>) {
    const t = tear.current;
    if (!t || t.id !== e.pointerId) return;
    const p = Math.min(1, Math.max(0, (e.clientX - t.startX) / (t.width * TEAR_TRAVEL)));
    setProgress(p);
    if (p >= 1) {
      tear.current = null;
      void startOpening();
    }
  }
  function onStripUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (tear.current?.id !== e.pointerId) return;
    tear.current = null;
    setProgress(0);
  }

  async function startOpening() {
    if (busy.current || !canOpen) return;
    busy.current = true;
    setProgress(1);
    setStage("tearing");
    navigator.vibrate?.(20);
    const started = Date.now();
    const res = await onOpen(set.id);
    // La bande a le temps de s'envoler avant que les cartes sortent
    const wait = Math.max(0, 650 - (Date.now() - started));
    window.setTimeout(() => {
      busy.current = false;
      if ("error" in res) {
        setToast({ message: res.error, tone: "error" });
        setStage("sealed");
        setProgress(0);
        return;
      }
      setPack(res);
      setRv({ remaining: [...res.cards].reverse(), revealed: [], flipping: null });
      onOpened?.(res);
      setStage("opened");
      window.setTimeout(() => setStage("revealing"), 650);
    }, wait);
  }

  // ——— Pile : retourner la carte du dessus ———
  function flipTop() {
    const cur = rvRef.current;
    if (cur.flipping || cur.remaining.length === 0) return;
    const top = cur.remaining[cur.remaining.length - 1];
    navigator.vibrate?.(rareOrBetter(top.tier) ? [15, 40, 25] : 10);
    setRv({ ...cur, flipping: top.id });
    window.setTimeout(() => {
      setRv((c) =>
        c.flipping === top.id
          ? {
              remaining: c.remaining.filter((x) => x.id !== top.id),
              revealed: [...c.revealed, top],
              flipping: null,
            }
          : c
      );
    }, FLIP_MS);
  }
  function revealAll() {
    const n = rvRef.current.remaining.length;
    for (let i = 0; i < n; i++) window.setTimeout(flipTop, i * (FLIP_MS + 200));
  }
  function again() {
    setPack(null);
    setRv({ remaining: [], revealed: [], flipping: null });
    setProgress(0);
    setStage("sealed");
  }

  if (!mounted) return null;

  const flippingCard = rv.flipping ? rv.remaining.find((c) => c.id === rv.flipping) : null;
  const burst = flippingCard && rareOrBetter(flippingCard.tier) ? BURST_COLOR[flippingCard.tier] : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0a090c] text-foreground animate-[stage-in_.3s_ease-out]"
      onPointerMove={tilt}
      onPointerLeave={untilt}
      role="dialog"
      aria-modal="true"
      aria-label={`Booster ${set.name}`}
    >
      {/* Projecteur */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 42%, rgba(240,72,62,.14), transparent 70%), radial-gradient(90% 60% at 50% 110%, rgba(255,255,255,.05), transparent 60%)",
        }}
      />

      {/* En-tête */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="display truncate text-base font-semibold">{set.name}</p>
          <p className="truncate text-xs text-muted">
            {set.serie} · 5 cartes
            {unlimited
              ? " · boosters illimités (test)"
              : ` · ${stock} booster${stock > 1 ? "s" : ""} restant${stock > 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={stage === "tearing" || stage === "opened"}
          aria-label="Fermer"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition hover:bg-white/10 hover:text-foreground disabled:opacity-30"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Scène */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        {(stage === "sealed" || stage === "tearing" || stage === "opened") && (
          <div className={`relative ${stage === "opened" ? "animate-[pack-drop_.6s_ease-in_forwards]" : ""}`}>
            <div
              ref={packRef}
              onPointerDown={onStripDown}
              onPointerMove={onStripMove}
              onPointerUp={onStripUp}
              onPointerCancel={onStripUp}
              className={`relative h-[360px] w-[228px] touch-none select-none transition-transform duration-200 ease-out sm:h-[420px] sm:w-[266px] ${
                stage === "sealed" && canOpen ? "cursor-grab active:cursor-grabbing" : ""
              } ${stage === "tearing" ? "animate-[pack-shake_.5s_ease-in-out_1]" : ""}`}
              style={{ transformStyle: "preserve-3d" } as CSSProperties}
            >
              {/* Corps de l'emballage */}
              <div
                className="absolute inset-0 rounded-[18px] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,.6),0_2px_0_rgba(255,255,255,.06)_inset]"
                style={{
                  background:
                    "linear-gradient(165deg, #3b3a42 0%, #232228 30%, #17161a 55%, #0f0e11 100%)",
                  clipPath: stage === "sealed" ? undefined : CLIP_BODY_TORN,
                }}
              >
                {/* Sertissage bas */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-8 rounded-b-[18px] opacity-80"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 3px, rgba(0,0,0,.35) 3px 7px)",
                  }}
                />
                {/* Sertissage haut (visible une fois la bande partie) */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-7 opacity-70"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 3px, rgba(0,0,0,.35) 3px 7px)",
                  }}
                />
                {/* Motif */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.16]"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 25%, rgba(240,72,62,.9), transparent 45%), radial-gradient(circle at 75% 80%, rgba(96,165,250,.7), transparent 40%)",
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
                  {/* Panneau clair imprimé, comme sur un vrai emballage : les logos
                      à fond blanc y sont chez eux */}
                  <div className="flex h-28 w-full items-center justify-center rounded-xl bg-[#f6f5f2] px-4 shadow-[inset_0_2px_6px_rgba(0,0,0,.18),0_6px_18px_rgba(0,0,0,.45)]">
                    {set.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${set.logo}.png`} alt="" className="max-h-20 max-w-full object-contain" />
                    ) : (
                      <Package size={40} className="text-neutral-400" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="rounded-full bg-accent px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent-ink shadow-lg">
                      Booster
                    </span>
                    <span className="num text-[11px] uppercase tracking-[0.2em] text-white/50">
                      5 cartes
                    </span>
                  </div>
                </div>
                <div className="foil-shine" />
              </div>

              {/* Bande à déchirer */}
              <div
                ref={stripRef}
                className={`absolute inset-x-0 -top-px h-11 ${
                  stage !== "sealed" ? "animate-[pack-strip-off_.6s_ease-in_forwards]" : ""
                }`}
                style={
                  stage === "sealed"
                    ? { transform: `translateY(${-progress * 10}px) rotate(${-progress * 5}deg)` }
                    : undefined
                }
              >
                <div
                  className="absolute inset-0 rounded-t-[18px] border border-b-0 border-white/10"
                  style={{
                    background:
                      "linear-gradient(180deg, #4a4952 0%, #2c2b32 60%, #1c1b20 100%)",
                    clipPath: CLIP_STRIP,
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-full opacity-80"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 3px, rgba(0,0,0,.3) 3px 7px)",
                    }}
                  />
                </div>
                {/* Ligne de déchirure qui progresse sous le doigt */}
                <div
                  aria-hidden
                  className="absolute left-0 top-[70%] h-[3px] rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,.7)] transition-[width] duration-75"
                  style={{ width: `${progress * 100}%`, opacity: progress > 0 ? 1 : 0 }}
                />
              </div>
            </div>
          </div>
        )}

        {(stage === "opened" || stage === "revealing") && pack && (
          <div
            className={`relative h-[300px] w-[215px] sm:h-[350px] sm:w-[250px] ${
              stage === "opened" ? "animate-[stack-out_.65s_cubic-bezier(.2,.8,.3,1)_both]" : ""
            }`}
          >
            {burst && (
              <div
                aria-hidden
                key={rv.flipping}
                className="pointer-events-none absolute inset-[-40%] rounded-full animate-[burst_1s_ease-out_forwards]"
                style={{
                  background: `conic-gradient(from 0deg, ${burst} 0deg, transparent 20deg, ${burst} 40deg, transparent 60deg, ${burst} 80deg, transparent 100deg, ${burst} 120deg, transparent 140deg, ${burst} 160deg, transparent 180deg, ${burst} 200deg, transparent 220deg, ${burst} 240deg, transparent 260deg, ${burst} 280deg, transparent 300deg, ${burst} 320deg, transparent 340deg, ${burst} 360deg)`,
                  filter: "blur(6px)",
                }}
              />
            )}
            {rv.remaining.map((c, i) => {
              const n = rv.remaining.length;
              const depth = n - 1 - i;
              const top = i === n - 1;
              const flipped = rv.flipping === c.id;
              return (
                <div
                  key={c.id}
                  className="absolute inset-0"
                  style={{
                    zIndex: i,
                    transform: `translate(${-depth * 1.6}px, ${depth * 3}px) rotate(${(i % 2 ? 1 : -1) * depth * 1.3}deg)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={top && stage === "revealing" ? flipTop : undefined}
                    disabled={!top || stage !== "revealing" || !!rv.flipping}
                    aria-label={top ? "Retourner la carte du dessus" : undefined}
                    className={`block h-full w-full [perspective:1400px] ${top && !rv.flipping ? "cursor-pointer" : ""}`}
                  >
                    <div
                      className={`relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] ${
                        flipped ? "[transform:rotateY(180deg)_scale(1.08)]" : top ? "hover:-translate-y-1" : ""
                      }`}
                    >
                      <div className="absolute inset-0 rounded-[4.5%/3.5%] shadow-[0_14px_30px_rgba(0,0,0,.6)] [backface-visibility:hidden]">
                        <CardBack />
                      </div>
                      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <div className="card-tile h-full w-full !shadow-[0_18px_40px_rgba(0,0,0,.65)]">
                          <CardImage base={c.image} alt={c.name} quality="high" />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
            {stage === "revealing" && rv.remaining.length === 0 && !rv.flipping && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <p className="display text-2xl font-bold">
                  {newCount > 0 ? `${newCount} nouvelle${newCount > 1 ? "s" : ""} !` : "Que des doublons"}
                </p>
                <p className="text-sm text-muted">
                  {newCount > 0 ? "Elles rejoignent ta collection virtuelle." : "Ça arrive, la prochaine sera meilleure."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Consigne */}
        <div className="mt-6 flex h-12 items-center justify-center text-center">
          {stage === "sealed" && canOpen && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="flex items-center gap-2 text-sm text-muted">
                <ArrowRight size={16} aria-hidden className="animate-[hint-slide_1.6s_ease-in-out_infinite]" />
                Attrape l&apos;emballage et tire vers la droite pour le déchirer
              </p>
              <button
                type="button"
                onClick={() => void startOpening()}
                className="text-xs text-faint underline-offset-2 hover:text-foreground hover:underline"
              >
                ou touche ici pour l&apos;ouvrir
              </button>
            </div>
          )}
          {stage === "sealed" && !canOpen && (
            <p className="text-sm text-muted">
              Plus de booster. Prochain dans {nextAt ? formatCountdown(nextAt - now) : "…"}.
            </p>
          )}
          {stage === "tearing" && <p className="text-sm text-muted">Ouverture…</p>}
          {stage === "revealing" && rv.remaining.length > 0 && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted">Touche la carte du dessus</p>
              <button type="button" onClick={revealAll} disabled={!!rv.flipping} className="btn btn-ghost !py-1.5 text-[13px]">
                Tout retourner
              </button>
            </div>
          )}
          {done && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost">
                Changer de set
              </button>
              <Link href="/boosters/collection" className="btn btn-ghost">
                Ma collection virtuelle
              </Link>
              <button type="button" onClick={again} disabled={!canOpen} className="btn btn-primary">
                <Package size={15} aria-hidden />
                {canOpen ? "Encore un !" : "Plus de booster"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cartes retournées */}
      <div className="relative z-10 flex h-[26vh] min-h-[160px] items-end justify-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:gap-3">
        {rv.revealed.map((c) => (
          <div key={c.id} className="w-[17.5%] max-w-[112px] animate-[card-land_.5s_cubic-bezier(.2,.8,.3,1)_both]">
            <div className="card-tile aspect-[63/88]">
              <CardImage base={c.image} alt={c.name} />
              <span className={`tile-badge bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap !px-1.5 !text-[9px] sm:!text-[10px] ${TIER_CLASS[c.tier]}`}>
                {TIER_LABEL[c.tier]}
              </span>
              {c.isNew && (
                <span className="tile-badge left-1 top-1 !bg-accent !px-1.5 !text-[9px] !text-accent-ink sm:!text-[10px]">
                  Nouvelle
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-center text-[11px] text-muted">{c.name}</p>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>,
    document.body
  );
}
