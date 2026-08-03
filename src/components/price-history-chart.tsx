import { formatEur } from "@/lib/domain";

export type PricePoint = { captured_at: string; trend: number | null };

const W = 640;
const H = 180;
const PAD = { top: 16, right: 56, bottom: 24, left: 8 };
const ACCENT = "#38bdf8";

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Courbe d'évolution de la cote (trend) — SVG serveur, une seule série :
// pas de légende, le titre de la section la nomme.
export function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  const data = points.filter(
    (p): p is { captured_at: string; trend: number } => p.trend != null
  );

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted">
        Pas encore d&apos;historique — le cron des prix relève la cote chaque
        matin.
      </p>
    );
  }

  if (data.length === 1) {
    return (
      <p className="text-sm text-muted">
        Premier relevé le {fmtDate(data[0].captured_at)} :{" "}
        <span className="num text-foreground">{formatEur(data[0].trend)}</span>.
        La courbe se dessinera dès le prochain passage du cron.
      </p>
    );
  }

  const values = data.map((d) => d.trend);
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
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.trend).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${x(data.length - 1).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;

  const last = data[data.length - 1];
  const gridYs = [min, (min + max) / 2, max];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Évolution de la cote, de ${formatEur(data[0].trend)} à ${formatEur(last.trend)}`}
      className="w-full"
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

      <path d={area} fill={ACCENT} fillOpacity={0.08} />
      <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />

      {data.map((d, i) => (
        <circle key={d.captured_at} cx={x(i)} cy={y(d.trend)} r={i === data.length - 1 ? 3.5 : 2} fill={ACCENT}>
          <title>{`${fmtDate(d.captured_at)} : ${formatEur(d.trend)}`}</title>
        </circle>
      ))}

      <text x={PAD.left} y={H - 8} fontSize={10} fill="var(--muted)" fontFamily="var(--font-geist-mono)">
        {fmtDate(data[0].captured_at)}
      </text>
      <text x={W - PAD.right} y={H - 8} fontSize={10} fill="var(--muted)" textAnchor="end" fontFamily="var(--font-geist-mono)">
        {fmtDate(last.captured_at)}
      </text>
    </svg>
  );
}
