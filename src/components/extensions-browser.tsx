"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import type { SerieWithSets, CatalogLang } from "@/lib/tcgdex";
import { Logo } from "@/components/logo";

function SetLogo({
  logo,
  symbol,
  name,
}: {
  logo?: string;
  symbol?: string;
  name: string;
}) {
  // Cascade : logo (.webp puis .png) → symbole → icône générique
  const candidates = useMemo(
    () =>
      [
        logo && `${logo}.webp`,
        logo && `${logo}.png`,
        symbol && `${symbol}.webp`,
        symbol && `${symbol}.png`,
      ].filter((s): s is string => Boolean(s)),
    [logo, symbol]
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={`mx-auto object-contain ${isSymbol ? "h-10" : "h-14 max-w-full"}`}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

export function ExtensionsBrowser({
  series,
  lang,
  customCount = 0,
}: {
  series: SerieWithSets[];
  lang: CatalogLang;
  customCount?: number;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return series;
    return series
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
  }, [series, q]);

  const totalSets = series.reduce((acc, s) => acc + s.sets.length, 0);

  return (
    <div>
      {/* Filtre + bascule de catalogue */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Nom ou code d'extension… (${totalSets} sets)`}
          className="field max-w-sm"
        />
        <div className="flex overflow-hidden rounded-xl border border-edge">
          <Link
            href="/recherche"
            className={`px-3.5 py-2 text-sm transition ${
              lang === "fr"
                ? "bg-accent-soft font-semibold text-accent-strong"
                : "text-muted hover:text-foreground"
            }`}
          >
            Internationales
          </Link>
          <Link
            href="/recherche?lang=ja"
            className={`border-l border-edge px-3.5 py-2 text-sm transition ${
              lang === "ja"
                ? "bg-accent-soft font-semibold text-accent-strong"
                : "text-muted hover:text-foreground"
            }`}
          >
            Japonaises
          </Link>
        </div>
      </div>

      {lang === "ja" && (
        <p className="mb-6 rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-muted">
          TCGdex ne fournit pas encore les visuels japonais (logos et scans) —
          tu peux quand même parcourir les sets et ajouter les cartes avec
          leurs noms officiels.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune extension ne correspond à « {q.trim()} ».
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {customCount > 0 && !q.trim() && (
            <section>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="display text-xl font-semibold">Mon catalogue</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Link
                  href="/extensions/perso"
                  className="panel group flex flex-col gap-3 p-4 transition hover:border-accent hover:shadow-lg"
                >
                  <div className="flex h-14 items-center justify-center">
                    <Logo variant="mark" size={44} interactive={false} />
                  </div>
                  <div className="mt-auto">
                    <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                      Cartes hors catalogue
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">
                        perso
                      </span>
                      <span className="num">
                        {customCount} carte{customCount > 1 ? "s" : ""}
                      </span>
                    </p>
                  </div>
                </Link>
              </div>
            </section>
          )}
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
                      <SetLogo logo={set.logo} symbol={set.symbol} name={set.name} />
                    </div>
                    <div className="mt-auto">
                      <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                        {set.name}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">
                          {set.id}
                        </span>
                        {set.cardCount?.official ? (
                          <span className="num">
                            {set.cardCount.official} cartes
                          </span>
                        ) : null}
                      </p>
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
