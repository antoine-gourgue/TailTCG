"use client";

import type { CSSProperties } from "react";
import { Package } from "lucide-react";
import type { PlayableSet } from "@/lib/game-sets";

/** Teinte propre à chaque set, pour que deux paquets ne se ressemblent pas */
export function hueOf(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Bord crénelé de l'emballage (haut de la bande / haut du corps une fois déchiré) */
const TEETH = 18;
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
const CLIP_BODY_TORN = zig("top", 2.4);
const CLIP_STRIP = zig("bottom", 32);
const CRIMP = "repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 2px, rgba(0,0,0,.4) 2px 5px)";
/** Voile holographique arc-en-ciel, discret, en surimpression */
const HOLO =
  "repeating-linear-gradient(115deg, rgba(255,80,120,.18) 0 12%, rgba(255,214,102,.18) 12% 24%, rgba(120,255,180,.18) 24% 36%, rgba(96,190,255,.18) 36% 48%, rgba(196,150,255,.18) 48% 60%)";

/**
 * Emballage de booster façon Pokémon TCG Pocket : aluminium coloré (teinte
 * propre au set), reflet holographique, grand logo de l'extension au centre,
 * sertissages et bande à déchirer. Aucune carte n'y figure. Tout est en
 * unités de conteneur : même dessin dans le carrousel et sur la scène.
 * `torn` fait partir la bande ; `progress` (0–1) la soulève quand on tire.
 */
export function PackArt({
  set,
  torn = false,
  progress = 0,
  shine = true,
  className = "",
}: {
  set: PlayableSet;
  torn?: boolean;
  progress?: number;
  shine?: boolean;
  className?: string;
}) {
  const hue = hueOf(set.id);
  const light = `hsl(${hue} 85% 62%)`;
  const mid = `hsl(${hue} 70% 34%)`;
  const deep = `hsl(${hue} 65% 15%)`;
  const accent = `hsl(${(hue + 40) % 360} 90% 60%)`;
  return (
    <div className={`@container relative ${className}`} style={{ transformStyle: "preserve-3d" } as CSSProperties}>
      <div className="relative aspect-[236/380] w-full">
        {/* Corps de l'emballage */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[8cqw] border border-white/20 shadow-[0_30px_60px_rgba(0,0,0,.65),inset_0_2px_0_rgba(255,255,255,.35),inset_0_-3px_6px_rgba(0,0,0,.6)]"
          style={{
            background: `linear-gradient(150deg, ${light} 0%, ${mid} 42%, ${deep} 100%)`,
            clipPath: torn ? CLIP_BODY_TORN : undefined,
          }}
        >
          {/* Lueur centrale */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: `radial-gradient(70% 46% at 50% 40%, ${accent}88, transparent 72%)` }}
          />
          {/* Rayons partant du centre */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 mix-blend-screen"
            style={{
              background: `repeating-conic-gradient(from 0deg at 50% 42%, rgba(255,255,255,.5) 0deg 3deg, transparent 3deg 14deg)`,
              maskImage: "radial-gradient(60% 46% at 50% 42%, #000 30%, transparent 72%)",
              WebkitMaskImage: "radial-gradient(60% 46% at 50% 42%, #000 30%, transparent 72%)",
            }}
          />
          {/* Voile holographique */}
          <div aria-hidden className="absolute inset-0 opacity-25 mix-blend-overlay" style={{ background: HOLO }} />
          {/* Reflet vertical du pli */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,.22) 0%, transparent 10%, transparent 50%, rgba(255,255,255,.1) 60%, transparent 74%, rgba(0,0,0,.25) 100%)",
            }}
          />
          {/* Sertissages haut et bas */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-[6cqw] opacity-90" style={{ background: CRIMP }} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[7cqw] opacity-90" style={{ background: CRIMP }} />

          {/* Marque, tout en haut */}
          <div className="absolute inset-x-0 top-[10cqw] text-center">
            <span className="num text-[3.6cqw] font-bold uppercase tracking-[0.42em] text-white/80">TailTCG</span>
          </div>

          {/* Logo de l'extension, grand, au centre */}
          <div className="absolute inset-x-[8cqw] top-[26cqw] flex h-[42cqw] items-center justify-center">
            {set.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${set.logo}.png`}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain drop-shadow-[0_4cqw_8cqw_rgba(0,0,0,.7)]"
              />
            ) : (
              <Package className="h-[20cqw] w-[20cqw] text-white/85" aria-hidden />
            )}
          </div>

          {/* Bas : série + mention */}
          <div className="absolute inset-x-0 bottom-[10cqw] flex flex-col items-center gap-[1.4cqw] px-[8cqw]">
            <span className="max-w-full truncate text-[3.8cqw] font-semibold uppercase tracking-[0.16em] text-white/85">
              {set.serie}
            </span>
            <span className="num rounded-full border border-white/40 px-[4cqw] py-[0.8cqw] text-[3.4cqw] font-bold uppercase tracking-[0.2em] text-white/90">
              5 cartes
            </span>
          </div>

          {shine && <div className="foil-shine" />}
        </div>

        {/* Bande à déchirer */}
        <div
          className={`absolute inset-x-0 -top-px h-[10cqw] ${torn ? "animate-[pack-strip-off_.6s_ease-in_forwards]" : ""}`}
          style={!torn ? { transform: `translateY(${-progress * 10}px) rotate(${-progress * 5}deg)` } : undefined}
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-t-[8cqw] border border-b-0 border-white/25"
            style={{ background: `linear-gradient(180deg, ${light} 0%, ${mid} 100%)`, clipPath: CLIP_STRIP }}
          >
            <div aria-hidden className="absolute inset-0 opacity-90" style={{ background: CRIMP }} />
            <div aria-hidden className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ background: HOLO }} />
          </div>
          {/* Pointillé de découpe + curseur qui suit le doigt */}
          <div aria-hidden className="absolute inset-x-[4cqw] top-[64%] border-t border-dashed border-white/50" />
          <div
            aria-hidden
            className="absolute left-0 top-[64%] h-[3px] -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,.8)] transition-[width] duration-75"
            style={{ width: `${progress * 100}%`, opacity: progress > 0 ? 1 : 0 }}
          />
          <div
            aria-hidden
            className="absolute top-[64%] flex h-[6cqw] w-[6cqw] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/50 text-white shadow-[0_0_12px_rgba(255,255,255,.85)] transition-[left] duration-75"
            style={{ left: `${Math.max(5, progress * 100)}%`, opacity: torn ? 0 : 1 }}
          >
            <span className="text-[3cqw]">✂</span>
          </div>
        </div>
      </div>
    </div>
  );
}
