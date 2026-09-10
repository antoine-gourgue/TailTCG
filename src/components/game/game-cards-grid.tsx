"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Search } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { GradedSlab } from "@/components/graded-slab";
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

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Toutes les cartes possédées (une tuile par exemplaire) : recherche par nom,
 * filtres set / rareté / gradées, tri, puis détail au clic (grader, notes).
 */
export function GameCardsGrid({
  cards,
  initialSort = "recent",
  hideGradedFilter = false,
}: {
  cards: OwnedCard[];
  initialSort?: Sort;
  /** Masque le filtre « Gradées » (ex. liste déjà 100 % gradée) */
  hideGradedFilter?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OwnedCard | null>(null);
  const [q, setQ] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>(initialSort);

  const sets = useMemo(
    () => [...new Set(cards.map((c) => c.setName))].sort((a, b) => a.localeCompare(b, "fr")),
    [cards]
  );
  const tiers = useMemo(() => {
    const present = new Set(cards.map((c) => c.tier));
    return TIERS.filter((t) => present.has(t));
  }, [cards]);
  const gradedCount = useMemo(() => cards.filter((c) => c.grade).length, [cards]);

  const needle = normalize(q.trim());
  const list = useMemo(() => {
    const out = cards.filter(
      (c) =>
        (!needle || normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) &&
        (setFilter === "all" || c.setName === setFilter) &&
        (tierFilter === "all" || c.tier === tierFilter) &&
        (!gradedOnly || c.grade != null)
    );
    if (sort === "rarity") out.sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier));
    else if (sort === "grade")
      out.sort((a, b) => (b.grade?.overall ?? -1) - (a.grade?.overall ?? -1));
    return out;
  }, [cards, needle, setFilter, tierFilter, gradedOnly, sort]);

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
      {/* Recherche */}
      <div className="relative mb-3">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher une carte, un set…"
          className="field !pl-9"
        />
      </div>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!hideGradedFilter && (
          <button
            type="button"
            onClick={() => setGradedOnly((v) => !v)}
            aria-pressed={gradedOnly}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              gradedOnly ? "bg-accent text-accent-ink" : "border border-edge text-muted hover:text-foreground"
            }`}
          >
            <BadgeCheck size={14} aria-hidden />
            Gradées <span className="num opacity-70">{gradedCount}</span>
          </button>
        )}

        {sets.length > 1 && (
          <select
            value={setFilter}
            onChange={(e) => setSetFilter(e.target.value)}
            aria-label="Filtrer par set"
            className="field !w-auto max-w-[45vw] !py-1.5 text-[13px]"
          >
            <option value="all">Tous les sets</option>
            {sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {tiers.length > 1 && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as "all" | Tier)}
            aria-label="Filtrer par rareté"
            className="field !w-auto !py-1.5 text-[13px]"
          >
            <option value="all">Toutes raretés</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Trier"
          className="field !ml-auto !w-auto !py-1.5 text-[13px]"
        >
          <option value="recent">Plus récentes</option>
          <option value="rarity">Rareté</option>
          <option value="grade">Note</option>
        </select>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl bg-raised/60 px-4 py-8 text-center text-sm text-muted">
          Aucune carte ne correspond.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
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
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                    <p className="truncate text-[11px] text-faint">{c.setName}</p>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <GameCardDetail card={view} onClose={() => setOpen(null)} onGraded={() => router.refresh()} />
    </>
  );
}
