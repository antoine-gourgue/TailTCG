"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { guessAssetBase, type SerieWithSets, type CatalogLang } from "@/lib/tcgdex";

export function SetLogo({
  logo,
  symbol,
  cover,
  name,
}: {
  logo?: string;
  symbol?: string;
  /** Scan de la première carte du set : sert de visuel quand TCGdex n'a pas de logo (sets japonais) */
  cover?: string;
  name: string;
}) {
  // Cascade : logo (.webp puis .png) → symbole → première carte → icône générique
  const candidates = useMemo(
    () =>
      [
        logo && `${logo}.webp`,
        logo && `${logo}.png`,
        symbol && `${symbol}.webp`,
        symbol && `${symbol}.png`,
        cover,
      ].filter((s): s is string => Boolean(s)),
    [logo, symbol, cover]
  );
  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length) {
    return (
      <span className="flex h-14 items-center justify-center text-faint">
        <Layers size={26} strokeWidth={1.5} aria-hidden />
      </span>
    );
  }

  const src = candidates[idx];
  const isSymbol = symbol && src === `${symbol}.webp`;
  const isCover = src === cover;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={`mx-auto object-contain ${isCover ? "h-14 rounded-md shadow-sm" : isSymbol ? "h-10" : "h-14 max-w-full"}`}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

export function ExtensionsBrowser({
  series,
  lang,
  ownedCountBySet = {},
}: {
  series: SerieWithSets[];
  lang: CatalogLang;
  /** Cartes distinctes possédées par set : avancement sur chaque tuile */
  ownedCountBySet?: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [serieId, setSerieId] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = serieId === "all" ? series : series.filter((s) => s.id === serieId);
    if (!needle) return pool;
    return pool
      .map((serie) => {
        const serieMatch =
          serie.name.toLowerCase().includes(needle) ||
          serie.id.toLowerCase().includes(needle);
        const sets = serieMatch
          ? serie.sets
          : serie.sets.filter(
              (s) =>
                s.name.toLowerCase().includes(needle) ||
                s.id.toLowerCase().includes(needle)
            );
        return { ...serie, sets };
      })
      .filter((serie) => serie.sets.length > 0);
  }, [series, q, serieId]);

  const totalSets = series.reduce((acc, s) => acc + s.sets.length, 0);

  return (
    <div>
      {/* Filtre + bascule de catalogue */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Nom ou code d'extension… (${totalSets} sets)`}
          aria-label="Chercher une extension"
          className="pill-input basis-full sm:basis-auto sm:flex-1 sm:max-w-sm"
        />
        <div className="flex gap-1.5">
          <Link href="/catalogue" data-on={lang === "fr"} className={`seg px-3.5 py-1.5 text-[13px] ${lang === "fr" ? "font-medium text-accent-strong" : "text-muted"}`}>
            Internationales
          </Link>
          <Link href="/catalogue?lang=ja" data-on={lang === "ja"} className={`seg px-3.5 py-1.5 text-[13px] ${lang === "ja" ? "font-medium text-accent-strong" : "text-muted"}`}>
            Japonaises
          </Link>
        </div>
      </div>
      {lang === "fr" && (
      <div className="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" data-on={serieId === "all"} onClick={() => setSerieId("all")} className={`seg shrink-0 px-3.5 py-1.5 text-[13px] ${serieId === "all" ? "font-medium text-accent-strong" : "text-muted"}`}>
          Toutes <span className="num text-[11px] opacity-70">{totalSets}</span>
        </button>
        {series.map((s) => (
          <button key={s.id} type="button" data-on={serieId === s.id} onClick={() => setSerieId(s.id)} className={`seg shrink-0 px-3.5 py-1.5 text-[13px] ${serieId === s.id ? "font-medium text-accent-strong" : "text-muted"}`}>
            {s.name} <span className="num text-[11px] opacity-70">{s.sets.length}</span>
          </button>
        ))}
      </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune extension ne correspond à « {q.trim()} ».
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {filtered.map((serie) => (
            <section key={serie.id}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="display text-xl font-semibold">{serie.name}</h2>
                <span className="num text-sm text-faint">
                  {serie.sets.length} set{serie.sets.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {serie.sets.map((set) => (
                  <Link
                    key={set.id}
                    href={`/extensions/${encodeURIComponent(set.id)}${lang === "ja" ? "?lang=ja" : ""}`}
                    className="panel group flex flex-col gap-3 p-4 transition hover:border-accent hover:shadow-lg"
                  >
                    <div className="flex h-14 items-center justify-center">
                      <SetLogo
                        logo={set.logo}
                        symbol={set.symbol}
                        cover={lang === "ja" ? `${guessAssetBase("ja", serie.id, set.id, "001")}/low.webp` : undefined}
                        name={set.name}
                      />
                    </div>
                    <div className="mt-auto">
                      <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                        {set.name}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">
                          {set.id}
                        </span>
                        {(set.cardCount?.total ?? set.cardCount?.official) ? (
                          <span className="num">
                            {set.cardCount?.total ?? set.cardCount?.official} cartes
                          </span>
                        ) : null}
                      </p>
                      {(() => {
                        const owned = ownedCountBySet[set.id] ?? 0;
                        const total = set.cardCount?.total ?? set.cardCount?.official ?? 0;
                        if (!owned) return null;
                        const pct = total ? Math.round((owned / total) * 100) : null;
                        return (
                          <div className="mt-2">
                            <div className="h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
                              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
                            </div>
                            <p className="num mt-1 text-[11px] text-muted">
                              {owned}
                              {total ? `/${total}` : ""} possédée{owned > 1 ? "s" : ""}
                              {pct != null ? ` · ${pct} %` : ""}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
