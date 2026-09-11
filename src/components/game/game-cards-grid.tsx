"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { CardGrid, TileCaption } from "@/components/card-grid-kit";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { TierBadge } from "@/components/game/tier-badge";
import { GradedSlab } from "@/components/graded-slab";
import { Sheet } from "@/components/sheet";
import { TIER_LABEL, TIERS, type Grade, type Tier } from "@/lib/game";

export type OwnedCard = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
  tier: Tier;
  grade: Grade | null;
};

type Sort = "recent" | "rarity" | "grade";
type GradedFilter = "" | "oui" | "non";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Toutes les cartes possédées (une tuile par exemplaire), avec la barre de
 * filtres de la collection : recherche, sélecteurs en ligne sur desktop,
 * sheet « Filtres » sur mobile, tri. Détail au clic.
 */
export function GameCardsGrid({
  cards,
  initialSort = "recent",
  hideGradedFilter = false,
}: {
  cards: OwnedCard[];
  initialSort?: Sort;
  /** Masque le filtre « Gradée ou non » (ex. liste déjà 100 % gradée) */
  hideGradedFilter?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OwnedCard | null>(null);
  const [q, setQ] = useState("");
  const [fSet, setFSet] = useState("");
  const [fTier, setFTier] = useState<"" | Tier>("");
  const [fGraded, setFGraded] = useState<GradedFilter>("");
  const [sort, setSort] = useState<Sort>(initialSort);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sets = useMemo(
    () => [...new Set(cards.map((c) => c.setName))].sort((a, b) => a.localeCompare(b, "fr")),
    [cards]
  );
  const tiers = useMemo(() => {
    const present = new Set(cards.map((c) => c.tier));
    return TIERS.filter((t) => present.has(t));
  }, [cards]);

  const needle = normalize(q.trim());
  const list = useMemo(() => {
    const out = cards.filter(
      (c) =>
        (!needle || normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) &&
        (!fSet || c.setName === fSet) &&
        (!fTier || c.tier === fTier) &&
        (!fGraded || (fGraded === "oui" ? c.grade != null : c.grade == null))
    );
    if (sort === "rarity") out.sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier));
    else if (sort === "grade") out.sort((a, b) => (b.grade?.overall ?? -1) - (a.grade?.overall ?? -1));
    return out;
  }, [cards, needle, fSet, fTier, fGraded, sort]);

  const activeFilters = (fSet ? 1 : 0) + (fTier ? 1 : 0) + (fGraded ? 1 : 0);
  function resetFilters() {
    setFSet("");
    setFTier("");
    setFGraded("");
  }

  // Les mêmes sélecteurs servent en ligne (desktop) et dans la sheet (mobile)
  const filterSelects = (cls: string) => (
    <>
      {sets.length > 1 && (
        <select value={fSet} onChange={(e) => setFSet(e.target.value)} className={cls} aria-label="Set">
          <option value="">Tous les sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {tiers.length > 1 && (
        <select
          value={fTier}
          onChange={(e) => setFTier(e.target.value as "" | Tier)}
          className={cls}
          aria-label="Rareté"
        >
          <option value="">Toutes raretés</option>
          {tiers.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      )}
      {!hideGradedFilter && (
        <select
          value={fGraded}
          onChange={(e) => setFGraded(e.target.value as GradedFilter)}
          className={cls}
          aria-label="Gradation"
        >
          <option value="">Gradée ou non</option>
          <option value="oui">Gradées</option>
          <option value="non">Non gradées</option>
        </select>
      )}
    </>
  );
  const sortSelect = (cls: string) => (
    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cls} aria-label="Tri">
      <option value="recent">Tri : plus récentes</option>
      <option value="rarity">Tri : rareté</option>
      <option value="grade">Tri : note</option>
    </select>
  );

  const view: GameCardView | null = open
    ? {
        id: open.id,
        image: open.image,
        name: open.name,
        set_name: open.setName,
        local_id: open.localId,
        tier: open.tier,
        grade: open.grade,
        gradable: false,
      }
    : null;

  return (
    <>
      {/* Filtres et tri — desktop : tout en ligne */}
      <div className="mb-6 hidden flex-wrap items-center gap-2 sm:flex">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher une carte, un set…"
          className="field !w-52 text-[13px]"
        />
        {filterSelects("field !w-auto text-[13px]")}
        <span className="mx-1 h-5 w-px bg-edge" />
        {sortSelect("field !w-auto text-[13px]")}
      </div>

      {/* Mobile : recherche pleine largeur, filtres dans une sheet */}
      <div className="mb-5 flex flex-col gap-2 sm:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher une carte, un set…"
          className="field text-[15px]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={`btn btn-ghost flex-1 !justify-center ${
              activeFilters > 0 ? "!border-accent/50 !text-accent-strong" : ""
            }`}
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filtres
            {activeFilters > 0 && (
              <span className="num rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
                {activeFilters}
              </span>
            )}
          </button>
          {sortSelect("field min-w-0 flex-1 text-[13px]")}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte ne correspond aux filtres.</p>
      ) : (
        <CardGrid>
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                aria-label={`Voir ${c.name}`}
                className="group block w-full text-left"
              >
                {c.grade ? (
                  <GradedSlab
                    name={c.name}
                    setName={c.setName}
                    localId={c.localId}
                    imageUrl={c.image}
                    grade={c.grade.overall}
                    centering={c.grade.centering}
                    corners={c.grade.corners}
                    edges={c.grade.edges}
                    surface={c.grade.surface}
                  />
                ) : (
                  <>
                    <div className="card-tile aspect-[63/88]">
                      <CardImage base={c.image} alt={c.name} />
                      <TierBadge tier={c.tier} />
                    </div>
                    <TileCaption
                      name={c.name}
                      sub={
                        <>
                          {c.setName} <span className="num text-faint">· {c.localId}</span>
                        </>
                      }
                    />
                  </>
                )}
              </button>
            </li>
          ))}
        </CardGrid>
      )}

      {/* Filtres (mobile) */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtres"
        description={`${list.length} carte${list.length > 1 ? "s" : ""} correspond${list.length > 1 ? "ent" : ""}.`}
      >
        <div className="flex flex-col gap-2.5">{filterSelects("field text-[15px]")}</div>
        <div className="sheet-actions">
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilters === 0}
            className="btn btn-ghost disabled:opacity-40"
          >
            Réinitialiser
          </button>
          <button type="button" onClick={() => setFiltersOpen(false)} className="btn btn-primary">
            Voir
          </button>
        </div>
      </Sheet>

      <GameCardDetail card={view} onClose={() => setOpen(null)} onGraded={() => router.refresh()} />
    </>
  );
}
