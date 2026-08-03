import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSetsIndex } from "@/lib/tcgdex";
import { formatEur, CONDITIONS } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "Statistiques — Pokédex Collection",
};

const ACCENT = "var(--accent)";
// Rampe séquentielle (état = échelle ordonnée MT → PO), du clair au foncé,
// dans la teinte or du thème
const CONDITION_RAMP: Record<string, string> = {
  MT: "#f3ddab",
  NM: "#e7c877",
  EX: "#d9a83f",
  GD: "#b8892b",
  LP: "#946c1e",
  PL: "#6f4f15",
  PO: "#4a340d",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="panel p-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`num display text-2xl font-bold ${
          tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  display,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
      <p className="truncate text-sm">{label}</p>
      <p className="num text-right text-sm text-muted">{display}</p>
      <div className="col-span-2 h-2.5 overflow-hidden rounded-r bg-foreground/5">
        <div
          className="h-full rounded-r"
          style={{
            width: `${max > 0 ? Math.max((value / max) * 100, 1.5) : 0}%`,
            background: ACCENT,
          }}
        />
      </div>
    </div>
  );
}

function ConditionDonut({ counts }: { counts: Map<string, number> }) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const R = 56;
  const C = 2 * Math.PI * R;
  const present = CONDITIONS.filter((c) => (counts.get(c.code) ?? 0) > 0);
  const segments = present.map((c, idx) => {
    const count = counts.get(c.code) ?? 0;
    const offset = present
      .slice(0, idx)
      .reduce((acc, p) => acc + ((counts.get(p.code) ?? 0) / total) * C, 0);
    return { code: c.code, label: c.label, count, len: (count / total) * C, offset };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label="Répartition par état">
        {segments.map((s) => (
          <circle
            key={s.code}
            cx={80}
            cy={80}
            r={R}
            fill="none"
            stroke={CONDITION_RAMP[s.code] ?? ACCENT}
            strokeWidth={22}
            strokeDasharray={`${Math.max(s.len - 2, 0.5)} ${C - Math.max(s.len - 2, 0.5)}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 80 80)"
          >
            <title>{`${s.code} — ${s.label} : ${s.count}`}</title>
          </circle>
        ))}
        <text
          x={80}
          y={78}
          textAnchor="middle"
          fontSize={22}
          fontWeight={600}
          fill="var(--foreground)"
          fontFamily="var(--font-geist-mono)"
        >
          {total}
        </text>
        <text x={80} y={96} textAnchor="middle" fontSize={10} fill="var(--muted)">
          carte{total > 1 ? "s" : ""}
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.code} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: CONDITION_RAMP[s.code] ?? ACCENT }}
            />
            <span className="num font-semibold">{s.code}</span>
            <span className="text-muted">{s.label}</span>
            <span className="num ml-auto pl-4">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: items }, { data: sources }, setsIndex] = await Promise.all([
    supabase
      .from("collection_value")
      .select(
        "id, tcgdex_id, card_name, set_id, set_name, condition, quantity, purchase_price, source_id, current_price, gain"
      ),
    supabase.from("sources").select("id, name"),
    fetchSetsIndex(),
  ]);

  const rows = items ?? [];

  // Totaux
  let count = 0;
  let invested = 0;
  let value = 0;
  let hasValue = false;
  for (const i of rows) {
    count += i.quantity ?? 0;
    if (i.purchase_price != null) invested += i.purchase_price * (i.quantity ?? 1);
    if (i.current_price != null) {
      value += i.current_price * (i.quantity ?? 1);
      hasValue = true;
    }
  }
  const gain = hasValue ? value - invested : null;

  // Répartitions
  const bySet = new Map<string, { name: string; cards: number; owned: Set<string> }>();
  const byCondition = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const i of rows) {
    const setKey = i.set_id ?? "?";
    const s = bySet.get(setKey) ?? { name: i.set_name ?? setKey, cards: 0, owned: new Set<string>() };
    s.cards += i.quantity ?? 0;
    if (i.tcgdex_id) s.owned.add(i.tcgdex_id);
    bySet.set(setKey, s);

    const cond = i.condition ?? "?";
    byCondition.set(cond, (byCondition.get(cond) ?? 0) + (i.quantity ?? 0));

    if (i.purchase_price != null) {
      const key = i.source_id ?? "__none__";
      bySource.set(key, (bySource.get(key) ?? 0) + i.purchase_price * (i.quantity ?? 1));
    }
  }

  const sourceName = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const setBars = [...bySet.entries()].sort((a, b) => b[1].cards - a[1].cards);
  const maxSetCards = setBars[0]?.[1].cards ?? 0;
  const sourceBars = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const maxSourceSpent = sourceBars[0]?.[1] ?? 0;

  const withGain = rows.filter((i) => i.gain != null);
  const top5 = [...withGain].sort((a, b) => b.gain! - a.gain!).slice(0, 5);
  const flop5 = [...withGain].sort((a, b) => a.gain! - b.gain!).slice(0, 5);

  return (
    <>
      <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 display text-3xl font-bold tracking-tight">
          Statistiques
        </h1>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            Ajoute des cartes pour voir des statistiques.
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Cartes" value={String(count)} />
              <StatTile label="Total investi" value={formatEur(invested)} />
              <StatTile label="Valeur estimée" value={formatEur(hasValue ? value : null)} />
              <StatTile
                label="Plus-value"
                value={gain == null ? "—" : `${gain > 0 ? "+" : ""}${formatEur(gain)}`}
                tone={gain == null ? undefined : gain >= 0 ? "up" : "down"}
              />
            </div>

            <div className="grid gap-10 lg:grid-cols-2">
              <section>
                <h2 className="mb-4 display text-xl font-semibold">
                  Répartition par set
                </h2>
                <div className="flex flex-col gap-3">
                  {setBars.map(([id, s]) => (
                    <BarRow
                      key={id}
                      label={s.name}
                      value={s.cards}
                      max={maxSetCards}
                      display={`${s.cards} carte${s.cards > 1 ? "s" : ""}`}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-4 display text-xl font-semibold">
                  Répartition par état
                </h2>
                <ConditionDonut counts={byCondition} />
              </section>

              <section>
                <h2 className="mb-4 display text-xl font-semibold">
                  Dépenses par source
                </h2>
                {sourceBars.length === 0 ? (
                  <p className="text-sm text-muted">Aucun prix d&apos;achat renseigné.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sourceBars.map(([key, spent]) => (
                      <BarRow
                        key={key}
                        label={key === "__none__" ? "Sans source" : sourceName.get(key) ?? "?"}
                        value={spent}
                        max={maxSourceSpent}
                        display={formatEur(spent)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-4 display text-xl font-semibold">
                  Progression par set
                </h2>
                <div className="flex flex-col gap-3">
                  {setBars.map(([id, s]) => {
                    const official = setsIndex.get(id)?.cardCount?.official;
                    if (!official) return null;
                    const owned = s.owned.size;
                    return (
                      <div key={id}>
                        <div className="mb-0.5 flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm">{s.name}</p>
                          <p className="num text-sm text-muted">
                            {owned} / {official}
                          </p>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-r bg-foreground/5">
                          <div
                            className="h-full rounded-r"
                            style={{
                              width: `${Math.min((owned / official) * 100, 100)}%`,
                              background: ACCENT,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {withGain.length > 0 && (
              <div className="grid gap-10 lg:grid-cols-2">
                <section>
                  <h2 className="mb-4 display text-xl font-semibold">
                    Top 5 plus-values
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {top5.map((i) => (
                      <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <Link href={`/carte/${i.id}`} className="truncate hover:underline">
                          {i.card_name}{" "}
                          <span className="text-xs text-muted">({i.set_name})</span>
                        </Link>
                        <span className={`num shrink-0 ${i.gain! >= 0 ? "text-gain" : "text-loss"}`}>
                          {i.gain! > 0 ? "+" : ""}
                          {formatEur(i.gain)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h2 className="mb-4 display text-xl font-semibold">
                    Pires plus-values
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {flop5.map((i) => (
                      <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <Link href={`/carte/${i.id}`} className="truncate hover:underline">
                          {i.card_name}{" "}
                          <span className="text-xs text-muted">({i.set_name})</span>
                        </Link>
                        <span className={`num shrink-0 ${i.gain! >= 0 ? "text-gain" : "text-loss"}`}>
                          {i.gain! > 0 ? "+" : ""}
                          {formatEur(i.gain)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
      </AppShell>
    </>
  );
}
