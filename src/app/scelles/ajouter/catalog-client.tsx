"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Boxes, Search } from "lucide-react";
import { KIND_ORDER, kindLabel, type CatalogProduct, type CatalogSerie, type CatalogSet } from "@/lib/sealed";
import { formatEur } from "@/lib/domain";

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const MAX_HITS = 300;
const year = (d: string) => (d ? d.slice(0, 4) : "");
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

/** Tuile produit : visuel, nom, type, cote */
function ProductTile({ p }: { p: CatalogProduct }) {
  return (
    <Link
      href={`/scelles/produit/${p.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg"
    >
      <div className="flex aspect-square items-center justify-center bg-white p-4">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <Boxes size={32} className="text-neutral-400" aria-hidden />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p>
        <p className="text-xs text-muted">{kindLabel(p.kind)}</p>
        <p className="num mt-auto pt-1 text-sm font-bold">{p.cote != null ? formatEur(p.cote) : <span className="font-normal text-faint">—</span>}</p>
      </div>
    </Link>
  );
}

/** Tuile extension : logo, nom, nombre de produits, année. `eager` : visuel chargé tout de suite (première série, visible à l'arrivée) */
function SetTile({ st, onOpen, eager = false }: { st: CatalogSet; onOpen: () => void; eager?: boolean }) {
  const loading = eager ? "eager" : "lazy";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="panel flex h-full w-full flex-col items-center gap-3 p-4 text-center transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg"
    >
      <div className="flex h-14 items-center justify-center">
        {st.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={st.logo} alt="" className="max-h-14 max-w-[9rem] object-contain" loading={loading} />
        ) : (
          <Boxes size={28} className="text-muted" aria-hidden />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{st.name}</p>
        <p className="num mt-1 text-xs text-muted">
          {plural(st.products.length, "produit")}
          {year(st.released) ? ` · ${year(st.released)}` : ""}
        </p>
      </div>
    </button>
  );
}

export function CatalogClient({ series }: { series: CatalogSerie[] }) {
  const [q, setQ] = useState("");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [kind, setKind] = useState("");

  const all = series.flatMap((s) => s.sets.flatMap((st) => st.products));
  let opened: { serie: CatalogSerie; set: CatalogSet } | null = null;
  for (const s of series) for (const st of s.sets) if (st.key === setKey) opened = { serie: s, set: st };

  // Recherche globale : correspondances regroupées par extension (recalculée à
  // chaque frappe, c'est un simple filtre sur ~3 000 produits)
  const words = fold(q).split(/\s+/).filter(Boolean);
  let hits: { total: number; groups: { name: string; items: CatalogProduct[] }[] } | null = null;
  if (words.length) {
    const list = all.filter((p) => words.every((w) => fold(`${p.name} ${p.setName}`).includes(w)));
    const groups = new Map<string, { name: string; items: CatalogProduct[] }>();
    for (const p of list.slice(0, MAX_HITS)) {
      const g = groups.get(p.setKey) ?? { name: p.setName, items: [] };
      g.items.push(p);
      groups.set(p.setKey, g);
    }
    hits = { total: list.length, groups: [...groups.values()] };
  }

  const present = new Set(opened?.set.products.map((p) => p.kind) ?? []);
  const kindsInSet = opened ? KIND_ORDER.filter((k) => present.has(k)) : [];
  const setProducts = opened ? opened.set.products.filter((p) => !kind || p.kind === kind) : [];

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-accent bg-accent/15 text-accent-strong" : "border-edge hover:bg-raised"}`;
  const open = (key: string) => {
    setSetKey(key);
    setKind("");
    window.scrollTo({ top: 0 });
  };
  const close = () => {
    setSetKey(null);
    setKind("");
  };

  return (
    <div className="space-y-6">
      <label className="relative block">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un produit ou une extension… (ex. ETB Évolutions Prismatiques, display 151)"
          className="field !px-4 !py-3 !pl-11 !text-base"
        />
      </label>

      {hits ? (
        /* Résultats de recherche */
        hits.groups.length === 0 ? (
          <div className="panel flex flex-col items-center gap-2 p-10 text-center">
            <Boxes size={28} className="text-muted" aria-hidden />
            <p className="text-sm text-muted">Aucun produit ne correspond.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted">
              {plural(hits.total, "produit")}
              {hits.total > MAX_HITS ? `, les ${MAX_HITS} premiers affichés` : ""}
            </p>
            {hits.groups.map((g) => (
              <section key={g.name}>
                <h2 className="display mb-3 text-base font-semibold">{g.name}</h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {g.items.map((p) => (
                    <li key={p.id}>
                      <ProductTile p={p} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : opened ? (
        /* Produits d'une extension */
        <section>
          <button type="button" onClick={close} className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
            <ArrowLeft size={14} aria-hidden />
            Toutes les séries
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            {opened.set.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={opened.set.logo} alt="" className="h-12 object-contain" />
            )}
            <div>
              <h2 className="display text-2xl font-bold tracking-tight">{opened.set.name}</h2>
              <p className="num text-sm text-muted">
                {opened.serie.name} · {plural(opened.set.products.length, "produit")}
                {year(opened.set.released) ? ` · ${year(opened.set.released)}` : ""}
              </p>
            </div>
          </div>
          {kindsInSet.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setKind("")} className={chip(kind === "")}>
                Tous
              </button>
              {kindsInSet.map((k) => (
                <button key={k} type="button" onClick={() => setKind(kind === k ? "" : k)} className={chip(kind === k)}>
                  {kindLabel(k)}
                </button>
              ))}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {setProducts.map((p) => (
              <li key={p.id}>
                <ProductTile p={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        /* Toutes les séries et leurs extensions, sur une seule page */
        <>
          {series.map((s, si) => (
            <section key={s.id} id={`serie-${s.id}`} className="scroll-mt-24">
              <div className="mb-3 flex items-center gap-3">
                {s.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logo} alt="" className="h-9 max-w-[10rem] object-contain" loading={si === 0 ? "eager" : "lazy"} />
                )}
                <div>
                  <h2 className="display text-xl font-bold tracking-tight">{s.name}</h2>
                  <p className="num text-xs text-muted">{plural(s.sets.length, "extension")}</p>
                </div>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {s.sets.map((st) => (
                  <li key={st.key}>
                    <SetTile st={st} onOpen={() => open(st.key)} eager={si === 0} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
