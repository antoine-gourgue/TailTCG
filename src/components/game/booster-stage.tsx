"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronsRight, Package, Scissors, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import type { DrawnCard, OpenResult } from "@/app/boosters/actions";
import type { PlayableSet } from "@/lib/game-sets";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { PackArt } from "@/components/game/pack-art";
import { GameCardDetail } from "@/components/game/card-detail";
import { Toast } from "@/components/toast";
import { formatCountdown, TIER_LABEL, TIERS, type Tier } from "@/lib/game";
import { isMuted, play, setMuted } from "@/lib/sfx";

export type StageSet = PlayableSet;
type Pack = Exclude<OpenResult, { error: string }>;
type Stage = "sealed" | "tearing" | "opened" | "revealing";
type Sparkle = { id: number; x: number; y: number; delay: number; size: number };
type Reveal = {
  remaining: DrawnCard[];
  revealed: DrawnCard[];
  /** Carte du dessus en train de pivoter dans la pile */
  flipping: string | null;
  /** Carte présentée en grand, avant de rejoindre la rangée */
  show: { card: DrawnCard; sparkles: Sparkle[]; leaving: boolean } | null;
};

const noopSubscribe = () => () => {};
/** Part de la largeur de l'emballage à parcourir pour qu'il cède */
const TEAR_TRAVEL = 0.6;
const FLIP_MS = 650;
const OUT_MS = 380;

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
/** Temps d'exposition d'une carte en grand, selon sa rareté */
const holdFor = (t: Tier) => (rareOrBetter(t) ? 1500 : t === "rare" ? 1000 : 650);

