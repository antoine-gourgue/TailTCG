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
import { ArrowRight, Package, Volume2, VolumeX, X } from "lucide-react";
import type { DrawnCard, OpenResult } from "@/app/boosters/actions";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { Toast } from "@/components/toast";
import { formatCountdown, TIER_LABEL, TIERS, type Tier } from "@/lib/game";
import { isMuted, play, setMuted } from "@/lib/sfx";

export type StageSet = { id: string; name: string; serie: string; logo: string | null; total: number };
type Pack = Exclude<OpenResult, { error: string }>;
type Stage = "sealed" | "tearing" | "opened" | "revealing";
type Reveal = { remaining: DrawnCard[]; revealed: DrawnCard[]; flipping: string | null };
type Confetti = { id: number; x: number; dx: number; dy: number; rot: number; color: string; w: number; h: number };

const noopSubscribe = () => () => {};
/** Part de la largeur de l'emballage à parcourir pour qu'il cède */
const TEAR_TRAVEL = 0.6;
const FLIP_MS = 750;
const FOIL = ["#f5f4f0", "#f0483e", "#7dd3fc", "#fde68a", "#c4b5fd", "#e5e7eb"];

const TIER_CLASS: Record<Tier, string> = {
  common: "!bg-neutral-700/90 !text-neutral-100",
  uncommon: "!bg-emerald-700/90 !text-emerald-50",
  rare: "!bg-sky-700/90 !text-sky-50",
  holo: "!bg-violet-700/90 !text-violet-50",
  ultra: "!bg-amber-500/95 !text-black",
  secret: "!bg-gradient-to-r !from-amber-300 !via-rose-300 !to-sky-300 !text-black",
};
const GLOW: Partial<Record<Tier, string>> = {
  rare: "rgba(56, 189, 248, .45)",
  holo: "rgba(167, 139, 250, .6)",
  ultra: "rgba(251, 191, 36, .65)",
  secret: "rgba(253, 164, 175, .7)",
};
const BANNER: Partial<Record<Tier, string>> = {
  rare: "Rare",
  holo: "Holo !",
  ultra: "Ultra rare !!",
  secret: "Secrète !!!",
};
const rank = (t: Tier) => TIERS.indexOf(t);
const rareOrBetter = (t: Tier) => rank(t) >= rank("holo");

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
const CRIMP =
  "repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 3px, rgba(0,0,0,.35) 3px 7px)";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")";

