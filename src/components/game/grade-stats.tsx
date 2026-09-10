import { gradeLabel, gradeTone } from "@/lib/game";

/**
 * Répartition des notes de gradation : une tuile par indicateur (total,
 * moyenne, meilleure) puis une barre par note de 10 à 1, colorée selon la
 * note, avec le compte.
 */
export function GradeStats({ overalls }: { overalls: number[] }) {
  const total = overalls.length;
  if (total === 0) return null;

  const dist = new Map<number, number>();
  for (const g of overalls) dist.set(g, (dist.get(g) ?? 0) + 1);
  const max = Math.max(...dist.values());
  const avg = overalls.reduce((a, b) => a + b, 0) / total;
  const best = Math.max(...overalls);
  const gems = dist.get(10) ?? 0;
  const notes = Array.from({ length: 10 }, (_, i) => 10 - i).filter((n) => (dist.get(n) ?? 0) > 0);

  return (
    <section className="panel mb-6 p-5">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Tile label="Cartes gradées" value={String(total)} />
        <Tile label="Note moyenne" value={avg.toFixed(1)} />
        <Tile label="Gem Mint 10" value={String(gems)} />
      </div>
      <p className="label-xs mb-2">Répartition des notes</p>
      <div className="flex flex-col gap-1.5">
        {notes.map((n) => {
          const count = dist.get(n) ?? 0;
          const tone = gradeTone(n);
          return (
            <div key={n} className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="num text-sm font-bold" style={{ color: tone.ring }}>
                  {n}
                </span>
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-foreground/[0.07]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max((count / max) * 100, 4)}%`, background: tone.ring }}
                />
              </span>
              <span className="num w-16 text-right text-xs text-muted">
                {count} · {gradeLabel(n)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-faint">
        Meilleure note obtenue : <span className="num font-semibold text-foreground">{best}/10</span> ·{" "}
        {gradeLabel(best)}
      </p>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-raised/60 p-3 text-center">
      <p className="num display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}
