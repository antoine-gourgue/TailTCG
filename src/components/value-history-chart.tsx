"use client";

import { useState } from "react";
import { formatEur } from "@/lib/domain";

export type ValuePoint = { recorded_at: string; value: number };

const W = 640;
const H = 180;
const PAD = { top: 16, right: 60, bottom: 24, left: 8 };

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Courbe des valeurs estimées saisies, tooltip maison au survol des points
export function ValueHistoryChart({ points }: { points: ValuePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const data = [...points].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at)
  );

  if (data.length === 0) return null;

  if (data.length === 1) {
    return (
      <p className="text-sm text-muted">
        Première valeur enregistrée le {fmtDate(data[0].recorded_at)} :{" "}
        <span className="num text-foreground">{formatEur(data[0].value)}</span>.
        La courbe se dessinera à ta prochaine actualisation.
      </p>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.1 || 1;
  const yLo = min - span * 0.15;
  const yHi = max + span * 0.15;

  const x = (i: number) =>
    PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${x(data.length - 1).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;

  const last = data[data.length - 1];
  const gridYs = min === max ? [min] : [min, (min + max) / 2, max];

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Évolution de la valeur, de ${formatEur(data[0].value)} à ${formatEur(last.value)}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
      >
        {gridYs.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={W - PAD.right + 6}
              y={y(v) + 3.5}
              fontSize={10}
              fill="var(--muted)"
              fontFamily="var(--font-geist-mono)"
            >
              {formatEur(v)}
            </text>
          </g>
        ))}

        <path d={area} fill="var(--accent)" fillOpacity={0.07} />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Repère vertical du point survolé */}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--accent)"
            strokeOpacity={0.25}
            strokeDasharray="3 3"
          />
        )}

        {data.map((d, i) => (
          <g key={d.recorded_at}>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r={hover === i ? 5 : i === data.length - 1 ? 3.5 : 2.5}
              fill="var(--accent)"
              stroke={hover === i ? "var(--raised)" : "none"}
              strokeWidth={hover === i ? 2 : 0}
              className="transition-all duration-100"
            />
            {/* Zone de survol large, invisible */}
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r={14}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        <text x={PAD.left} y={H - 8} fontSize={10} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
          {fmtDate(data[0].recorded_at)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          fontSize={10}
          fill="var(--muted)"
          textAnchor="end"
          fontFamily="var(--font-geist-mono)"
        >
          {fmtDate(last.recorded_at)}
        </text>
      </svg>

      {/* Tooltip maison */}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-edge bg-raised px-3 py-1.5 text-center shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `calc(${(y(hovered.value) / H) * 100}% - 10px)`,
          }}
        >
          <p className="num text-sm font-bold leading-tight">
            {formatEur(hovered.value)}
          </p>
          <p className="text-[11px] leading-tight text-muted">
            {fmtDateLong(hovered.recorded_at)}
          </p>
        </div>
      )}
    </div>
  );
}
