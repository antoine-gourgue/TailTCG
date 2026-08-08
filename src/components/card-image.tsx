"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

// Image de carte TCGdex avec secours : si l'asset est en 404, on tente le
// même chemin dans les autres langues, sinon placeholder.
const LANG_CASCADE = ["fr", "en", "de", "es", "it", "ja"];

function nextLangSrc(src: string): string | null {
  const match = src.match(/assets\.tcgdex\.net\/([a-z-]+)\//);
  if (!match) return null;
  const idx = LANG_CASCADE.indexOf(match[1]);
  if (idx === -1 || idx + 1 >= LANG_CASCADE.length) return null;
  return src.replace(
    `assets.tcgdex.net/${match[1]}/`,
    `assets.tcgdex.net/${LANG_CASCADE[idx + 1]}/`
  );
}

export function CardImage({
  base,
  alt,
  quality = "low",
  className = "h-full w-full object-cover",
  direct = false,
}: {
  base: string | null;
  alt: string;
  quality?: "low" | "high";
  className?: string;
  /** base est déjà une URL finale (photo perso signée…), pas une base TCGdex */
  direct?: boolean;
}) {
  const isDirect =
    direct || (base?.startsWith("http") && !base.includes("assets.tcgdex.net"));
  const initial = base
    ? isDirect
      ? base
      : `${base}/${quality === "low" ? "low.webp" : "high.png"}`
    : null;
  const [src, setSrc] = useState(initial);

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
      onError={() => setSrc(isDirect ? null : nextLangSrc(src))}
    />
  );
}
