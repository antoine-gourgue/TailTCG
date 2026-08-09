"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CardImage } from "@/components/card-image";

export type SetCard = {
  id: string;
  localId: string;
  name: string;
  image: string | null;
  rarity: string | null;
};

/** Ordre d'affichage des raretés (inconnues à la fin) */
const RARITY_ORDER = [
  "Commune",
  "Peu Commune",
  "Rare",
  "Rare Holo",
  "Rare Holo EX",
  "Rare Holo LV.X",
  "Rare Prime",
  "LÉGENDE",
  "Ultra Rare",
  "Magnifique rare",
  "Double rare",
  "Illustration rare",
  "Illustration spéciale rare",
  "Hyper rare",
  "Chromatique rare",
  "Chromatique ultra rare",
  "Rare Secrète",
  "Secrète",
  "Promo",
];

const RARITY_SYMBOLS: Record<string, string> = {
  Commune: "●",
  "Peu Commune": "◆",
  Rare: "★",
  "Rare Holo": "✦",
  "Rare Holo EX": "✦",
  "Rare Holo LV.X": "✦",
  "Rare Prime": "✹",
  LÉGENDE: "▞",
  "Ultra Rare": "✸",
  "Double rare": "★★",
  "Illustration rare": "✧",
  "Illustration spéciale rare": "✧✧",
  "Hyper rare": "🟊",
  "Rare Secrète": "✪",
  Secrète: "✪",
  Promo: "◈",
};

const UNKNOWN = "Autre";

function rarityRank(r: string): number {
  const i = RARITY_ORDER.indexOf(r);
  return i === -1 ? 999 : i;
}

export function SetCardsGrid({
  cards,
  officialCount,
  langSuffix,
}: {
  cards: SetCard[];
  officialCount: number | null;
  langSuffix: string;
}) {
  // Raretés présentes dans le set, ordonnées, avec compteur
  const rarities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const r = c.rarity ?? UNKNOWN;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => rarityRank(a[0]) - rarityRank(b[0])
    );
  }, [cards]);

  // Tout sélectionné par défaut
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(rarity: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  }

  const visible = cards.filter((c) => !hidden.has(c.rarity ?? UNKNOWN));

  return (
    <div>
      {/* Filtres de rareté, façon Pokécardex */}
      {rarities.length > 1 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {rarities.map(([rarity, count]) => {
            const active = !hidden.has(rarity);
            return (
              <button
                key={rarity}
                type="button"
                data-on={active}
                onClick={() => toggle(rarity)}
                title={`${rarity} · ${count} carte${count > 1 ? "s" : ""}`}
                aria-label={`${active ? "Masquer" : "Afficher"} : ${rarity}`}
                className={`seg flex h-10 min-w-10 items-center justify-center px-2 text-base ${
                  active ? "text-accent-strong" : "text-faint opacity-50"
                }`}
              >
                <span aria-hidden>{RARITY_SYMBOLS[rarity] ?? "✶"}</span>
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted">
          Toutes les raretés sont masquées — réactive un filtre ci-dessus.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visible.map((card) => (
            <li key={card.id}>
              <Link
                href={`/ajouter?card=${encodeURIComponent(card.id)}${langSuffix}`}
                className="group block"
              >
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={card.image} alt={card.name} />
                </div>
                <div className="mt-2.5 px-0.5">
                  <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                    {card.name}
                  </p>
                  <p className="num mt-0.5 text-xs text-faint">
                    {card.localId}
                    {officialCount ? ` / ${officialCount}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
