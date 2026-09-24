import { formatEur } from "@/lib/domain";

type Point = { day: string; price: number };

const fmtDay = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Courbe d'évolution de la cote d'un produit scellé (SVG, sans dépendance).
 * Avec un seul relevé, on le dit : l'historique se constitue chaque nuit.
 */
export function SealedPriceChart({ points }: { points: Point[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted">Pas encore de relevé : la cote est enregistrée chaque nuit à partir de maintenant.</p>;
  }
  if (points.length === 1) {
    return (
      <p className="text-sm text-muted">
        Premier relevé le {fmtDay(points[0].day)} à <span className="num font-semibold text-foreground">{formatEur(points[0].price)}</span>. La
        courbe se dessine au fil des relevés quotidiens.
      </p>
    );
  }

  const W = 640;
  const H = 200;
  const PAD = { l: 8, r: 8, t: 14, b: 26 };
  const prices = points.map((p) => p.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (max === min) {
    min *= 0.95;
    max *= 1.05;
  }
  const span = max - min;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const up = last.price >= first.price;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`h-auto w-full ${up ? "text-gain" : "text-loss"}`} role="img" aria-label="Évolution de la cote">
        <defs>
          <linearGradient id="sealed-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sealed-area)" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.price)} r="4" fill="currentColor" />
        <text x={PAD.l} y={H - 8} fontSize="11" fill="var(--muted)">
          {fmtDay(first.day)}
        </text>
        <text x={W - PAD.r} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">
          {fmtDay(last.day)}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-x-6 text-xs text-muted">
        <span>
          Min <span className="num text-foreground">{formatEur(Math.min(...prices))}</span>
        </span>
        <span>
          Max <span className="num text-foreground">{formatEur(Math.max(...prices))}</span>
        </span>
        <span>
          {points.length} relevés
        </span>
      </div>
    </div>
  );
}