/**
 * Scène d'ouverture plein écran : l'emballage flotte et s'incline sous le
 * pointeur, se déchire quand on l'attrape et qu'on tire, éclate en
 * confettis d'alu ; les cartes en sortent en pile et se retournent une à
 * une, avec sons et halo selon la rareté. Aucune règle de jeu ici :
 * `onOpen` fait le tirage.
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
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [muted, setMutedState] = useState(() => isMuted());
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const packRef = useRef<HTMLDivElement>(null);
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
  const best = rv.revealed.reduce<DrawnCard | null>(
    (b, c) => (b == null || rank(c.tier) > rank(b.tier) ? c : b),
    null
  );

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

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
  function onPackDown(e: ReactPointerEvent<HTMLDivElement>) {
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
  function onPackMove(e: ReactPointerEvent<HTMLDivElement>) {
    const t = tear.current;
    if (!t || t.id !== e.pointerId) return;
    const p = Math.min(1, Math.max(0, (e.clientX - t.startX) / (t.width * TEAR_TRAVEL)));
    setProgress(p);
    if (p >= 1) {
      tear.current = null;
      void startOpening();
    }
  }
  function onPackUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (tear.current?.id !== e.pointerId) return;
    tear.current = null;
    setProgress(0);
  }

  async function startOpening() {
    if (busy.current || !canOpen) return;
    busy.current = true;
    setProgress(1);
    setStage("tearing");
    play("tear");
    navigator.vibrate?.(20);
    // Éclats d'aluminium qui partent de la bande
    setConfetti(
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        x: 5 + Math.random() * 90,
        dx: (Math.random() - 0.5) * 260,
        dy: -60 - Math.random() * 220,
        rot: (Math.random() - 0.5) * 720,
        color: FOIL[i % FOIL.length],
        w: 4 + Math.random() * 8,
        h: 3 + Math.random() * 5,
      }))
    );
    const started = Date.now();
    const res = await onOpen(set.id);
    // La bande a le temps de s'envoler avant que les cartes sortent
    const wait = Math.max(0, 700 - (Date.now() - started));
    window.setTimeout(() => {
      busy.current = false;
      if ("error" in res) {
        setToast({ message: res.error, tone: "error" });
        setStage("sealed");
        setProgress(0);
        setConfetti([]);
        return;
      }
      setPack(res);
      setRv({ remaining: [...res.cards].reverse(), revealed: [], flipping: null });
      onOpened?.(res);
      setStage("opened");
      play("pop");
      window.setTimeout(() => {
        setStage("revealing");
        setConfetti([]);
      }, 700);
    }, wait);
  }

  // ——— Pile : retourner la carte du dessus ———
  function flipTop() {
    const cur = rvRef.current;
    if (cur.flipping || cur.remaining.length === 0) return;
    const top = cur.remaining[cur.remaining.length - 1];
    play("flip");
    navigator.vibrate?.(rareOrBetter(top.tier) ? [15, 40, 25] : 10);
    setRv({ ...cur, flipping: top.id });
    if (rank(top.tier) >= rank("ultra")) window.setTimeout(() => play("ultra"), 300);
    else if (rank(top.tier) >= rank("rare")) window.setTimeout(() => play("rare"), 300);
    window.setTimeout(() => {
      play("land");
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
    for (let i = 0; i < n; i++) window.setTimeout(flipTop, i * (FLIP_MS + 250));
  }
  function again() {
    setPack(null);
    setRv({ remaining: [], revealed: [], flipping: null });
    setProgress(0);
    setConfetti([]);
    setStage("sealed");
  }

  if (!mounted) return null;

  const flippingCard = rv.flipping ? rv.remaining.find((c) => c.id === rv.flipping) : null;
  const glow = flippingCard ? GLOW[flippingCard.tier] : null;
  const banner = flippingCard ? BANNER[flippingCard.tier] : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0a090c] text-foreground animate-[stage-in_.3s_ease-out]"
      onPointerMove={tilt}
      onPointerLeave={untilt}
      role="dialog"
      aria-modal="true"
      aria-label={`Booster ${set.name}`}
    >
      {/* Projecteur, qui se teinte de la rareté en cours */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{
          background: `radial-gradient(60% 50% at 50% 42%, ${glow ?? "rgba(240,72,62,.14)"}, transparent 70%), radial-gradient(90% 60% at 50% 110%, rgba(255,255,255,.05), transparent 60%)`,
        }}
      />
      {stage === "opened" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-white animate-[flash_.55s_ease-out_forwards]" />
      )}

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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            title={muted ? "Activer le son" : "Couper le son"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition hover:bg-white/10 hover:text-foreground"
          >
            {muted ? <VolumeX size={17} aria-hidden /> : <Volume2 size={17} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={stage === "tearing" || stage === "opened"}
            aria-label="Fermer"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition hover:bg-white/10 hover:text-foreground disabled:opacity-30"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      {/* Scène */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        {(stage === "sealed" || stage === "tearing" || stage === "opened") && (
          <div
            className={`relative ${
              stage === "opened"
                ? "animate-[pack-drop_.6s_ease-in_forwards]"
                : stage === "sealed" && progress === 0
                  ? "animate-[pack-float_4.5s_ease-in-out_infinite]"
                  : ""
            }`}
          >
            <div
              ref={packRef}
              onPointerDown={onPackDown}
              onPointerMove={onPackMove}
              onPointerUp={onPackUp}
              onPointerCancel={onPackUp}
              className={`relative h-[370px] w-[236px] touch-none select-none transition-transform duration-200 ease-out sm:h-[440px] sm:w-[280px] ${
                stage === "sealed" && canOpen ? "cursor-grab active:cursor-grabbing" : ""
              } ${stage === "tearing" ? "animate-[pack-shake_.5s_ease-in-out_1]" : ""}`}
              style={{ transformStyle: "preserve-3d" } as CSSProperties}
            >
              {/* Ombre au sol */}
              <div
                aria-hidden
                className="absolute -bottom-10 left-1/2 h-10 w-[85%] -translate-x-1/2 rounded-[100%] bg-black/70 blur-xl"
              />
              {/* Corps de l'emballage */}
              <div
                className="absolute inset-0 rounded-[18px] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,.65),inset_0_2px_0_rgba(255,255,255,.08),inset_0_-2px_0_rgba(0,0,0,.5)]"
                style={{
                  background:
                    "linear-gradient(165deg, #45444d 0%, #26252b 28%, #18171b 55%, #0f0e11 100%)",
                  clipPath: stage === "sealed" ? undefined : CLIP_BODY_TORN,
                }}
              >
                {/* Grain du plastique */}
                <div aria-hidden className="absolute inset-0 rounded-[18px] opacity-[0.07] mix-blend-screen" style={{ backgroundImage: GRAIN }} />
                {/* Reflets verticaux du pli */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[18px]"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,.09) 0%, transparent 14%, transparent 84%, rgba(255,255,255,.06) 100%)",
                  }}
                />
                {/* Sertissages haut et bas */}
                <div aria-hidden className="absolute inset-x-0 top-0 h-7 opacity-70" style={{ background: CRIMP }} />
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-8 rounded-b-[18px] opacity-80" style={{ background: CRIMP }} />
                {/* Motif de fond */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[18px] opacity-[0.18]"
                  style={{
                    background:
                      "radial-gradient(circle at 28% 22%, rgba(240,72,62,.95), transparent 42%), radial-gradient(circle at 78% 82%, rgba(96,165,250,.8), transparent 40%)",
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
                  {/* Panneau clair imprimé, comme sur un vrai emballage */}
                  <div className="flex h-28 w-full items-center justify-center rounded-xl bg-[#f6f5f2] px-4 shadow-[inset_0_2px_6px_rgba(0,0,0,.18),0_6px_18px_rgba(0,0,0,.45)] sm:h-32">
                    {set.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${set.logo}.png`} alt="" className="max-h-20 max-w-full object-contain sm:max-h-24" />
                    ) : (
                      <Package size={40} className="text-neutral-400" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="rounded-full bg-accent px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent-ink shadow-lg">
                      Booster
                    </span>
                    <span className="num text-[11px] uppercase tracking-[0.2em] text-white/55">5 cartes</span>
                  </div>
                </div>
                {/* Bande de série et marque, en bas */}
                <div className="absolute inset-x-0 bottom-10 flex items-center justify-between px-5">
                  <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    {set.serie}
                  </span>
                  <span className="num shrink-0 text-[9px] uppercase tracking-[0.2em] text-white/35">TailTCG</span>
                </div>
                <div className="foil-shine" />
              </div>

              {/* Bande à déchirer */}
              <div
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
                    background: "linear-gradient(180deg, #55545d 0%, #2f2e35 60%, #1c1b20 100%)",
                    clipPath: CLIP_STRIP,
                  }}
                >
                  <div aria-hidden className="absolute inset-0 opacity-80" style={{ background: CRIMP }} />
                </div>
                {/* Ligne de déchirure qui progresse sous le doigt */}
                <div
                  aria-hidden
                  className="absolute left-0 top-[70%] h-[3px] rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,.7)] transition-[width] duration-75"
                  style={{ width: `${progress * 100}%`, opacity: progress > 0 ? 1 : 0 }}
                />
              </div>

              {/* Éclats d'aluminium */}
              {confetti.map((c) => (
                <span
                  key={c.id}
                  aria-hidden
                  className="pointer-events-none absolute top-2 animate-[confetti_.9s_ease-out_forwards]"
                  style={
                    {
                      left: `${c.x}%`,
                      width: c.w,
                      height: c.h,
                      background: c.color,
                      borderRadius: 1,
                      "--dx": `${c.dx}px`,
                      "--dy": `${c.dy}px`,
                      "--rot": `${c.rot}deg`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        )}

        {(stage === "opened" || stage === "revealing") && pack && (
          <div
            className={`relative h-[300px] w-[215px] sm:h-[350px] sm:w-[250px] ${
              stage === "opened" ? "animate-[stack-out_.65s_cubic-bezier(.2,.8,.3,1)_both]" : ""
            }`}
          >
            {/* Halo derrière la pile pour une carte rare ou mieux */}
            {glow && flippingCard && rareOrBetter(flippingCard.tier) && (
              <div
                aria-hidden
                key={rv.flipping}
                className="pointer-events-none absolute inset-[-40%] rounded-full animate-[burst_1s_ease-out_forwards]"
                style={{
                  background: `conic-gradient(from 0deg, ${glow} 0deg, transparent 20deg, ${glow} 40deg, transparent 60deg, ${glow} 80deg, transparent 100deg, ${glow} 120deg, transparent 140deg, ${glow} 160deg, transparent 180deg, ${glow} 200deg, transparent 220deg, ${glow} 240deg, transparent 260deg, ${glow} 280deg, transparent 300deg, ${glow} 320deg, transparent 340deg, ${glow} 360deg)`,
                  filter: "blur(6px)",
                }}
              />
            )}
            {glow && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[-12%] rounded-[12%] animate-[glow-pulse_1.2s_ease-in-out_infinite]"
                style={{ boxShadow: `0 0 60px 20px ${glow}` }}
              />
            )}
            {banner && (
              <div
                key={`b-${rv.flipping}`}
                className={`tile-badge !static -top-12 left-1/2 z-20 !rounded-full !px-4 !py-1.5 !text-sm !font-bold uppercase tracking-wider animate-[banner-pop_.5s_cubic-bezier(.2,.9,.3,1.3)_both] absolute ${TIER_CLASS[flippingCard!.tier]}`}
              >
                {banner}
              </div>
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
            {done && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <p className="display text-2xl font-bold">
                  {newCount > 0 ? `${newCount} nouvelle${newCount > 1 ? "s" : ""} !` : "Que des doublons"}
                </p>
                {best && (
                  <p className="text-sm text-muted">
                    Meilleur tirage : <span className="font-medium text-foreground">{best.name}</span>
                    <span className="text-faint"> · {TIER_LABEL[best.tier]}</span>
                  </p>
                )}
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
        {rv.revealed.map((c) => {
          const isBest = done && best?.id === c.id && rank(c.tier) >= rank("rare");
          return (
            <div
              key={c.id}
              className={`w-[17.5%] max-w-[112px] animate-[card-land_.5s_cubic-bezier(.2,.8,.3,1)_both] transition-transform duration-500 ${
                isBest ? "-translate-y-1 scale-105" : ""
              }`}
            >
              <div
                className="card-tile aspect-[63/88]"
                style={isBest ? { boxShadow: `0 0 34px 6px ${GLOW[c.tier] ?? "rgba(255,255,255,.3)"}` } : undefined}
              >
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
          );
        })}
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>,
    document.body
  );
}
