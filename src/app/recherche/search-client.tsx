"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { CardSearchResult, SerieWithSets, CatalogLang } from "@/lib/tcgdex";
import { deleteCustomCard } from "@/app/ajouter/manuel/actions";
import { CardImage } from "@/components/card-image";
import { ConfirmAction } from "@/components/confirm-action";
import { ExtensionsBrowser } from "@/components/extensions-browser";

type Status = "idle" | "loading" | "done" | "error";

export type CustomCardTile = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
};

export function SearchClient({
  series,
  lang,
  customCards = [],
}: {
  series: SerieWithSets[];
  lang: CatalogLang;
  customCards?: CustomCardTile[];
}) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      abortRef.current?.abort();
      setCards([]);
      setStatus("idle");
    } else {
      setStatus("loading");
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tcgdex/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(String(res.status));
        const data: { cards: CardSearchResult[] } = await res.json();
        setCards(data.cards);
        setStatus("done");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCards([]);
        setStatus("error");
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Nom ou nom + numéro… (ex. pikachu 27)"
        autoFocus
        className="field mb-8 max-w-md !px-4 !py-3 !text-base"
      />

      {status === "idle" && (
        <>
          {customCards.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="display text-xl font-semibold">
                  Mes cartes hors catalogue
                </h2>
                <span className="num text-sm text-faint">
                  {customCards.length}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {customCards.map((card) => (
                  <li key={card.id} className="group relative">
                    <Link href={`/ajouter?card=custom:${card.id}`} className="block">
                      <div className="card-tile aspect-[63/88]">
                        <CardImage base={card.image} alt={card.name} direct />
                      </div>
                      <div className="mt-2.5 px-0.5">
                        <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                          {card.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {card.setName}{" "}
                          <span className="num text-faint">· {card.localId}</span>
                        </p>
                      </div>
                    </Link>
                    <div className="absolute right-2 top-2 z-20 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <ConfirmAction
                        action={deleteCustomCard}
                        fields={{ card_id: card.id }}
                        title={`Supprimer « ${card.name} » ?`}
                        message="La carte, sa photo ET tes exemplaires en collection (avec leurs photos) seront supprimés définitivement."
                        trigger={<Trash2 size={13} aria-hidden />}
                        triggerAriaLabel="Supprimer la carte hors catalogue"
                        triggerClassName="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur-sm transition hover:bg-loss"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ExtensionsBrowser series={series} lang={lang} />
        </>
      )}

      {status === "loading" && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="aspect-[63/88] animate-pulse rounded-xl bg-surface"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-loss">
          TCGdex est injoignable, réessaie dans un instant.
        </p>
      )}

      {status === "done" && cards.length === 0 && (
        <div className="panel max-w-md p-5 text-sm">
          <p className="mb-2">Aucune carte trouvée pour « {query.trim()} ».</p>
          <p className="text-muted">
            Promo japonaise ou carte absente du catalogue ?{" "}
            <Link
              href="/ajouter/manuel"
              className="text-accent underline-offset-2 hover:underline"
            >
              Ajoute-la manuellement
            </Link>
            .
          </p>
        </div>
      )}

      {status === "done" && cards.length > 0 && (
        <>
          <p className="mb-4 text-sm text-muted">
            <span className="num">{cards.length}</span> carte
            {cards.length > 1 ? "s" : ""} trouvée{cards.length > 1 ? "s" : ""}
          </p>
          <ul className="rise-in grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {cards.map((card) => (
              <li key={card.id}>
                <Link
                  href={`/ajouter?card=${encodeURIComponent(card.id)}`}
                  className="group block"
                >
                  <div className="card-tile aspect-[63/88]">
                    <CardImage base={card.image} alt={card.name} />
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                      {card.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {card.setName}{" "}
                      <span className="num text-faint">· {card.localId}</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
