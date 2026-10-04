import { TIER_LABEL, TIERS, type Tier } from "@/lib/game";
import { rarityLabel, rarityRank, raritySymbol } from "@/lib/rarity";

/** Couleurs de rareté pour un `tile-badge` (le badge de tuile du site), par palier du jeu */
export const TIER_TILE: Record<Tier, string> = {
  common: "!bg-neutral-700/90 !text-neutral-100",
  uncommon: "!bg-emerald-700/90 !text-emerald-50",
  rare: "!bg-sky-700/90 !text-sky-50",
  holo: "!bg-violet-700/90 !text-violet-50",
  ultra: "!bg-amber-500/95 !text-black",
  secret: "!bg-gradient-to-r !from-amber-300 !via-rose-300 !to-sky-300 !text-black",
};

/** Libellé affiché : la rareté TCGdex de la carte (« Double rare », « Illustration rare »…), le palier du jeu à défaut */
export function rarityText(rarity: string | null | undefined, tier: Tier): string {
  return rarity ? rarityLabel(rarity) : TIER_LABEL[tier];
}

/** Badge de rareté dans le coin bas gauche d'une tuile : symbole et libellé TCGdex, couleur du palier */
export function RarityBadge({ rarity, tier, className = "bottom-1.5 left-1.5", compact = false }: { rarity: string | null | undefined; tier: Tier; className?: string; compact?: boolean }) {
  const sym = rarity ? raritySymbol(rarity) : null;
  if (compact) {
    return (
      <span className={`tile-badge whitespace-nowrap !px-1 !text-[9px] ${className} ${TIER_TILE[tier]}`} title={rarityText(rarity, tier)} aria-label={rarityText(rarity, tier)}>
        {sym ?? rarityText(rarity, tier).slice(0, 1)}
      </span>
    );
  }
  return (
    <span className={`tile-badge whitespace-nowrap ${className} ${TIER_TILE[tier]}`}>
      {sym && (
        <span className="mr-1" aria-hidden>
          {sym}
        </span>
      )}
      {rarityText(rarity, tier)}
    </span>
  );
}

/** Pastille de rareté hors tuile (fiche, bannière) */
export function RarityPill({ rarity, tier, className = "" }: { rarity: string | null | undefined; tier: Tier; className?: string }) {
  const sym = rarity ? raritySymbol(rarity) : null;
  const tone = TIER_TILE[tier].replace(/!/g, "");
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone} ${className}`}>
      {sym && <span aria-hidden>{sym}</span>}
      {rarityText(rarity, tier)}
    </span>
  );
}

/** Rang de tri d'une rareté TCGdex (ordre du site), le palier du jeu en secours */
export function rarityOrder(rarity: string | null | undefined, tier: Tier): number {
  if (rarity) {
    const r = rarityRank(rarityLabel(rarity));
    if (r !== 999) return r;
  }
  return 100 + TIERS.indexOf(tier);
}