/**
 * Scène d'ouverture plein écran : l'emballage flotte et s'incline sous le
 * pointeur, se déchire quand on l'attrape et qu'on tire, éclate en
 * confettis d'alu ; les cartes sortent en pile, chacune se retourne, se
 * présente en grand (sons, halo et bannière selon la rareté) puis rejoint
 * la rangée ; à la fin, l'éventail des cinq. Aucune règle de jeu ici :
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
  const [rv, setRv] = useState<Reveal>({ remaining: [], revealed: [], flipping: null, show: null });
  const [detail, setDetail] = useState<DrawnCard | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const tear = useRef<{ id: number; startX: number; width: number } | null>(null);
  const rvRef = useRef(rv);
  const busy = useRef(false);
  /** Minuteries de la carte en cours (annulées quand on la passe) */
  const timers = useRef<number[]>([]);
  /** « Tout retourner » : enchaîne les cartes, en respectant les tapes qui accélèrent */
  const auto = useRef(false);
  const leavingId = useRef<string | null>(null);

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
  const idle = !rv.flipping && !rv.show;
  const done = stage === "revealing" && rv.remaining.length === 0 && idle;
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
    const started = Date.now();
    const res = await onOpen(set.id);
    const wait = Math.max(0, 700 - (Date.now() - started));
    window.setTimeout(() => {
      busy.current = false;
      if ("error" in res) {
        setToast({ message: res.error, tone: "error" });
        setStage("sealed");
        setProgress(0);
        return;
      }
      setPack(res);
      setRv({ remaining: [...res.cards].reverse(), revealed: [], flipping: null, show: null });
      onOpened?.(res);
      setStage("opened");
      play("pop");
      window.setTimeout(() => setStage("revealing"), 700);
    }, wait);
  }

  // ——— Pile : la carte du dessus pivote, se présente en grand, rejoint la rangée ———
  function flipTop() {
    const cur = rvRef.current;
    if (cur.remaining.length === 0) {
      auto.current = false;
      return;
    }
    if (cur.flipping || cur.show) return;
    const top = cur.remaining[cur.remaining.length - 1];
    play("flip");
    navigator.vibrate?.(rareOrBetter(top.tier) ? [15, 40, 25] : 10);
    setRv({ ...cur, flipping: top.id });
    if (rank(top.tier) >= rank("ultra")) window.setTimeout(() => play("ultra"), 320);
    else if (rank(top.tier) >= rank("rare")) window.setTimeout(() => play("rare"), 320);
    const sparkles: Sparkle[] = rareOrBetter(top.tier)
      ? Array.from({ length: 14 }, (_, i) => ({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          delay: Math.random() * 900,
          size: 8 + Math.random() * 14,
        }))
      : [];
    timers.current = [
      window.setTimeout(() => {
        setRv((c) =>
          c.flipping === top.id
            ? {
                ...c,
                remaining: c.remaining.filter((x) => x.id !== top.id),
                flipping: null,
                show: { card: top, sparkles, leaving: false },
              }
            : c
        );
      }, FLIP_MS),
      // Temps d'exposition selon la rareté ; une tape sur la carte l'écourte
      window.setTimeout(() => leave(top.id), FLIP_MS + holdFor(top.tier)),
    ];
  }
  /** La carte présentée quitte la scène et rejoint la rangée (une seule fois) */
  function leave(id: string) {
    const s = rvRef.current.show;
    if (!s || s.card.id !== id || s.leaving || leavingId.current === id) return;
    leavingId.current = id;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setRv((c) => (c.show?.card.id === id ? { ...c, show: { ...c.show, leaving: true } } : c));
    window.setTimeout(() => {
      play("land");
      setRv((c) =>
        c.show?.card.id === id ? { ...c, show: null, revealed: [...c.revealed, c.show.card] } : c
      );
      leavingId.current = null;
      // En mode « Tout retourner », la suivante part dès que celle-ci est rangée
      if (auto.current) {
        window.setTimeout(() => {
          if (auto.current) flipTop();
        }, 120);
      }
    }, OUT_MS);
  }
  /** Tape sur la carte présentée : on passe à la suite sans attendre */
  function skip() {
    const s = rvRef.current.show;
    if (s && !s.leaving) leave(s.card.id);
  }
  function revealAll() {
    auto.current = true;
    flipTop();
  }
  function again() {
    auto.current = false;
    leavingId.current = null;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setPack(null);
    setRv({ remaining: [], revealed: [], flipping: null, show: null });
    setProgress(0);
    setStage("sealed");
  }

  if (!mounted) return null;

  const focus = rv.show?.card ?? (rv.flipping ? rv.remaining.find((c) => c.id === rv.flipping) : null) ?? null;
  const glow = focus ? GLOW[focus.tier] : null;
  const banner = rv.show && !rv.show.leaving ? BANNER[rv.show.card.tier] : null;
  const showingRow = stage === "revealing" && !done;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0a090c] text-foreground animate-[stage-in_.3s_ease-out]"
      onPointerMove={tilt}
      onPointerLeave={untilt}
      role="dialog"
      aria-modal="true"
      aria-label={`Booster ${set.name}`}
    >
      {/* Projecteur, teinté par la rareté en cours */}
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
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <div className="min-w-0">
          <p className="display truncate text-base font-semibold">{set.name}</p>
          <p className="truncate text-xs text-muted">
            {set.serie} · 5 cartes
            {unlimited
              ? " · boosters illimités"
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
        {/* Emballage */}
        {(stage === "sealed" || stage === "tearing" || stage === "opened") && (
          <div
            className={`relative ${
              stage === "opened"
                ? "animate-[pack-away_.6s_ease-in_forwards]"
                : stage === "sealed" && progress === 0
                  ? "animate-[pack-float_4.5s_ease-in-out_infinite]"
                  : ""
            }`}
          >
            {/* Estrade lumineuse */}
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-8 left-1/2 h-14 w-[120%] -translate-x-1/2 rounded-[100%] blur-md"
              style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(125,211,252,.4), rgba(125,211,252,0) 70%)" }}
            />
            <div
              ref={packRef}
              onPointerDown={onPackDown}
              onPointerMove={onPackMove}
              onPointerUp={onPackUp}
              onPointerCancel={onPackUp}
              className={`relative w-[min(64vw,280px)] touch-none select-none transition-transform duration-200 ease-out ${
                stage === "sealed" && canOpen ? "cursor-grab active:cursor-grabbing" : ""
              } ${stage === "tearing" ? "animate-[pack-shake_.5s_ease-in-out_1]" : ""}`}
            >
              <PackArt set={set} torn={stage !== "sealed"} progress={stage === "sealed" ? progress : 1} />
            </div>
          </div>
        )}

        {/* Pile de cartes */}
        {(stage === "opened" || stage === "revealing") && pack && !done && (
          <div
            className={`relative aspect-[63/88] w-[min(56vw,250px)] ${
              stage === "opened" ? "animate-[stack-out_.65s_cubic-bezier(.2,.8,.3,1)_both]" : ""
            }`}
          >
            {glow && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[-12%] rounded-[12%] animate-[glow-pulse_1.2s_ease-in-out_infinite]"
                style={{ boxShadow: `0 0 60px 20px ${glow}` }}
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
                    disabled={!top || stage !== "revealing" || !idle}
                    aria-label={top ? "Retourner la carte du dessus" : undefined}
                    className={`block h-full w-full [perspective:1400px] ${top && idle ? "cursor-pointer" : ""}`}
                  >
                    <div
                      className={`relative h-full w-full transition-transform duration-[650ms] [transform-style:preserve-3d] ${
                        flipped ? "[transform:rotateY(180deg)_scale(1.06)]" : top && idle ? "hover:-translate-y-1" : ""
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
            {stage === "revealing" && rv.remaining.length === 0 && !done && (
              <div aria-hidden className="absolute inset-0" />
            )}
          </div>
        )}

        {/* Carte présentée en grand : une tape la range et passe à la suivante */}
        {rv.show && (
          <div
            key={rv.show.card.id}
            onClick={skip}
            className={`absolute inset-0 z-20 flex items-center justify-center ${
              rv.show.leaving
                ? "pointer-events-none animate-[showcase-out_.38s_ease-in_forwards]"
                : "cursor-pointer animate-[showcase-in_.35s_cubic-bezier(.2,.8,.3,1)_both]"
            }`}
          >
            <div className="relative aspect-[63/88] w-[min(74vw,330px)]">
              {glow && rareOrBetter(rv.show.card.tier) && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-[-40%] rounded-full animate-[burst_1.1s_ease-out_forwards]"
                  style={{
                    background: `conic-gradient(from 0deg, ${glow} 0deg, transparent 20deg, ${glow} 40deg, transparent 60deg, ${glow} 80deg, transparent 100deg, ${glow} 120deg, transparent 140deg, ${glow} 160deg, transparent 180deg, ${glow} 200deg, transparent 220deg, ${glow} 240deg, transparent 260deg, ${glow} 280deg, transparent 300deg, ${glow} 320deg, transparent 340deg, ${glow} 360deg)`,
                    filter: "blur(8px)",
                  }}
                />
              )}
              <div
                className="card-tile h-full w-full !shadow-[0_30px_70px_rgba(0,0,0,.7)]"
                style={glow ? { boxShadow: `0 0 50px 10px ${glow}, 0 30px 70px rgba(0,0,0,.7)` } : undefined}
              >
                <CardImage base={rv.show.card.image} alt={rv.show.card.name} quality="high" />
                {rareOrBetter(rv.show.card.tier) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-[-20%] left-0 w-[45%] bg-gradient-to-r from-transparent via-white/45 to-transparent mix-blend-overlay animate-[holo-sheen_1.5s_ease-in-out_infinite]"
                  />
                )}
                {rv.show.card.isNew && (
                  <span className="tile-badge left-2 top-2 !bg-accent !px-2 !text-[11px] !text-accent-ink">Nouvelle</span>
                )}
              </div>
              {rv.show.sparkles.map((s) => (
                <Sparkles
                  key={s.id}
                  aria-hidden
                  className="absolute text-white animate-[sparkle_1.1s_ease-out_both]"
                  style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}ms` }}
                />
              ))}
              {banner && (
                <div
                  className={`tile-badge absolute -top-12 left-1/2 z-20 !rounded-full !px-4 !py-1.5 !text-sm !font-bold uppercase tracking-wider animate-[banner-pop_.5s_cubic-bezier(.2,.9,.3,1.3)_both] ${TIER_CLASS[rv.show.card.tier]}`}
                >
                  {banner}
                </div>
              )}
              <p className="mt-3 text-center text-sm font-medium">
                {rv.show.card.name}
                <span className="text-muted"> · {TIER_LABEL[rv.show.card.tier]}</span>
              </p>
              {!rv.show.leaving && (
                <p className="mt-1 text-center text-[11px] text-white/40">Touche pour continuer</p>
              )}
            </div>
          </div>
        )}

        {/* Éventail final */}
        {done && (
          <p className="label-xs mb-2 !text-white/50">Résultat</p>
        )}
        {done && (
          <div className="relative flex h-[min(58vw,270px)] w-full items-center justify-center">
            {rv.revealed.map((c, i) => {
              const k = i - (rv.revealed.length - 1) / 2;
              const isBest = best?.id === c.id && rank(c.tier) >= rank("rare");
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setDetail(c)}
                  aria-label={`Voir ${c.name}`}
                  className="absolute w-[min(34vw,168px)] origin-bottom animate-[fan-in_.55s_cubic-bezier(.2,.8,.3,1)_both] transition-transform duration-200 hover:!-translate-y-2 hover:!scale-105"
                  style={{
                    zIndex: isBest ? 10 : i,
                    transform: `translateX(${k * 44}%) rotate(${k * 8}deg) translateY(${Math.abs(k) * 5}%)`,
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <div
                    className="card-tile aspect-[63/88]"
                    style={isBest ? { boxShadow: `0 0 40px 8px ${GLOW[c.tier] ?? "rgba(255,255,255,.3)"}` } : undefined}
                  >
                    <CardImage base={c.image} alt={c.name} quality="high" />
                    <span className={`tile-badge bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap !px-1.5 !text-[10px] ${TIER_CLASS[c.tier]}`}>
                      {TIER_LABEL[c.tier]}
                    </span>
                    {c.isNew && (
                      <span className="tile-badge left-1.5 top-1.5 !bg-accent !px-1.5 !text-[10px] !text-accent-ink">Nouvelle</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Consigne / résumé */}
        <div className="mt-6 flex min-h-[3.75rem] flex-col items-center justify-center gap-2 text-center">
          {((stage === "sealed" && canOpen) || stage === "tearing") && (
            <SlideToOpen
              progress={progress}
              onProgress={setProgress}
              onOpen={() => void startOpening()}
              opening={stage === "tearing"}
            />
          )}
          {stage === "sealed" && !canOpen && (
            <p className="text-sm text-muted">
              Plus de booster. Prochain dans {nextAt ? formatCountdown(nextAt - now) : "…"}.
            </p>
          )}
          {stage === "revealing" && rv.remaining.length > 0 && (
            <div className={`flex items-center gap-3 transition-opacity ${idle ? "opacity-100" : "opacity-0"}`}>
              <p className="text-sm text-muted">Touche la carte du dessus</p>
              <button type="button" onClick={revealAll} disabled={!idle} className="btn btn-ghost !py-1.5 text-[13px]">
                Tout retourner
              </button>
            </div>
          )}
          {done && (
            <>
              <p className="display text-2xl font-bold">
                {newCount > 0 ? `${newCount} nouvelle${newCount > 1 ? "s" : ""} !` : "Que des doublons"}
              </p>
              {best && (
                <p className="-mt-1 text-sm text-muted">
                  Meilleur tirage : <span className="font-medium text-foreground">{best.name}</span>
                  <span className="text-faint"> · {TIER_LABEL[best.tier]}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={onClose} className="btn btn-ghost">
                  Changer de set
                </button>
                <Link href="/boosters/collection" className="btn btn-ghost">
                  Ma collection
                </Link>
                <button type="button" onClick={again} disabled={!canOpen} className="btn btn-primary">
                  <Package size={15} aria-hidden />
                  {canOpen ? "Encore un !" : "Plus de booster"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rangée des cartes déjà retournées */}
      <div
        className={`relative z-10 flex items-end justify-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-[height,opacity] duration-300 sm:gap-3 ${
          showingRow ? "h-[24vh] min-h-[150px] opacity-100" : "h-[max(1.5rem,env(safe-area-inset-bottom))] opacity-0"
        }`}
      >
        {showingRow &&
          rv.revealed.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setDetail(c)}
              aria-label={`Voir ${c.name}`}
              className="w-[16%] max-w-[104px] animate-[card-land_.5s_cubic-bezier(.2,.8,.3,1)_both] transition-transform hover:-translate-y-1.5"
            >
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
            </button>
          ))}
      </div>

      <GameCardDetail
        card={
          detail
            ? {
                id: detail.id,
                image: detail.image,
                name: detail.name,
                set_name: set.name,
                local_id: detail.local_id,
                tier: detail.tier,
                isNew: detail.isNew,
                gradable: true,
              }
            : null
        }
        onClose={() => setDetail(null)}
        z="z-[80]"
      />
      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>,
    document.body
  );
}

/** Diamètre du bouton coulissant et marge intérieure de la piste (px) */
const KNOB = 52;
const PAD = 4;

/**
 * « Glisse pour ouvrir » : piste avec un bouton qu'on tire vers la droite,
 * façon slide to unlock. Partage `progress` avec la bande de déchirure de
 * l'emballage, qui cède en même temps. Sans mouvement, rien ne s'ouvre
 * (pas d'ouverture par simple tape) ; au clavier, Entrée / → ouvrent.
 */
function SlideToOpen({
  progress,
  onProgress,
  onOpen,
  opening,
}: {
  progress: number;
  onProgress: (p: number) => void;
  onOpen: () => void;
  opening: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; p0: number; travel: number } | null>(null);
  const [sliding, setSliding] = useState(false);
  const p = opening ? 1 : progress;

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (opening || e.button !== 0) return;
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { id: e.pointerId, x0: e.clientX, p0: progress, travel: r.width - KNOB - PAD * 2 };
    setSliding(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture indisponible : le glisser reste suivi par les events suivants
    }
    navigator.vibrate?.(8);
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = Math.min(1, Math.max(0, d.p0 + (e.clientX - d.x0) / d.travel));
    if (next >= 0.96) {
      drag.current = null;
      setSliding(false);
      onProgress(1);
      onOpen();
      return;
    }
    onProgress(next);
  }
  function up(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setSliding(false);
    onProgress(0);
  }
  function key(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (opening) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.key === "End") {
      e.preventDefault();
      onOpen();
    }
  }

  const ease = sliding ? "none" : "left .28s cubic-bezier(.2,.8,.3,1), width .28s cubic-bezier(.2,.8,.3,1)";
  return (
    <div
      ref={track}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative h-[60px] w-[min(84vw,340px)] touch-none select-none overflow-hidden rounded-full border border-white/10 bg-white/[0.06] shadow-[inset_0_2px_10px_rgba(0,0,0,.55)]"
    >
      {/* Remplissage derrière le bouton */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/0 via-accent/25 to-accent/50"
        style={{ width: `calc(${KNOB + PAD * 2}px + ${p} * (100% - ${KNOB + PAD * 2}px))`, transition: ease }}
      />
      {/* Libellé, qui s'efface à mesure qu'on glisse */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center gap-1.5 pl-10 text-[15px] font-medium tracking-wide"
        style={{ opacity: opening ? 1 : Math.max(0, 1 - progress * 1.8) }}
      >
        <span className={opening ? "text-white/80" : "slide-hint"}>{opening ? "Ouverture…" : "Glisse pour ouvrir"}</span>
        {!opening && <ChevronsRight size={18} className="text-white/50" aria-hidden />}
      </div>
      {/* Bouton coulissant */}
      <div
        role="slider"
        tabIndex={opening ? -1 : 0}
        aria-label="Glisser pour ouvrir le booster"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        onKeyDown={key}
        className={`absolute top-1 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_6px_18px_rgba(240,72,62,.45)] outline-none ring-white/60 focus-visible:ring-2 ${
          opening ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{ left: `calc(${PAD}px + ${p} * (100% - ${KNOB + PAD * 2}px))`, transition: ease }}
      >
        <Scissors size={22} aria-hidden className={opening ? "animate-pulse" : ""} />
      </div>
    </div>
  );
}
