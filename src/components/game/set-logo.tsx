"use client";

import { useState } from "react";
import { Package } from "lucide-react";

/**
 * Logo d'un set du jeu (base sans extension : TCGdex ou auto-hébergé). Essaie
 * .webp puis .png (TCGdex n'a parfois que l'un des deux), icône de paquet si
 * rien ne charge.
 */
export function SetLogo({ logo, className = "", eager = false }: { logo: string | null; className?: string; eager?: boolean }) {
  const [idx, setIdx] = useState(0);
  const candidates = logo ? [`${logo}.webp`, `${logo}.png`] : [];
  if (idx >= candidates.length) return <Package size={22} className="text-faint" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={candidates[idx]} alt="" loading={eager ? "eager" : "lazy"} onError={() => setIdx((i) => i + 1)} className={className} />;
}
