"use client";

import { useState } from "react";
import { formatEur } from "@/lib/domain";
import type { MonthPoint } from "@/components/stats-widgets";

const W = 640;
const H = 160;
const PAD = { top: 18, right: 8, bottom: 22, left: 8 };
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « août 2026 » à partir de la clé AAAA-MM */
function longMonth(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Barre à sommet arrondi et base carrée */
function bar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h / 2, w / 2);
  return `M${x},${y + h} V${y + rr} a${rr},${rr} 0 0 1 ${rr},-${rr} H${x + w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} V${y + h} Z`;
}

/** Barres mensuelles : dépense (ou cartes ajoutées si aucun prix) sur 12 mois ; part scellée empilée si présente */
export function MonthlyBars({ months, metric }: { months: MonthPoint[]; metric: "spend" | "cards" }) {
  const [hover, setHover] = useState<number | null>(null);
  const slot = (W - PAD.left - PAD.right) / months.length;
  const bw = slot * 0.56;
  const val = (m: MonthPoint) => (metric === "spend" ? m.spend : m.cards);
  const max = Math.max(...months.map(val), 0);
  const h = (v: number) => (max > 0 ? (v / max) * (H - PAD.top - PAD.bottom) : 0);
  const fmt = (v: number) => (metric === "spend" ? formatEur(v) : `${v} carte${v > 1 ? "s" : ""}`);
  const stacked = metric === "spend" && months.some((m) => (m.sealed ?? 0) > 0);
  const hovered = hover != null ? months[hover] : null;

  return (
    <div>
      {stacked && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden /> Cartes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sealed" aria-hidden /> Scellés
          </span>
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Achats par mois" onMouseLeave={() => setHover(null)}>
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.1} />
          {months.map((m, i) => {
            const v = val(m);
            const sealed = stacked ? Math.min(m.sealed ?? 0, v) : 0;
            const bh = Math.max(h(v), v > 0 ? 2 : 0);
            const sh = sealed > 0 ? Math.max(h(sealed), 2) : 0;
            const ch = bh - sh;
            const x0 = PAD.left + i * slot;
            const x = x0 + (slot - bw) / 2;
            const top = H - PAD.bottom - bh;
            const dim = hover != null && hover !== i;
            return (
              <g key={m.key} onMouseEnter={() => setHover(i)} opacity={dim ? 0.45 : 1} className="transition-opacity duration-100">
                {/* Toute la colonne réagit au survol, pas seulement la barre */}
                <rect x={x0} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill="transparent" />
                {ch > 0 && <path d={bar(x, top + sh, bw, ch, sh > 0 ? 0 : 4)} fill="var(--accent)" fillOpacity={m.current ? 1 : 0.6} />}
                {sh > 0 && <path d={bar(x, top, bw, sh, 4)} fill="var(--sealed)" fillOpacity={m.current ? 1 : 0.75} />}
                {v > 0 && (
                  <text x={x + bw / 2} y={top - 5} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
                    {metric === "spend" ? `${Math.round(v)} €` : v}
                  </text>
                )}
                <text
                  x={x + bw / 2}
                  y={H - 7}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={m.current ? "var(--foreground)" : "var(--muted)"}
                  fontWeight={m.current ? 600 : 400}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && hover != null && (
          /* À côté de la barre (à gauche pour la moitié droite), alignée sur son sommet : jamais hors du cadre */
          <div
            className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-edge bg-raised px-3 py-2 shadow-lg ${
              hover >= months.length / 2 ? "-translate-x-full" : ""
            }`}
            style={{
              left: `${((PAD.left + hover * slot + (hover >= months.length / 2 ? (slot - bw) / 2 - 6 : (slot + bw) / 2 + 6)) / W) * 100}%`,
              top: `${Math.min(((H - PAD.bottom - Math.max(h(val(hovered)), 2)) / H) * 100, 55)}%`,
            }}
          >
            <p className="text-[11px] leading-tight text-muted">{longMonth(hovered.key)}</p>
            <p className="num text-sm font-bold leading-tight">{val(hovered) > 0 ? fmt(val(hovered)) : "Aucun achat"}</p>
            {stacked && val(hovered) > 0 && (
              <p className="mt-1 flex gap-2.5 text-[11px] leading-tight text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden />
                  <span className="num">{formatEur(hovered.spend - (hovered.sealed ?? 0))}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-sealed" aria-hidden />
                  <span className="num">{formatEur(hovered.sealed ?? 0)}</span>
                </span>
              </p>
            )}
            {metric === "spend" && hovered.cards > 0 && (
              <p className="text-[11px] leading-tight text-muted">
                {hovered.cards} carte{hovered.cards > 1 ? "s" : ""} ajoutée{hovered.cards > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
