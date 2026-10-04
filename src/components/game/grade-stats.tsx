import { gradeLabel, gradeTone } from "@/lib/game";

/** Répartition des notes de gradation : une barre par note de 10 à 1, colorée selon la note, avec le compte */
export function GradeDistribution({ overalls }: { overalls: number[] }) {
  const total = overalls.length;
  const dist = new Map<number, number>();
  for (const g of overalls) dist.set(g, (dist.get(g) ?? 0) + 1);
  const max = Math.max(1, ...dist.values());
  const notes = Array.from({ length: 10 }, (_, i) => 10 - i).filter((n) => (dist.get(n) ?? 0) > 0);

  return (
    <section className="panel p-5">
      <h2 className="display text-[15px] font-semibold">Répartition des notes</h2>
      <p className="text-xs text-muted">{total > 0 ? `${total} carte${total > 1 ? "s" : ""} gradée${total > 1 ? "s" : ""}.` : "Grade des cartes pour voir leurs notes ici."}</p>
      {total > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {notes.map((n) => {
            const count = dist.get(n) ?? 0;
            const tone = gradeTone(n);
            return (
              <div key={n} className="flex items-center gap-3">
                <span className="num w-5 shrink-0 text-sm font-bold" style={{ color: tone.ring }}>
                  {n}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max((count / max) * 100, 4)}%`, background: tone.ring }} />
                </span>
                <span className="num w-6 shrink-0 text-right text-xs font-semibold">{count}</span>
                <span className="hidden w-16 shrink-0 truncate text-[11px] text-muted sm:block">{gradeLabel(n)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
