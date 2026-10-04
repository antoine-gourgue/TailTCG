"use client";

import { useId, useState } from "react";
import { formatEur } from "@/lib/domain";
import { useContainerWidth } from "@/lib/use-container-width";

export type ValuePoint = { recorded_at: string; value: number };
/** Composante empilée de la courbe (ex. cartes, scellés) */
export type ValueLayer = { label: string; points: ValuePoint[] };

const H = 200;
const MIN_W = 300;
const PAD = { top: 14, right: 72, bottom: 26, left: 8 };
const LAYER_COLORS = ["var(--accent)", "var(--sealed)"];
/** Au-delà, les points ne sont plus dessinés un à un (relevés quotidiens) */
const DOTS_MAX = 40;
const DAY = 86_400_000;
/** Fenêtres de temps proposées quand l'historique est assez long */
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "30", label: "30 j", days: 30 },
  { key: "365", label: "1 an", days: 365 },
  { key: "all", label: "Tout", days: null },
];

const dayOf = (iso: string) => iso.slice(0, 10);
const ms = (iso: string) => Date.parse(`${dayOf(iso)}T00:00:00Z`);
const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtDateLong = (iso: string) =>
  new Date(`${dayOf(iso)}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function sortPoints(points: ValuePoint[]): ValuePoint[] {
  return [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

/** Valeur d'une couche à chaque date de la courbe totale : dernière connue, null avant son premier point */
function alignLayer(layer: ValuePoint[], dates: string[]): (number | null)[] {
  const sorted = sortPoints(layer);
  let i = -1;
  return dates.map((d) => {
    while (i + 1 < sorted.length && sorted[i + 1].recorded_at <= d) i++;
    return i >= 0 ? sorted[i].value : null;
  });
}

/**
 * Courbe de valeur sur une échelle de temps réelle, survol au point le plus
 * proche avec infobulle maison. Avec `layers`, les composantes s'empilent sous
 * la courbe totale et un sélecteur permet d'isoler chacune.
 */
export function ValueHistoryChart({
  points,
  layers,
  minSpanRatio = 0,
  ranges = true,
  height = H,
}: {
  points: ValuePoint[];
  layers?: ValueLayer[];
  /** amplitude verticale minimale, en fraction de la valeur : une cote qui bouge de 1 % ne remplit pas tout le cadre */
  minSpanRatio?: number;
  /** propose 30 j / 1 an / Tout quand l'historique dépasse 30 jours */
  ranges?: boolean;
  /** hauteur du tracé (px du viewBox) */
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // -1 : total empilé, sinon l'index de la couche affichée seule
  const [view, setView] = useState(-1);
  const [range, setRange] = useState("all");
  const gradId = useId().replace(/:/g, "");
  // Dessiné à la largeur réelle : textes lisibles sur mobile sans défilement
  const [box, width] = useContainerWidth<HTMLDivElement>();
  const W = Math.max(width, MIN_W);
  const HH = height;
  const hasLayers = !!layers && layers.length > 0;
  const stacked = hasLayers && view < 0;
  const all = sortPoints(hasLayers && view >= 0 ? layers[view].points : points);
  // Fenêtre de temps : on garde le dernier point avant la fenêtre pour que la courbe parte du bord
  const spanDays = all.length > 1 ? (ms(all[all.length - 1].recorded_at) - ms(all[0].recorded_at)) / DAY : 0;
  const rangeOptions = ranges && spanDays > 30 ? RANGES.filter((r) => r.days == null || r.days < spanDays) : [];
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const data = (() => {
    if (days == null || all.length < 2) return all;
    const cutoff = ms(all[all.length - 1].recorded_at) - days * DAY;
    const idx = all.findIndex((d) => ms(d.recorded_at) >= cutoff);
    return idx <= 0 ? all : all.slice(idx - 1);
  })();

  const pill = (on: boolean) => `rounded-full px-2.5 py-1 text-xs transition ${on ? "bg-raised font-semibold text-foreground" : "text-muted hover:text-foreground"}`;
  const header = (hasLayers || rangeOptions.length > 0) && (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {hasLayers &&
          layers.map((l, li) => {
            const sorted = sortPoints(l.points);
            const last = sorted[sorted.length - 1];
            return (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[li % LAYER_COLORS.length] }} aria-hidden />
                {l.label}
                <span className="num text-foreground">{last ? formatEur(last.value) : "—"}</span>
              </span>
            );
          })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {hasLayers && (
          <div className="flex rounded-full bg-surface p-0.5 ring-1 ring-ring" role="tablist" aria-label="Série affichée">
            {[{ i: -1, label: "Tout" }, ...layers.map((l, i) => ({ i, label: l.label }))].map((o) => (
              <button
                key={o.i}
                type="button"
                role="tab"
                aria-selected={view === o.i}
                onClick={() => {
                  setView(o.i);
                  setHover(null);
                }}
                className={pill(view === o.i)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {rangeOptions.length > 0 && (
          <div className="flex rounded-full bg-surface p-0.5 ring-1 ring-ring" role="tablist" aria-label="Période">
            {rangeOptions.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                }}
                className={pill(range === r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (data.length === 0) {
    return (
      <div>
        {header}
        <p className="text-sm text-muted">Pas encore d&apos;historique pour cette série.</p>
      </div>
    );
  }
  if (data.length === 1) {
    return (
      <div>
        {header}
        <p className="text-sm text-muted">
          Première valeur enregistrée le {fmtDate(data[0].recorded_at)} : <span className="num text-foreground">{formatEur(data[0].value)}</span>. La courbe se
          dessinera au prochain point.
        </p>
      </div>
    );
  }

  // Échelle en temps : les dates s'espacent selon leur écart réel, pas leur rang
  const t0 = ms(data[0].recorded_at);
  const t1 = ms(data[data.length - 1].recorded_at);
  const plotW = W - PAD.left - PAD.right;
  const xAt = (iso: string) => PAD.left + (t1 > t0 ? (ms(iso) - t0) / (t1 - t0) : 0.5) * plotW;
  const xs = data.map((d) => xAt(d.recorded_at));

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Empilé : depuis zéro, pour que les couches aient un sens ; seul : zoom sur l'amplitude,
  // centré, avec une amplitude plancher (minSpanRatio) pour rester honnête sur les petites variations
  const mid = (min + max) / 2;
  const half = Math.max(((max - min) / 2) * 1.3, ((max || 1) * minSpanRatio) / 2, (max || 1) * 0.005);
  const yLo = stacked ? 0 : mid - half;
  const yHi = stacked ? (max || 1) * 1.08 : mid + half;
  const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (HH - PAD.top - PAD.bottom);
  // Repères répartis sur la hauteur affichée (jamais collés, même quand la courbe bouge à peine)
  const gridYs = stacked ? [0, max / 2, max] : [0.12, 0.5, 0.88].map((f) => yLo + (yHi - yLo) * f);
  const baseline = HH - PAD.bottom;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${baseline} L${xs[0].toFixed(1)},${baseline} Z`;

  const dates = data.map((d) => d.recorded_at);
  const aligned = stacked ? layers.map((l) => alignLayer(l.points, dates)) : [];
  const bands = aligned.map((vals, li) => {
    const lower = dates.map((_, i) => aligned.slice(0, li).reduce((a, prev) => a + (prev[i] ?? 0), 0));
    const top = lower.map((lo, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(lo + (vals[i] ?? 0)).toFixed(1)}`).join(" ");
    const bottom = lower
      .map((lo, i) => `L${xs[i].toFixed(1)},${y(lo).toFixed(1)}`)
      .reverse()
      .join(" ");
    return `${top} ${bottom} Z`;
  });

  // Repères de dates : début, fin, et deux intermédiaires quand la période le permet
  const fractions = t1 - t0 >= 3 * DAY ? [0, 1 / 3, 2 / 3, 1] : [0, 1];
  const ticks = fractions.map((f) => ({
    x: PAD.left + f * plotW,
    label: fmtDate(new Date(t0 + f * (t1 - t0)).toISOString()),
    anchor: (f === 0 ? "start" : f === 1 ? "end" : "middle") as "start" | "end" | "middle",
  }));

  const lineColor = stacked ? "var(--foreground)" : hasLayers ? LAYER_COLORS[view % LAYER_COLORS.length] : "var(--accent)";
  const dots = data.length <= DOTS_MAX;
  const hovered = hover != null ? data[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    setHover(best);
  }

  return (
    <div>
      {header}
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${HH}`}
          role="img"
          aria-label={`Évolution de la valeur, de ${formatEur(data[0].value)} à ${formatEur(data[data.length - 1].value)}`}
          className="w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${gradId}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={lineColor} stopOpacity={0.32} />
              <stop offset="1" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
            {LAYER_COLORS.map((c, i) => (
              <linearGradient key={c} id={`${gradId}-l${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={c} stopOpacity={0.45} />
                <stop offset="1" stopColor={c} stopOpacity={0.08} />
              </linearGradient>
            ))}
          </defs>
          {gridYs.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={W - PAD.right + 6} y={y(v) + 3.5} fontSize={10} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
                {formatEur(v)}
              </text>
            </g>
          ))}

          {stacked ? (
            bands.map((d, li) => <path key={li} d={d} fill={`url(#${gradId}-l${li % LAYER_COLORS.length})`} />)
          ) : (
            <path d={area} fill={`url(#${gradId}-a)`} />
          )}
          <path d={line} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {hover != null && (
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={baseline} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
          )}

          {dots &&
            data.map((d, i) =>
              i === data.length - 1 ? null : <circle key={d.recorded_at} cx={xs[i]} cy={y(d.value)} r={2.5} fill={lineColor} />,
            )}
          <circle cx={xs[xs.length - 1]} cy={y(data[data.length - 1].value)} r={5} fill={lineColor} stroke="var(--surface)" strokeWidth={3} />
          {hovered && hover != null && (
            <circle cx={xs[hover]} cy={y(hovered.value)} r={5} fill={lineColor} stroke="var(--surface)" strokeWidth={2} />
          )}

          {ticks.map((t) => (
            <text key={t.x} x={t.x} y={HH - 8} fontSize={10} fill="var(--muted)" textAnchor={t.anchor} fontFamily="var(--font-geist-mono)">
              {t.label}
            </text>
          ))}
        </svg>

        {/* Infobulle maison, gardée dans le cadre près des bords */}
        {hovered && hover != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-edge bg-raised px-3 py-2 shadow-lg"
            style={{
              left: `clamp(5rem, ${(xs[hover] / W) * 100}%, calc(100% - 5rem))`,
              top: `calc(${(y(hovered.value) / HH) * 100}% - 12px)`,
            }}
          >
            <p className="text-[11px] leading-tight text-muted">{fmtDateLong(hovered.recorded_at)}</p>
            <p className="num text-sm font-bold leading-tight">{formatEur(hovered.value)}</p>
            {stacked && (
              <p className="mt-1 flex gap-2.5 text-[11px] leading-tight text-muted">
                {layers.map((l, li) => (
                  <span key={l.label} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: LAYER_COLORS[li % LAYER_COLORS.length] }} aria-hidden />
                    <span className="num">{aligned[li][hover] != null ? formatEur(aligned[li][hover]!) : "—"}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
