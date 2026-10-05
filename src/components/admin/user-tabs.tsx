"use client";

import { useState, type ReactNode } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";

/** `icon` : élément déjà rendu (une fonction ne traverse pas la frontière serveur → client) */
export type UserTab = { key: string; label: string; icon: ReactNode; count: number; content: ReactNode };

/** Onglets de la fiche d'un compte (contenu rendu côté serveur, simple bascule ici) */
export function UserTabs({ tabs }: { tabs: UserTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <section className="panel p-5">
      <div className="scrollbar-none -mx-5 mb-4 flex gap-1 overflow-x-auto border-b border-ring px-5" role="tablist">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition ${on ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
            >
              {t.icon}
              {t.label}
              <span className="num text-[11px] opacity-60">{t.count.toLocaleString("fr-FR")}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== active} role="tabpanel">
          {t.content}
        </div>
      ))}
    </section>
  );
}

/** Cartes : vignettes des plus chères, ou le tableau complet (édition, corbeille) */
export function GridOrTable({ grid, table, refs, total }: { grid: ReactNode; table: ReactNode; refs: number; total: number }) {
  const [view, setView] = useState<"grid" | "table">("grid");
  return (
    <div>
      {view === "grid" ? grid : table}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-faint">{view === "grid" ? `Les ${Math.min(12, refs)} plus chères sur ${refs.toLocaleString("fr-FR")} références · le tableau permet d'éditer chaque carte` : `${total.toLocaleString("fr-FR")} lignes, vendues et corbeille comprises`}</span>
        <button type="button" onClick={() => setView(view === "grid" ? "table" : "grid")} className="btn btn-ghost !px-3 !py-1.5 text-xs">
          {view === "grid" ? <Rows3 size={13} aria-hidden /> : <LayoutGrid size={13} aria-hidden />}
          {view === "grid" ? "Voir en tableau" : "Voir en vignettes"}
        </button>
      </div>
    </div>
  );
}
