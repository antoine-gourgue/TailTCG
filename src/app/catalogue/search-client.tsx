"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Boxes, Check, FilePlus, Plus, ScanLine, Search, X } from "lucide-react";
import type { CatalogSearchResult, SerieWithSets, CatalogLang } from "@/lib/tcgdex";
import { CardImage } from "@/components/card-image";
import { ExtensionsBrowser, SetLogo } from "@/components/extensions-browser";
import { CardSpotlight } from "@/components/card-spotlight";
import { Sheet } from "@/components/sheet";
import { artworkUrl } from "@/lib/pokedex";
import { raritySymbol } from "@/lib/rarity";
import { quickInfo, type QuickInfo } from "./actions";

type Status = "idle" | "loading" | "done" | "error";
type LangFilter = "all" | "fr" | "ja";
type SortKey = "rel" | "name" | "num";

export type SetProgress = { id: string; name: string; logo: string | null; symbol: string | null; cover: string | null; ja: boolean; owned: number; total: number | null; releaseDate: string | null };
export type RecentCard = { id: string; tcgdexId: string; name: string; setId: string; setName: string; localId: string; image: string | null; rarity: string | null; qty: number; ja: boolean };

/* ——— Recherches récentes : localStorage, lu comme un store externe ——— */
const RECENT_KEY = "tailtcg-recent-searches";
const RECENT_MAX = 6;
let recentCache: string[] = [];
let recentLoaded = false;
const recentListeners = new Set<() => void>();
function readRecent(): string[] {
  if (!recentLoaded) {
    recentLoaded = true;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      recentCache = raw ? (JSON.parse(raw) as string[]).filter((s) => typeof s === "string") : [];
    } catch {
      recentCache = [];
    }
  }
  return recentCache;
}
function pushRecent(q: string) {
  const next = [q, ...readRecent().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  recentCache = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  recentListeners.forEach((l) => l());
}
function subscribeRecent(cb: () => void) {
  recentListeners.add(cb);
  return () => recentListeners.delete(cb);
}
const EMPTY: string[] = [];

/* ——— Mobile ou desktop (la fiche express change de place) ——— */
const MQ = "(max-width: 1023px)";
function subscribeMq(cb: () => void) {
  const m = window.matchMedia(MQ);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useIsMobile = () => useSyncExternalStore(subscribeMq, () => window.matchMedia(MQ).matches, () => false);

function numKey(localId: string): number {
  const m = localId.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function SearchClient({
  series,
  lang,
  customCount = 0,
  pokedexCount = 0,
  ownedQty,
  ownedCountBySet,
  setsInProgress,
  recent,
}: {
  series: SerieWithSets[];
  lang: CatalogLang;
  customCount?: number;
  pokedexCount?: number;
  /** Quantité possédée par id TCGdex (repère « déjà possédée ») */
  ownedQty: Record<string, number>;
  /** Cartes distinctes possédées par set (avancement dans le navigateur d'extensions) */
  ownedCountBySet: Record<string, number>;
  setsInProgress: SetProgress[];
  recent: RecentCard[];
}) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CatalogSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [setFilter, setSetFilter] = useState("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rel");
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  const [info, setInfo] = useState<QuickInfo | "loading" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recents = useSyncExternalStore(subscribeRecent, readRecent, () => EMPTY);
  const isMobile = useIsMobile();

  function handleChange(value: string) {
    setQuery(value);
    setSetFilter("all");
    if (value.trim().length < 2) {
      abortRef.current?.abort();
      setCards([]);
      setStatus("idle");
      setSelected(null);
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
        const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data: { cards: CatalogSearchResult[] } = await res.json();
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

  function select(card: CatalogSearchResult) {
    if (query.trim().length >= 2) pushRecent(query.trim());
    setSelected(card);
    setInfo("loading");
    const key = `${card.lang}/${card.id}`;
    selectedRef.current = key;
    quickInfo(card.id, card.lang)
      .then((i) => {
        if (selectedRef.current === key) setInfo(i);
      })
      .catch(() => {
        if (selectedRef.current === key) setInfo(null);
      });
  }
  function close() {
    setSelected(null);
    selectedRef.current = null;
  }

  /* ——— Résultats filtrés ——— */
  const sets = [...new Map(cards.map((c) => [c.setId, c.setName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = cards
    .filter((c) => (langFilter === "all" || c.lang === langFilter) && (setFilter === "all" || c.setId === setFilter) && (!onlyMissing || !(ownedQty[c.id] > 0)))
    .sort((a, b) => (sortKey === "name" ? a.name.localeCompare(b.name) : sortKey === "num" ? numKey(a.localId) - numKey(b.localId) : 0));
  const missingCount = cards.filter((c) => !(ownedQty[c.id] > 0)).length;
  const addHref = (c: CatalogSearchResult) => `/ajouter?card=${encodeURIComponent(c.id)}${c.lang !== "fr" ? `&lang=${c.lang}` : ""}`;

  const spotlight = selected && (
    <CardSpotlight
      inDialog={isMobile}
      layout={isMobile ? "auto" : "stack"}
      kicker="Fiche express"
      card={{
        name: selected.name,
        image: selected.image,
        setName: selected.setName,
        localId: selected.localId,
        lang: selected.lang === "ja" ? "JP" : null,
      }}
      info={info}
      owned={ownedQty[selected.id] ?? 0}
      setProgress={{ owned: ownedCountBySet[selected.setId] ?? 0, total: info && info !== "loading" ? info.total : null, href: `/extensions/${encodeURIComponent(selected.setId)}${selected.lang === "ja" ? "?lang=ja" : ""}` }}
      actions={
        <Link href={addHref(selected)} className="btn btn-primary w-full !py-3 shadow-lg shadow-accent/30">
          <Plus size={16} aria-hidden /> Ajouter à ma collection
        </Link>
      }
      secondary={
        <Link href={`/extensions/${encodeURIComponent(selected.setId)}${selected.lang === "ja" ? "?lang=ja" : ""}`} className="btn btn-ghost flex-1">
          Voir l’extension <ArrowRight size={14} aria-hidden />
        </Link>
      }
    />
  );

  return (
    <div>
      {/* ——— Recherche ——— */}
      <section className="panel relative overflow-hidden !p-4 sm:!p-5" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface) 55%)" }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim().length >= 2 && cards.length > 0) pushRecent(query.trim());
              }}
              placeholder="Nom, numéro, set… ex. pikachu 27 · mew ex 151 · SV4a 205"
              autoFocus
              aria-label="Chercher une carte"
              className="pill-input !w-full !py-3 !text-[15px]"
            />
            {query && (
              <button type="button" onClick={() => handleChange("")} aria-label="Effacer" className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition hover:text-foreground">
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {(["all", "fr", "ja"] as LangFilter[]).map((l) => (
              <button key={l} type="button" data-on={langFilter === l} onClick={() => setLangFilter(l)} className={`seg px-3.5 py-1.5 text-[13px] ${langFilter === l ? "font-medium text-accent-strong" : "text-muted"}`}>
                {l === "all" ? "Toutes" : l === "fr" ? "FR · EN" : "JA"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted">
          {recents.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>Récentes :</span>
              {recents.map((r) => (
                <button key={r} type="button" onClick={() => handleChange(r)} className="seg px-2.5 py-1 text-xs text-muted hover:text-foreground">
                  {r}
                </button>
              ))}
            </div>
          ) : (
            <span>Tape au moins deux lettres : nom en français, anglais ou japonais, ou un numéro.</span>
          )}
          <span className="hidden sm:inline">
            Raccourci <kbd className="num rounded-md bg-raised px-1.5 py-0.5 text-[11px]">⌘K</kbd> depuis n’importe quelle page
          </span>
        </div>
      </section>

      {/* ——— Idle : entrées, sets en cours, dernières ajoutées, extensions ——— */}
      {status === "idle" && (
        <div className="mt-4 flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/scanner" className="panel flex items-center gap-3 !p-4 transition hover:ring-accent/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                <ScanLine size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Scanner</span>
                <span className="block truncate text-xs text-muted">Reconnaissance sur l’appareil, FR et JA</span>
              </span>
            </Link>
            <a href="#extensions" className="panel flex items-center gap-3 !p-4 transition hover:ring-accent/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-foreground">
                <Boxes size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Extensions</span>
                <span className="num block truncate text-xs text-muted">{series.reduce((n, s) => n + s.sets.length, 0)} sets {lang === "ja" ? "japonais" : "internationaux"}</span>
              </span>
            </a>
            <Link href="/extensions/pokedex" className="panel flex items-center gap-3 !p-4 transition hover:ring-accent/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artworkUrl(25)} alt="" className="h-8 w-8 object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Pokédex</span>
                <span className="num block truncate text-xs text-muted">{pokedexCount > 0 ? `${pokedexCount} Pokémon, toutes leurs cartes` : "Toutes les cartes d’un Pokémon"}</span>
              </span>
            </Link>
            <Link href={customCount > 0 ? "/extensions/perso" : "/ajouter/manuel"} className="panel flex items-center gap-3 !p-4 transition hover:ring-accent/60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-foreground">
                <FilePlus size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Hors catalogue</span>
                <span className="block truncate text-xs text-muted">{customCount > 0 ? `${customCount} carte${customCount > 1 ? "s" : ""} perso · promos, absentes` : "Promos, cartes absentes : photo + nom"}</span>
              </span>
            </Link>
          </div>

          {setsInProgress.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="display text-xl font-semibold">Tes sets en cours</h2>
                  <p className="text-xs text-muted">Reprends là où tu t’es arrêté.</p>
                </div>
                <Link href="/collection" className="text-xs text-muted hover:text-foreground">
                  Tous mes sets ↗
                </Link>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4 [&>*]:w-[200px] [&>*]:shrink-0 sm:[&>*]:w-auto">
                {setsInProgress.map((s) => {
                  const pct = s.total ? Math.round((s.owned / s.total) * 100) : null;
                  return (
                    <Link key={s.id} href={`/extensions/${encodeURIComponent(s.id)}${s.ja ? "?lang=ja" : ""}`} className="panel group !p-4 transition hover:ring-accent/60">
                      <div className="flex h-12 items-center">
                        <SetLogo logo={s.logo ?? undefined} symbol={s.symbol ?? undefined} cover={s.cover ? `${s.cover}/low.webp` : undefined} name={s.name} />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium group-hover:text-accent-strong">{s.name}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">{s.id}</span>
                        {s.total && <span className="num">{s.total} cartes</span>}
                      </p>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
                      </div>
                      <p className="num mt-1 flex justify-between text-[11px] text-muted">
                        <span>
                          {s.owned}
                          {s.total ? `/${s.total}` : ""} possédée{s.owned > 1 ? "s" : ""}
                        </span>
                        {pct != null && <span>{pct} %</span>}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="display text-xl font-semibold">Dernières ajoutées</h2>
                  <p className="text-xs text-muted">Pour en rajouter du même set.</p>
                </div>
                <Link href="/journal" className="text-xs text-muted hover:text-foreground">
                  Journal ↗
                </Link>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 md:grid-cols-6 [&>*]:w-[130px] [&>*]:shrink-0 sm:[&>*]:w-auto">
                {recent.map((c) => (
                  <Link key={c.id} href={`/extensions/${encodeURIComponent(c.setId)}${c.ja ? "?lang=ja" : ""}`} className="group block">
                    <div className="card-tile aspect-[63/88]">
                      <CardImage base={c.image} alt={c.name} />
                      {c.qty > 1 && <span className="tile-badge num right-1.5 top-1.5">×{c.qty}</span>}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium group-hover:text-accent-strong">{c.name}</p>
                    <p className="num mt-0.5 truncate text-xs text-muted">
                      {c.setName} · {c.localId}
                      {raritySymbol(c.rarity) && <span className="ml-1 text-accent-strong">{raritySymbol(c.rarity)}</span>}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section id="extensions" className="scroll-mt-4">
            <div className="mb-3">
              <h2 className="display text-xl font-semibold">Extensions</h2>
              <p className="text-xs text-muted">Par série, de la plus récente à la plus ancienne.</p>
            </div>
            <ExtensionsBrowser series={series} lang={lang} ownedCountBySet={ownedCountBySet} />
          </section>
        </div>
      )}

      {status === "loading" && (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-surface" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      )}

      {status === "error" && <p className="mt-6 text-sm text-loss">Le catalogue est injoignable, réessaie dans un instant.</p>}

      {status === "done" && cards.length === 0 && (
        <div className="panel mt-6 max-w-md p-5 text-sm">
          <p className="mb-2">Aucune carte trouvée pour « {query.trim()} ».</p>
          <p className="text-muted">
            Promo japonaise ou carte absente du catalogue ?{" "}
            <Link href="/ajouter/manuel" className="text-accent underline-offset-2 hover:underline">
              Ajoute-la manuellement
            </Link>
            .
          </p>
        </div>
      )}

      {status === "done" && cards.length > 0 && (
        <div className="mt-4">
          {/* Filtres des résultats */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {sets.length > 1 && (
              <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} data-on={setFilter !== "all"} aria-label="Set" className="pill-select !w-auto text-[13px]">
                <option value="all">Tous les sets · {sets.length}</option>
                {sets.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {missingCount < cards.length && (
              <button type="button" data-on={onlyMissing} onClick={() => setOnlyMissing((v) => !v)} className={`seg px-3.5 py-1.5 text-[13px] ${onlyMissing ? "font-medium text-accent-strong" : "text-muted"}`}>
                Pas encore possédées <span className="num text-[11px] opacity-70">{missingCount}</span>
              </button>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs text-muted">
              <span className="num">{shown.length}</span> résultat{shown.length > 1 ? "s" : ""}
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Tri" className="pill-select !w-auto !py-1.5 text-[12px]">
                <option value="rel">Tri : pertinence</option>
                <option value="name">Tri : nom</option>
                <option value="num">Tri : numéro</option>
              </select>
            </span>
          </div>

          <div className={`grid grid-cols-1 gap-5 ${selected && !isMobile ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
            {shown.length === 0 ? (
              <p className="text-sm text-muted">Aucune carte pour ce filtre.</p>
            ) : (
              <ul className={`rise-in grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 ${selected && !isMobile ? "lg:grid-cols-4" : "lg:grid-cols-5 xl:grid-cols-6"}`}>
                {shown.map((card) => {
                  const owned = ownedQty[card.id] ?? 0;
                  const on = selected?.id === card.id && selected?.lang === card.lang;
                  return (
                    <li key={`${card.lang}/${card.id}`}>
                      <button type="button" onClick={() => select(card)} className="group block w-full text-left">
                        <div className={`card-tile aspect-[63/88] ${on ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}>
                          <CardImage base={card.image} alt={card.name} />
                          {card.lang === "ja" && <span className="tile-badge right-1.5 top-1.5 !bg-white !text-black">JP</span>}
                          {owned > 0 && (
                            <span className="tile-badge num left-1.5 top-1.5 flex items-center gap-0.5 !bg-gain !text-black">
                              <Check size={11} strokeWidth={3} aria-hidden />
                              {owned > 1 ? `×${owned}` : ""}
                            </span>
                          )}
                          <Link href={addHref(card)} onClick={(e) => e.stopPropagation()} aria-label={`Ajouter ${card.name}`} className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition hover:bg-accent hover:text-white">
                            <Plus size={15} strokeWidth={2.5} aria-hidden />
                          </Link>
                        </div>
                        <div className="mt-2.5 px-0.5">
                          <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">{card.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {card.setName} <span className="num text-faint">· {card.localId}</span>
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selected && !isMobile && (
              <aside className="panel sticky top-6 self-start !p-5" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface) 60%)" }}>
                <button type="button" onClick={close} aria-label="Fermer" className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground">
                  <X size={14} aria-hidden />
                </button>
                {spotlight}
              </aside>
            )}
          </div>
          <Sheet open={Boolean(selected) && isMobile} onClose={close} label={selected?.name ?? "Carte"} size="xl">
            {spotlight}
          </Sheet>
        </div>
      )}

      {status !== "idle" && (
        <p className="mt-8 text-center text-xs text-muted">
          <button type="button" onClick={() => handleChange("")} className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
            <Search size={12} aria-hidden /> Revenir aux extensions
          </button>
        </p>
      )}
    </div>
  );
}
