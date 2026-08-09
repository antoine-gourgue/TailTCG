"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Star, X, Plus } from "lucide-react";
import { toggleWishlist } from "@/app/wishlist/actions";
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
  setId,
  setName,
  wishedIds = [],
}: {
  cards: SetCard[];
  officialCount: number | null;
  langSuffix: string;
  setId: string;
  setName: string;
  wishedIds?: string[];
}) {
  const [selected, setSelected] = useState<SetCard | null>(null);
  const [wished, setWished] = useState<Set<string>>(() => new Set(wishedIds));
  const [pendingWish, startWish] = useTransition();

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function toggleWish(card: SetCard) {
    startWish(async () => {
      const formData = new FormData();
      formData.set("tcgdex_id", card.id);
      formData.set("card_name", card.name);
      formData.set("set_id", setId);
      formData.set("set_name", setName);
      formData.set("local_id", card.localId);
      formData.set("image_url", card.image ?? "");
      const res = await toggleWishlist(null, formData);
      if (res) {
        setWished((prev) => {
          const next = new Set(prev);
          if (res.wished) next.add(card.id);
          else next.delete(card.id);
          return next;
        });
      }
    });
  }
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
              <button
                type="button"
                onClick={() => setSelected(card)}
                className="group block w-full text-left"
              >
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={card.image} alt={card.name} />
                  {wished.has(card.id) && (
                    <span className="tile-badge right-1.5 top-1.5 flex items-center !bg-accent !text-accent-ink">
                      <Star size={11} fill="currentColor" aria-hidden />
                    </span>
                  )}
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
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aperçu de la carte */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
        >
          <div
            className="panel rise-in w-full max-w-xs p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-tile relative aspect-[63/88]">
              <CardImage base={selected.image} alt={selected.name} quality="high" />
              <button
                type="button"
                onClick={() => toggleWish(selected)}
                disabled={pendingWish}
                title={
                  wished.has(selected.id)
                    ? "Retirer des recherchées"
                    : "Ajouter aux recherchées"
                }
                aria-label={
                  wished.has(selected.id)
                    ? "Retirer des recherchées"
                    : "Ajouter aux recherchées"
                }
                className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition ${
                  wished.has(selected.id)
                    ? "bg-accent text-accent-ink"
                    : "bg-black/60 text-white hover:bg-black/80"
                } ${pendingWish ? "opacity-60" : ""}`}
              >
                <Star
                  size={16}
                  fill={wished.has(selected.id) ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
            </div>

            <div className="mt-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="display truncate text-lg font-semibold leading-tight">
                  {selected.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {setName}{" "}
                  <span className="num text-faint">
                    · {selected.localId}
                    {officialCount ? ` / ${officialCount}` : ""}
                  </span>
                </p>
                {selected.rarity && (
                  <p className="mt-1.5 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                    {selected.rarity}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fermer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-raised hover:text-foreground"
              >
                <X size={15} aria-hidden />
              </button>
            </div>

            <Link
              href={`/ajouter?card=${encodeURIComponent(selected.id)}${langSuffix}`}
              className="btn btn-primary mt-4 w-full"
            >
              <Plus size={15} aria-hidden />
              Ajouter à ma collection
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
