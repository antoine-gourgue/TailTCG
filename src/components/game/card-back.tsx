"use client";

import { useState } from "react";

/**
 * Dos de carte du jeu : le dos officiel (`/card-back.webp`, remake 4K de
 * Jasowke redimensionné), sinon un dos dessiné en CSS en secours.
 */
export function CardBack() {
  const [missing, setMissing] = useState(false);
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[4.5%/3.5%] border border-white/10"
      style={{ background: "radial-gradient(circle at 50% 40%, #2b2a31, #141317 70%)" }}
    >
      {!missing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/card-back.webp"
          alt=""
          draggable={false}
          onError={() => setMissing(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div aria-hidden className="absolute inset-[5%] rounded-[6%] border border-white/[0.07]" />
          <div aria-hidden className="absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-square w-[46%] overflow-hidden rounded-full border-[3px] border-white/20 bg-[#1b1a1e]">
              <span className="absolute inset-x-0 top-0 h-1/2 bg-accent/80" />
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[#0e0d10]" />
              <span className="absolute left-1/2 top-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#0e0d10] bg-[#ecebee]" />
            </div>
          </div>
        </>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent"
      />
    </div>
  );
}
