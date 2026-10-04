"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { CardGrid, TileCaption } from "@/components/card-grid-kit";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { RarityBadge, rarityOrder, rarityText } from "@/components/game/tier-badge";
import { GradedSlab } from "@/components/graded-slab";
import { Sheet } from "@/components/sheet";
import { gradeTone, type Grade, type Tier } from "@/lib/game";

export type OwnedCard = {
  id: string;
  name: string;
  setName: string;
  setId?: string;
  localId: string;
  image: string | null;
  tier: Tier;
  /** Rareté TCGdex brute */
  rarity: string | null;
  grade: Grade | null;
  obtainedAt?: string | null;
  forTrade?: boolean;
  /** Exemplaires de cette carte dans la collection virtuelle */
  qty?: number;
};

type Sort = "recent" | "rarity" | "grade" | "name";
type GradedFilter = "" | "oui" | "non";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Toutes les cartes possédées (une tuile par exemplaire), avec la barre de
 * filtres du site : recherche, set, rareté TCGdex, gradation ; pilules sur
 * desktop, sheet « Filtres » sur mobile ; tri et sens. Détail au clic.
 */
export function GameCardsGrid({
  cards,
  initialSort = "recent",
  hideGradedFilter = false,
  slabs = true,
}: {
  cards: OwnedCard[];
  initialSort?: Sort;
  /** Masque le filtre « Gradée ou non » (ex. liste déjà 100 % gradée) */
  hideGradedFilter?: boolean;
  /** Les cartes gradées en boîtier (sinon la carte avec sa note en badge) */
  slabs?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OwnedCard | null>(null);
  const [q, setQ] = useState("");
  const [fSet, setFSet] = useState("");
  const [fRarity, setFRarity] = useState("");
  const [fGraded, setFGraded] = useState<GradedFilter>("");
  const [sort, setSort] = useState<Sort>(initialSort);
  const [asc, setAsc] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sets = useMemo(() => [...new Set(cards.map((c) => c.setName))].sort((a, b) => a.localeCompare(b, "fr")), [cards]);
  const rarities = useMemo(() => {
    const m = new Map<string, { label: string; order: number; n: number }>();
    for (const c of cards) {
      const label = rarityText(c.rarity, c.tier);
      const cur = m.get(label) ?? { label, order: rarityOrder(c.rarity, c.tier), n: 0 };
      cur.n += 1;
      m.set(label, cur);
    }
    return [...m.values()].sort((a, b) => a.order - b.order);
  }, [cards]);

  const needle = normalize(q.trim());
  const list = useMemo(() => {
    const out = cards.filter(
      (c) =>
        (!needle || normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) &&
        (!fSet || c.setName === fSet) &&
        (!fRarity || rarityText(c.rarity, c.tier) === fRarity) &&
        (!fGraded || (fGraded === "oui" ? c.grade != null : c.grade == null))
    );
    const dir = asc ? 1 : -1;
    if (sort === "rarity") out.sort((a, b) => (rarityOrder(b.rarity, b.tier) - rarityOrder(a.rarity, a.tier)) * dir);
    else if (sort === "grade") out.sort((a, b) => ((b.grade?.overall ?? -1) - (a.grade?.overall ?? -1)) * dir);
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name, "fr") * -dir);
    else if (asc) out.reverse();
    return out;
  }, [cards, needle, fSet, fRarity, fGraded, sort, asc]);

  const activeFilters = (fSet ? 1 : 0) + (fRarity ? 1 : 0) + (fGraded ? 1 : 0);
  function resetFilters() {
    setFSet("");
    setFRarity("");
    setFGraded("");
  }

  const filterSelects = (cls: string) => (
    <>
      {sets.length > 1 && (
        <select value={fSet} onChange={(e) => setFSet(e.target.value)} data-on={fSet !== ""} className={cls} aria-label="Set">
          <option value="">Tous les sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {rarities.length > 1 && (
        <select value={fRarity} onChange={(e) => setFRarity(e.target.value)} data-on={fRarity !== ""} className={cls} aria-label="Rareté">
          <option value="">Toutes raretés</option>
          {rarities.map((r) => (
            <option key={r.label} value={r.label}>
              {r.label} · {r.n}
            </option>
          ))}
        </select>
      )}
      {!hideGradedFilter && (
        <select value={fGraded} onChange={(e) => setFGraded(e.target.value as GradedFilter)} data-on={fGraded !== ""} className={cls} aria-label="Gradation">
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
      <option value="name">Tri : nom</option>
    </select>
  );
  const sortToggle = (
    <button type="button" onClick={() => setAsc((v) => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground" title={asc ? "Croissant" : "Décroissant"} aria-label={asc ? "Tri croissant" : "Tri décroissant"}>
      {asc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
    </button>
  );

  const view: GameCardView | null = open
    ? {
        id: open.id,
        image: open.image,
        name: open.name,
        set_name: open.setName,
        set_id: open.setId,
        local_id: open.localId,
        tier: open.tier,
        rarity: open.rarity,
        grade: open.grade,
        obtained_at: open.obtainedAt,
        for_trade: open.forTrade,
        qty: open.qty,
        gradable: open.grade == null,
      }
    : null;

  return (
    <>
      {/* Filtres et tri — desktop : tout en ligne */}
      <div className="mb-5 hidden flex-wrap items-center gap-2 sm:flex">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une carte, un set…" aria-label="Chercher" className="pill-input !w-56" />
        {filterSelects("pill-select !w-auto text-[13px]")}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="num mr-1 text-xs text-muted">{list.length}</span>
          {sortSelect("pill-select !w-auto text-[13px]")}
          {sortToggle}
        </span>
      </div>

      {/* Mobile : recherche pleine largeur, filtres dans une sheet */}
      <div className="mb-4 flex flex-col gap-2 sm:hidden">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une carte, un set…" aria-label="Chercher" className="pill-input" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFiltersOpen(true)} data-on={activeFilters > 0} className={`seg flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[13px] ${activeFilters > 0 ? "font-medium text-accent-strong" : "text-muted"}`}>
            <SlidersHorizontal size={14} aria-hidden />
            Filtres
            {activeFilters > 0 && <span className="num rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{activeFilters}</span>}
          </button>
          {sortSelect("pill-select min-w-0 flex-1 text-[13px]")}
          {sortToggle}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte ne correspond aux filtres.</p>
      ) : (
        <CardGrid>
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c)} aria-label={`Voir ${c.name}`} className="group block w-full text-left">
                {c.grade && slabs ? (
                  <GradedSlab name={c.name} setName={c.setName} localId={c.localId} imageUrl={c.image} grade={c.grade.overall} centering={c.grade.centering} corners={c.grade.corners} edges={c.grade.edges} surface={c.grade.surface} />
                ) : (
                  <>
                    <div className="card-tile aspect-[63/88]">
                      <CardImage base={c.image} alt={c.name} />
                      <RarityBadge rarity={c.rarity} tier={c.tier} />
                      {c.grade && (
                        <span className="tile-badge num right-1.5 top-1.5" style={{ background: gradeTone(c.grade.overall).ring, color: gradeTone(c.grade.overall).text }}>
                          ✓ {c.grade.overall}
                        </span>
                      )}
                      {!c.grade && c.qty != null && c.qty > 1 && <span className="tile-badge num right-1.5 top-1.5">×{c.qty}</span>}
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
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtres" description={`${list.length} carte${list.length > 1 ? "s" : ""} correspond${list.length > 1 ? "ent" : ""}.`}>
        <div className="flex flex-col gap-2.5">{filterSelects("field text-[15px]")}</div>
        <div className="sheet-actions">
          <button type="button" onClick={resetFilters} disabled={activeFilters === 0} className="btn btn-ghost disabled:opacity-40">
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
