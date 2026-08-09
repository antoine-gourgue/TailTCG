// Mini graphique en barres (server component, SVG pur)
export function MiniBars({
  data,
  height = 120,
  accent = "var(--accent)",
  everyLabel = 5,
}: {
  data: { label: string; value: number }[];
  height?: number;
  accent?: string;
  everyLabel?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const gap = 2;
  const bw = 100 / n;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect
              key={i}
              x={i * bw + gap / 2}
              y={height - h}
              width={bw - gap}
              height={h}
              rx={0.6}
              fill={accent}
              opacity={d.value === 0 ? 0.15 : 0.85}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        {data.map((d, i) =>
          i % everyLabel === 0 || i === n - 1 ? (
            <span key={i} className="num">{d.label}</span>
          ) : null
        )}
      </div>
    </div>
  );
}

// Barres horizontales avec libellés (répartitions)
export function RankBars({
  data,
  accent = "var(--accent)",
}: {
  data: { label: string; value: number; hint?: string }[];
  accent?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0)
    return <p className="text-sm text-muted">Aucune donnée.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate" title={d.label}>
            {d.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded bg-raised">
            <span
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: accent, opacity: 0.85 }}
            />
          </span>
          <span className="num w-12 shrink-0 text-right font-medium">
            {d.hint ?? d.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
