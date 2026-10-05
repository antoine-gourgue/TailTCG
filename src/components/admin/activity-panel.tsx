"use client";

import { useState } from "react";
import { Boxes, LayoutGrid, Package, ScanLine, type LucideIcon } from "lucide-react";
import { DayBars, IconBox, PanelHead, Spark, type Tone } from "@/components/admin/admin-ui";

type View = "collection" | "jeu" | "scan";

/**
 * Activité 30 jours, tous comptes : quatre tuiles (total + mini-courbe) et le
 * graphique de la vue choisie. Les boosters ont leur propre vue : un seul jour
 * à mille ouvertures écraserait les ajouts de cartes.
 */
export function ActivityPanel({ days, cards, sealed, openings, scans }: { days: string[]; cards: number[]; sealed: number[]; openings: number[]; scans: number[] }) {
  const [view, setView] = useState<View>("collection");
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const tiles: { key: string; view: View; icon: LucideIcon; tone: Tone; label: string; values: number[]; color: string }[] = [
    { key: "cards", view: "collection", icon: LayoutGrid, tone: "accent", label: "Cartes ajoutées", values: cards, color: "var(--accent-strong)" },
    { key: "sealed", view: "collection", icon: Boxes, tone: "sealed", label: "Scellés", values: sealed, color: "var(--sealed)" },
    { key: "openings", view: "jeu", icon: Package, tone: "game", label: "Boosters ouverts", values: openings, color: "var(--game)" },
    { key: "scans", view: "scan", icon: ScanLine, tone: "scan", label: "Scans", values: scans, color: "var(--scan)" },
  ];
  const series =
    view === "collection"
      ? [
          { values: cards, color: "var(--accent-strong)" },
          { values: sealed, color: "var(--sealed)" },
        ]
      : view === "jeu"
        ? [{ values: openings, color: "var(--game)" }]
        : [{ values: scans, color: "var(--scan)" }];

  return (
    <section className="panel flex h-full flex-col p-5">
      <PanelHead title="Activité · 30 jours" hint="Ce que les comptes ont ajouté, ouvert ou scanné">
        <div className="hidden gap-1.5 sm:flex">
          {(["collection", "jeu", "scan"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} data-on={view === v} className="seg rounded-full px-3 py-1 text-xs font-medium">
              {v === "collection" ? "Collection" : v === "jeu" ? "Jeu" : "Scan"}
            </button>
          ))}
        </div>
      </PanelHead>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const on = t.view === view;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.view)}
              className={`min-w-0 rounded-2xl p-3 text-left ring-1 transition ${on ? "bg-raised ring-edge-strong" : "ring-ring hover:bg-raised/50"}`}
            >
              <span className="flex items-center gap-2 text-[11.5px] text-muted">
                <IconBox icon={t.icon} tone={t.tone} size="sm" />
                <span className="truncate">{t.label}</span>
              </span>
              <span className="num mt-1.5 block text-lg font-bold">{sum(t.values).toLocaleString("fr-FR")}</span>
              <Spark values={t.values} color={t.color} className="mt-1 h-6 w-full" />
            </button>
          );
        })}
      </div>
      <div className="flex flex-1 flex-col justify-end">
        <DayBars series={series} days={days} height={190} sqrt={view === "jeu"} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
          {view === "collection" ? (
            <>
              <Legend color="var(--accent-strong)" label="Cartes ajoutées" />
              <Legend color="var(--sealed)" label="Scellés ajoutés" />
            </>
          ) : view === "jeu" ? (
            <Legend color="var(--game)" label="Boosters ouverts · hauteurs adoucies, le chiffre du pic est exact" />
          ) : (
            <Legend color="var(--scan)" label="Cartes scannées au téléphone" />
          )}
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
