"use client";

import { useRef, useState } from "react";
import { ImageOff } from "lucide-react";

// Image de carte TCGdex avec secours : si l'asset est en 404, on tente le
// même chemin dans TOUTES les autres langues, sinon placeholder.
const LANG_CASCADE = ["fr", "en", "de", "es", "it", "ja"];

/** Langue présente dans une URL d'asset TCGdex, ou null */
function langOf(src: string): string | null {
  return src.match(/assets\.tcgdex\.net\/([a-z-]+)\//)?.[1] ?? null;
}

/** Prochaine langue non encore tentée (parcourt toute la liste) */
function nextLangSrc(src: string, tried: Set<string>): string | null {
  const cur = langOf(src);
  if (!cur) return null;
  const next = LANG_CASCADE.find((l) => l !== cur && !tried.has(l));
  if (!next) return null;
  return src.replace(
    `assets.tcgdex.net/${cur}/`,
    `assets.tcgdex.net/${next}/`
  );
}

export function CardImage({
  base,
  alt,
  quality = "low",
  className = "h-full w-full object-cover",
  direct = false,
  fallback = null,
}: {
  base: string | null;
  alt: string;
  quality?: "low" | "high";
  className?: string;
  /** base est déjà une URL finale (photo perso signée…), pas une base TCGdex */
  direct?: boolean;
  /** URL de secours (photo perso) si aucun scan n'existe */
  fallback?: string | null;
}) {
  const isDirect =
    direct || (base?.startsWith("http") && !base.includes("assets.tcgdex.net"));
  const initial = base
    ? isDirect
      ? base
      : `${base}/${quality === "low" ? "low.webp" : "high.png"}`
    : fallback;
  const [src, setSrc] = useState(initial);
  // Langues déjà tentées pour cette carte (évite les boucles)
  const tried = useRef<Set<string>>(
    new Set(initial && !isDirect ? [langOf(initial)].filter(Boolean) as string[] : [])
  );

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-edge p-3 text-center text-faint">
        <ImageOff size={22} strokeWidth={1.6} aria-hidden />
        <span className="text-xs text-muted">Pas d&apos;image</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        if (src === fallback) {
          setSrc(null);
          return;
        }
        const next = isDirect ? null : nextLangSrc(src, tried.current);
        if (next) {
          const l = langOf(next);
          if (l) tried.current.add(l);
        }
        setSrc(next ?? fallback);
      }}
    />
  );
}
