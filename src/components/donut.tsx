"use client";

import { useState } from "react";
import type { Slice } from "@/components/stats-widgets";

/* Couleur unique (accent) déclinée en intensité plutôt qu'une palette */
const RAMP = [100, 72, 52, 36, 24, 15, 9].map((p) => `color-mix(in srgb, var(--accent) ${p}%, transparent)`);
const R = 40;
const C = 2 * Math.PI * R;

/**
 * Anneau + légende : parts d'un total, ordre = ordre des tranches. Survoler
 * une tranche ou sa ligne de légende la met en avant et affiche son détail au
 * centre de l'anneau — pas d'infobulle du navigateur.
 */
export function Donut({ slices, unit = "cartes", label }: { slices: Slice[]; unit?: string; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const present = slices.filter((s) => s.count > 0);
  const total = present.reduce((a, s) => a + s.count, 0);
  if (total === 0) return <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">Rien à afficher pour l&apos;instant.</p>;

  const segs: (Slice & { len: number; offset: number; color: string })[] = [];
  for (let i = 0, offset = 0; i < present.length; i++) {
    const len = (present[i].count / total) * C;
    segs.push({ ...present[i], len, offset, color: RAMP[Math.min(i, RAMP.length - 1)] });
    offset += len;
  }
  const current = active != null ? (segs.find((s) => s.code === active) ?? null) : null;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="flex items-center gap-5 md:flex-col md:items-start md:gap-4 lg:flex-row lg:items-center lg:gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={label} onMouseLeave={() => setActive(null)}>
        <circle cx={50} cy={50} r={R} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={12} />
        {segs.map((s) => {
          const on = current?.code === s.code;
          return (
            <circle
              key={s.code}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={on ? 14 : 12}
              strokeOpacity={current && !on ? 0.3 : 1}
              strokeDasharray={`${Math.max(s.len - 1.5, 0.5)} ${C}`}
              strokeDashoffset={-s.offset}
              transform="rotate(-90 50 50)"
              onMouseEnter={() => setActive(s.code)}
              className="cursor-default transition-all duration-150"
            />
          );
        })}
        {/* Centre : total, ou la tranche survolée */}
        <text x={50} y={49} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--foreground)" fontFamily="var(--font-geist-mono)">
          {current ? current.count : total}
        </text>
        <text x={50} y={62} textAnchor="middle" fontSize={7.5} fill="var(--muted)" fontFamily={current ? "var(--font-geist-mono)" : undefined}>
          {current ? `${pct(current.count)} %` : unit}
        </text>
      </svg>
      <ul className="-mx-2 flex w-full min-w-0 flex-1 flex-col" onMouseLeave={() => setActive(null)}>
        {segs.map((s) => {
          const on = current?.code === s.code;
          return (
            <li
              key={s.code}
              onMouseEnter={() => setActive(s.code)}
              className={`flex items-center gap-2 rounded-lg px-2 py-[3px] text-[13px] transition ${on ? "bg-raised" : current ? "opacity-60" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate" title={s.label}>
                {s.label}
              </span>
              <span className={`num ml-auto shrink-0 text-[11px] ${on ? "text-foreground" : "text-muted"}`}>
                {s.count} · {pct(s.count)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
