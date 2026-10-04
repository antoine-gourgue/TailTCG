"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CardImage } from "@/components/card-image";
import { CardGrid, TileCaption } from "@/components/card-grid-kit";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { RarityBadge, rarityOrder, rarityText } from "@/components/game/tier-badge";
import { gradeTone, type Grade, type Tier } from "@/lib/game";

export type SetGridCard = {
  /** id catalogue (tcgdex) */
  id: string;
  /** id de l'exemplaire possédé (game_cards), pour grader */
  rowId: string | null;
  name: string;
  localId: string;
  image: string | null;
  tier: Tier;
  rarity: string | null;
  qty: number;
  grade: Grade | null;
  obtainedAt: string | null;
  forTrade: boolean;
};

type Own = "all" | "owned" | "missing";

/**
 * Grille d'un set dans la collection virtuelle : possédées en couleur (×n,
 * note en badge doré si gradée), manquantes grisées. Puces Toutes /
 * Possédées / Manquantes et sélecteur de rareté TCGdex. Clic → fiche.
 */
export function CollectionSetGrid({ cards, setId, setName }: { cards: SetGridCard[]; setId: string; setName: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<SetGridCard | null>(null);
  const [own, setOwn] = useState<Own>("all");
  const [rarity, setRarity] = useState("");
  const total = cards.length;
  const ownedCount = cards.filter((c) => c.qty > 0).length;

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

  const visible = cards.filter((c) => (own === "all" || (own === "owned" ? c.qty > 0 : c.qty === 0)) && (!rarity || rarityText(c.rarity, c.tier) === rarity));

  const view: GameCardView | null = detail
    ? {
        id: detail.rowId ?? undefined,
        image: detail.image,
        name: detail.name,
        set_name: setName,
        set_id: setId,
        set_total: total,
        local_id: detail.localId,
        tier: detail.tier,
        rarity: detail.rarity,
        qty: detail.qty,
        grade: detail.grade,
        obtained_at: detail.obtainedAt,
        for_trade: detail.rowId ? detail.forTrade : undefined,
        setProgress: { owned: ownedCount, total },
        gradable: detail.grade == null,
      }
    : null;

  const chip = (on: boolean) => `seg shrink-0 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="scrollbar-none -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:basis-auto sm:px-0">
          {(
            [
              ["all", "Toutes", total],
              ["owned", "Possédées", ownedCount],
              ["missing", "Manquantes", total - ownedCount],
            ] as [Own, string, number][]
          ).map(([k, label, n]) => (
            <button key={k} type="button" data-on={own === k} onClick={() => setOwn(k)} className={chip(own === k)}>
              {label} <span className="num text-[11px] opacity-70">{n}</span>
            </button>
          ))}
        </div>
        {rarities.length > 1 && (
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-on={rarity !== ""} aria-label="Rareté" className="pill-select !w-auto text-[13px] sm:ml-auto">
            <option value="">Toutes raretés · {total}</option>
            {rarities.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} · {r.n}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte pour ce filtre.</p>
      ) : (
        <CardGrid>
          {visible.map((c) => {
            const owned = c.qty > 0;
            const inner = (
              <>
                <div className={`card-tile aspect-[63/88] ${owned ? "" : "opacity-35 grayscale"}`}>
                  <CardImage base={c.image} alt={c.name} />
                  {owned && <RarityBadge rarity={c.rarity} tier={c.tier} />}
                  {owned && c.grade ? (
                    <span className="tile-badge num right-1.5 top-1.5" style={{ background: gradeTone(c.grade.overall).ring, color: gradeTone(c.grade.overall).text }}>
                      ✓ {c.grade.overall}
                    </span>
                  ) : (
                    c.qty > 1 && <span className="tile-badge num right-1.5 top-1.5">×{c.qty}</span>
                  )}
                </div>
                <TileCaption
                  name={c.name}
                  sub={
                    <span className="num text-faint">
                      {c.localId} / {total}
                    </span>
                  }
                />
              </>
            );
            return (
              <li key={c.id}>
                {owned ? (
                  <button type="button" onClick={() => setDetail(c)} aria-label={`Voir ${c.name}`} className="group block w-full text-left">
                    {inner}
                  </button>
                ) : (
                  <div aria-hidden>{inner}</div>
                )}
              </li>
            );
          })}
        </CardGrid>
      )}
      <GameCardDetail card={view} onClose={() => setDetail(null)} onGraded={() => router.refresh()} />
    </>
  );
}
