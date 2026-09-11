import { TIER_LABEL, type Tier } from "@/lib/game";

/** Couleurs de rareté pour un `tile-badge` (le badge de tuile du site) */
export const TIER_TILE: Record<Tier, string> = {
  common: "!bg-neutral-700/90 !text-neutral-100",
  uncommon: "!bg-emerald-700/90 !text-emerald-50",
  rare: "!bg-sky-700/90 !text-sky-50",
  holo: "!bg-violet-700/90 !text-violet-50",
  ultra: "!bg-amber-500/95 !text-black",
  secret: "!bg-gradient-to-r !from-amber-300 !via-rose-300 !to-sky-300 !text-black",
};

/** Badge de rareté dans le coin bas gauche d'une tuile */
export function TierBadge({ tier, className = "bottom-1.5 left-1.5" }: { tier: Tier; className?: string }) {
  return <span className={`tile-badge whitespace-nowrap ${className} ${TIER_TILE[tier]}`}>{TIER_LABEL[tier]}</span>;
}
