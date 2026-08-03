"use client";

import { useState } from "react";

// Image de carte TCGdex avec secours : si l'asset FR est en 404, on tente
// la version EN du même chemin, sinon placeholder.
export function CardImage({
  base,
  alt,
  quality = "low",
  className = "h-full w-full object-cover",
}: {
  base: string | null;
  alt: string;
  quality?: "low" | "high";
  className?: string;
}) {
  const initial = base
    ? `${base}/${quality === "low" ? "low.webp" : "high.png"}`
    : null;
  const [src, setSrc] = useState(initial);

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-edge p-3 text-center">
        <span className="text-2xl">🃏</span>
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
        if (src.includes("/fr/")) {
          setSrc(src.replace("/fr/", "/en/"));
        } else {
          setSrc(null);
        }
      }}
    />
  );
}
