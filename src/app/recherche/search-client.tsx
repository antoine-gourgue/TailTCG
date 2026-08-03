"use client";

import { useEffect, useRef, useState } from "react";
import type { CardSearchResult } from "@/lib/tcgdex";

type Status = "idle" | "loading" | "done" | "error";

export function SearchClient() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();

    if (q.length < 2) {
      setCards([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
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
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nom de la carte… (ex. aligatueur)"
        autoFocus
        className="mb-8 w-full max-w-md rounded-lg border border-edge bg-surface px-4 py-3 text-foreground placeholder:text-muted focus:border-neutral-500 focus:outline-none"
      />

      {status === "idle" && (
        <p className="text-sm text-muted">
          Tape au moins deux lettres pour chercher dans le catalogue français
          TCGdex.
        </p>
      )}

      {status === "loading" && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="aspect-[63/88] animate-pulse rounded-lg bg-surface"
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-red-400">
          TCGdex est injoignable, réessaie dans un instant.
        </p>
      )}

      {status === "done" && cards.length === 0 && (
        <p className="text-sm text-muted">
          Aucune carte trouvée pour « {query.trim()} ».
        </p>
      )}

      {status === "done" && cards.length > 0 && (
        <>
          <p className="mb-4 text-sm text-muted">
            <span className="num">{cards.length}</span> carte
            {cards.length > 1 ? "s" : ""} trouvée{cards.length > 1 ? "s" : ""}
          </p>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {cards.map((card) => (
              <li key={card.id}>
                <div className="card-tile aspect-[63/88] bg-surface">
                  {card.image ? (
                    /* Images TCGdex déjà optimisées : balise img classique
                       pour préserver le quota next/image du plan Hobby */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${card.image}/low.webp`}
                      alt={card.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-edge p-3 text-center">
                      <span className="text-2xl">🃏</span>
                      <span className="text-xs text-muted">
                        Pas d&apos;image
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2 px-0.5">
                  <p className="truncate text-sm font-medium">{card.name}</p>
                  <p className="truncate text-xs text-muted">
                    {card.setName}{" "}
                    <span className="num">
                      · {card.localId}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
