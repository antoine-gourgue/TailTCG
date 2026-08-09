import { loadAdminBundle } from "@/lib/admin-data";
import { RankBars } from "@/components/admin/mini-bars";
import { sourceKindLabel } from "@/lib/domain";

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export default async function AdminContent() {
  const b = await loadAdminBundle();
  const live = b.items.filter((i) => i.deleted_at == null);

  // Cartes les plus possédées (toutes collections)
  const cardCount = new Map<string, number>();
  for (const i of live) {
    const k = `${i.card_name}||${i.set_name}`;
    cardCount.set(k, (cardCount.get(k) ?? 0) + (i.quantity ?? 1));
  }
  const topCards = [...cardCount.entries()]
    .map(([k, value]) => ({ label: k.split("||")[0], hint: `×${value}`, value }))
    .sort((a, x) => x.value - a.value)
    .slice(0, 12);

  // Langues
  const langCount = new Map<string, number>();
  for (const i of live) {
    const l = i.language ?? "?";
    langCount.set(l, (langCount.get(l) ?? 0) + (i.quantity ?? 1));
  }
  const langs = [...langCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, x) => x.value - a.value);

  // Types de sources
  const kindCount = new Map<string, number>();
  for (const s of b.sources) kindCount.set(s.kind, (kindCount.get(s.kind) ?? 0) + 1);
  const kinds = [...kindCount.entries()]
    .map(([k, value]) => ({ label: sourceKindLabel(k), value }))
    .sort((a, x) => x.value - a.value);

  // Dernières pré-gradations
  const recentGradings = [...b.gradings]
    .sort((a, x) => (x.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 10);
  const nameByOwner = new Map(b.users.map((u) => [u.id, u.name ?? u.email]));

  // Dernières cartes hors catalogue
  const recentCustom = [...b.customCards]
    .sort((a, x) => (x.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label-xs mb-3">Cartes les plus possédées</p>
          <RankBars data={topCards} />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Langues</p>
          <RankBars data={langs} />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Types de sources</p>
          <RankBars data={kinds} accent="var(--gain)" />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Dernières cartes hors catalogue</p>
          {recentCustom.length === 0 ? (
            <p className="text-sm text-muted">Aucune.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {recentCustom.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="num shrink-0 text-xs text-faint">{fmt(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="display mb-3 text-lg font-semibold">Dernières pré-gradations</h3>
        <div className="panel divide-y divide-edge/60 !p-0">
          {recentGradings.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">Aucune.</p>
          ) : (
            recentGradings.map((g, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong">
                  {g.grade}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {nameByOwner.get(g.owner_id) ?? "—"}
                </span>
                <span className="num shrink-0 text-xs text-faint">{fmt(g.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
