"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, Check, ChevronLeft, Plus, Search, X } from "lucide-react";
import { KIND_ORDER, kindLabel, type CatalogProduct, type CatalogSerie, type CatalogSet } from "@/lib/sealed";
import { formatEur } from "@/lib/domain";

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const MAX_HITS = 300;
const NEW_SHOWN = 8;
const year = (d: string) => (d ? d.slice(0, 4) : "");
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;
type SortKey = "cote" | "name" | "kind";

/** Tuile produit : visuel dans un cadre fixe, type, nom, cote, repère possédé */
function ProductTile({ p, owned = 0 }: { p: CatalogProduct; owned?: number }) {
  return (
    <Link href={`/scelles/produit/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-ring transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-accent/60">
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-contain p-4 transition group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Boxes size={32} className="text-neutral-400" aria-hidden />
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{kindLabel(p.kind)}</span>
        {owned > 0 && (
          <span className="num absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-gain px-1.5 py-0.5 text-[10px] font-bold text-black">
            <Check size={10} strokeWidth={3} aria-hidden />×{owned}
          </span>
        )}
        <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition group-hover:bg-accent group-hover:text-white" aria-hidden>
          <Plus size={15} strokeWidth={2.5} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p>
        <p className="truncate text-xs text-muted">{p.setName}</p>
        <p className="num mt-auto pt-1 text-sm font-bold">{p.cote != null ? formatEur(p.cote) : <span className="font-normal text-faint">—</span>}</p>
      </div>
    </Link>
  );
}

/** Tuile extension : logo, nom, produits, année, repère possédés */
function SetTile({ st, owned, onOpen, eager = false }: { st: CatalogSet; owned: number; onOpen: () => void; eager?: boolean }) {
  return (
    <button type="button" onClick={onOpen} className="panel group flex h-full w-full flex-col p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-accent/60">
      <div className="flex h-14 w-full items-center justify-center">
        {st.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={st.logo} alt="" className="max-h-14 max-w-[9rem] object-contain" loading={eager ? "eager" : "lazy"} />
        ) : (
          <Boxes size={28} className="text-muted" aria-hidden />
        )}
      </div>
      <p className="mt-3 truncate text-sm font-semibold leading-tight group-hover:text-accent-strong">{st.name}</p>
      <p className="num mt-1 text-xs text-muted">
        {plural(st.products.length, "produit")}
        {year(st.released) ? ` · ${year(st.released)}` : ""}
      </p>
      {owned > 0 && (
        <p className="num mt-1 flex items-center gap-1 text-[11px] text-gain">
          <Check size={11} strokeWidth={3} aria-hidden /> {owned} possédé{owned > 1 ? "s" : ""}
        </p>
      )}
    </button>
  );
}

const chipCls = (on: boolean) => `seg shrink-0 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;

export function CatalogClient({ series, ownedQty, recentIds }: { series: CatalogSerie[]; ownedQty: Record<number, number>; recentIds: number[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [serieId, setSerieId] = useState("all");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [kindInSet, setKindInSet] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cote");
  const [sortAsc, setSortAsc] = useState(false);

  const all = useMemo(() => series.flatMap((s) => s.sets.flatMap((st) => st.products)), [series]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const kindCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) m.set(p.kind, (m.get(p.kind) ?? 0) + 1);
    return KIND_ORDER.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [all]);
  const ownedInSet = (st: CatalogSet) => st.products.reduce((n, p) => n + (ownedQty[p.id] ? 1 : 0), 0);

  let opened: { serie: CatalogSerie; set: CatalogSet } | null = null;
  for (const s of series) for (const st of s.sets) if (st.key === setKey) opened = { serie: s, set: st };

  const sortProducts = (list: CatalogProduct[]) => {
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "kind") return (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) * dir || a.name.localeCompare(b.name);
      if (a.cote == null && b.cote == null) return a.name.localeCompare(b.name);
      if (a.cote == null) return 1;
      if (b.cote == null) return -1;
      return (a.cote - b.cote) * dir;
    });
  };

  // Recherche (nom ou extension) et filtre de type : résultats groupés par extension, récentes d'abord
  const words = fold(q).split(/\s+/).filter(Boolean);
  const searching = words.length > 0 || kind !== "";
  let hits: { total: number; groups: { key: string; name: string; logo: string | null; items: CatalogProduct[] }[] } | null = null;
  if (searching) {
    const list = all.filter((p) => (!kind || p.kind === kind) && words.every((w) => fold(`${p.name} ${p.setName}`).includes(w)));
    const groups = new Map<string, { key: string; name: string; logo: string | null; items: CatalogProduct[] }>();
    const logoOf = new Map(series.flatMap((s) => s.sets.map((st) => [st.key, st.logo] as const)));
    for (const p of list.slice(0, MAX_HITS)) {
      const g = groups.get(p.setKey) ?? { key: p.setKey, name: p.setName, logo: logoOf.get(p.setKey) ?? null, items: [] };
      g.items.push(p);
      groups.set(p.setKey, g);
    }
    hits = { total: list.length, groups: [...groups.values()].map((g) => ({ ...g, items: sortProducts(g.items) })) };
  }

  const present = new Set(opened?.set.products.map((p) => p.kind) ?? []);
  const kindsInSet = opened ? KIND_ORDER.filter((k) => present.has(k)) : [];
  const setProducts = opened ? sortProducts(opened.set.products.filter((p) => !kindInSet || p.kind === kindInSet)) : [];

  const recent = recentIds.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
  const newest = series[0]?.sets[0] ?? null;
  const shownSeries = serieId === "all" ? series : series.filter((s) => s.id === serieId);

  const open = (key: string) => {
    setSetKey(key);
    setKindInSet("");
    window.scrollTo({ top: 0 });
  };
  const close = () => {
    setSetKey(null);
    setKindInSet("");
  };
  const sortControls = (
    <div className="ml-auto flex items-center gap-1.5">
      <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Tri" className="pill-select !w-auto text-[13px]">
        <option value="cote">Tri : cote</option>
        <option value="name">Tri : nom</option>
        <option value="kind">Tri : type</option>
      </select>
      <button type="button" onClick={() => setSortAsc((v) => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground" title={sortAsc ? "Croissant" : "Décroissant"} aria-label={sortAsc ? "Tri croissant" : "Tri décroissant"}>
        {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
      </button>
    </div>
  );
  const grid = (items: CatalogProduct[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((p) => (
        <li key={p.id}>
          <ProductTile p={p} owned={ownedQty[p.id] ?? 0} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Recherche et types ——— */}
      <section className="panel !p-4 sm:!p-5" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--sealed) 14%, var(--surface)), var(--surface) 55%)" }}>
        <div className="relative">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom de produit ou d’extension… ex. ETB 151, display Évolutions Prismatiques, tin Pikachu"
            aria-label="Chercher un produit scellé"
            className="pill-input !w-full !py-3 !text-[15px]"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Effacer" className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition hover:text-foreground">
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
        <div className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" data-on={kind === ""} onClick={() => setKind("")} className={chipCls(kind === "")}>
            Tous types <span className="num text-[11px] opacity-70">{all.length}</span>
          </button>
          {kindCounts.map(([k, n]) => (
            <button key={k} type="button" data-on={kind === k} onClick={() => setKind(kind === k ? "" : k)} className={chipCls(kind === k)}>
              {kindLabel(k)} <span className="num text-[11px] opacity-70">{n}</span>
            </button>
          ))}
        </div>
      </section>

      {hits ? (
        /* ——— Résultats ——— */
        hits.groups.length === 0 ? (
          <div className="panel flex flex-col items-center gap-2 p-10 text-center">
            <Boxes size={28} className="text-muted" aria-hidden />
            <p className="text-sm text-muted">Aucun produit ne correspond.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted">
                <span className="num text-foreground">{hits.total}</span> produit{hits.total > 1 ? "s" : ""}
                {hits.total > MAX_HITS ? `, les ${MAX_HITS} premiers affichés` : ""} dans {plural(hits.groups.length, "extension")}
              </p>
              {sortControls}
            </div>
            {hits.groups.map((g) => (
              <section key={g.key}>
                <div className="mb-3 flex items-center gap-3">
                  {g.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.logo} alt="" className="h-8 max-w-[7rem] object-contain" loading="lazy" />
                  )}
                  <h2 className="display text-base font-semibold">{g.name}</h2>
                  <span className="num text-xs text-muted">{plural(g.items.length, "produit")}</span>
                  <button type="button" onClick={() => { setQ(""); setKind(""); open(g.key); }} className="ml-auto text-xs text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                    Toute l’extension
                  </button>
                </div>
                {grid(g.items)}
              </section>
            ))}
          </div>
        )
      ) : opened ? (
        /* ——— Produits d'une extension ——— */
        <section>
          <button type="button" onClick={close} className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />
            Toutes les extensions
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            {opened.set.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={opened.set.logo} alt="" className="h-14 max-w-[10rem] object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="label-xs text-muted">{opened.serie.name}</p>
              <h2 className="display text-2xl font-bold tracking-tight">{opened.set.name}</h2>
              <p className="num text-sm text-muted">
                {plural(opened.set.products.length, "produit")}
                {year(opened.set.released) ? ` · ${year(opened.set.released)}` : ""}
                {ownedInSet(opened.set) > 0 && <span className="text-gain"> · {ownedInSet(opened.set)} possédé{ownedInSet(opened.set) > 1 ? "s" : ""}</span>}
              </p>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {kindsInSet.length > 1 && (
              <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                <button type="button" data-on={kindInSet === ""} onClick={() => setKindInSet("")} className={chipCls(kindInSet === "")}>
                  Tous <span className="num text-[11px] opacity-70">{opened.set.products.length}</span>
                </button>
                {kindsInSet.map((k) => (
                  <button key={k} type="button" data-on={kindInSet === k} onClick={() => setKindInSet(kindInSet === k ? "" : k)} className={chipCls(kindInSet === k)}>
                    {kindLabel(k)} <span className="num text-[11px] opacity-70">{opened!.set.products.filter((p) => p.kind === k).length}</span>
                  </button>
                ))}
              </div>
            )}
            {sortControls}
          </div>
          {grid(setProducts)}
        </section>
      ) : (
        /* ——— Accueil : encore un ?, nouveautés, extensions ——— */
        <>
          {recent.length > 0 && (
            <section>
              <div className="mb-3">
                <h2 className="display text-xl font-semibold">Encore un ?</h2>
                <p className="text-xs text-muted">Les produits que tu possèdes déjà, pour rajouter un lot.</p>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-4 xl:grid-cols-5 [&>*]:w-[160px] [&>*]:shrink-0 sm:[&>*]:w-auto">
                {recent.slice(0, 5).map((p) => (
                  <ProductTile key={p.id} p={p} owned={ownedQty[p.id] ?? 0} />
                ))}
              </div>
            </section>
          )}

          {newest && newest.products.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="display text-xl font-semibold">Nouveautés · {newest.name}</h2>
                  <p className="text-xs text-muted">La dernière extension du catalogue{year(newest.released) ? ` · ${year(newest.released)}` : ""}.</p>
                </div>
                <button type="button" onClick={() => open(newest.key)} className="text-xs text-muted hover:text-foreground">
                  Tout voir ↗
                </button>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-4 xl:grid-cols-5 [&>*]:w-[160px] [&>*]:shrink-0 sm:[&>*]:w-auto">
                {sortProducts(newest.products).slice(0, NEW_SHOWN).map((p) => (
                  <ProductTile key={p.id} p={p} owned={ownedQty[p.id] ?? 0} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3">
              <h2 className="display text-xl font-semibold">Extensions</h2>
              <p className="text-xs text-muted">Par série, de la plus récente à la plus ancienne.</p>
            </div>
            <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <button type="button" data-on={serieId === "all"} onClick={() => setSerieId("all")} className={chipCls(serieId === "all")}>
                Toutes <span className="num text-[11px] opacity-70">{series.reduce((n, s) => n + s.sets.length, 0)}</span>
              </button>
              {series.map((s) => (
                <button key={s.id} type="button" data-on={serieId === s.id} onClick={() => setSerieId(s.id)} className={chipCls(serieId === s.id)}>
                  {s.name} <span className="num text-[11px] opacity-70">{s.sets.length}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-8">
              {shownSeries.map((s, si) => (
                <section key={s.id} id={`serie-${s.id}`} className="scroll-mt-24">
                  <div className="mb-3 flex items-center gap-3">
                    {s.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.logo} alt="" className="h-8 max-w-[9rem] object-contain" loading={si === 0 ? "eager" : "lazy"} />
                    )}
                    <div>
                      <h3 className="display text-base font-semibold">{s.name}</h3>
                      <p className="num text-xs text-muted">{plural(s.sets.length, "extension")}</p>
                    </div>
                  </div>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {s.sets.map((st) => (
                      <li key={st.key}>
                        <SetTile st={st} owned={ownedInSet(st)} onOpen={() => open(st.key)} eager={si === 0} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
          <p className="text-center text-xs text-muted">
            <Search size={12} className="mr-1 inline" aria-hidden />
            Un produit absent du catalogue ? Il arrive chaque nuit avec la synchronisation ; sinon dis-le-moi.
          </p>
        </>
      )}
    </div>
  );
}
