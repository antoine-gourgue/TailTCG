import { Camera, Coins, Tag, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminData } from "@/lib/admin-data";
import { fmtInt, shortDate } from "@/lib/admin-format";
import { rarityLabel } from "@/lib/rarity";
import { hostedLogo } from "@/lib/tcgdex";
import { formatEur } from "@/lib/domain";
import { StatCard, StatStrip } from "@/components/stat-card";
import { SetLogo } from "@/components/game/set-logo";
import { IconBox, PanelHead, PercentRing, PieRing, RankRow } from "@/components/admin/admin-ui";
import { TopCardsGrid, topOwned } from "@/components/admin/top-cards";

const CONDITION_COLORS: Record<string, string> = { MT: "#2dd4bf", NM: "#4ade80", EX: "#7aa2f7", GD: "#f4c361", LP: "#fb923c", PL: "#fb7185", PO: "#ef4444" };
const LANGS: Record<string, string> = { FR: "Français", JP: "Japonais", EN: "Anglais", DE: "Allemand", IT: "Italien", ES: "Espagnol" };
const LANG_COLORS = ["var(--accent-strong)", "#f4c361", "var(--sealed)", "var(--scan)", "var(--game)"];

export default async function AdminCollections() {
  const d = await loadAdminData();
  const db = createAdminClient();
  const live = d.items.filter((i) => i.sold_at == null);
  const qty = (i: { quantity: number | null }) => i.quantity ?? 1;
  const cards = live.reduce((n, i) => n + qty(i), 0);
  const valued = live.reduce((n, i) => n + (i.current_price ?? 0) * qty(i), 0);
  const withCote = live.filter((i) => i.market_trend != null).length;
  const manual = live.filter((i) => i.current_price != null).length;
  const sold = d.items.length - live.length;
  const sealedQty = d.sealed.reduce((n, l) => n + l.quantity, 0);

  // Sets
  const setAgg = new Map<string, { name: string; qty: number }>();
  for (const i of live) {
    const g = setAgg.get(i.set_id) ?? { name: i.set_name, qty: 0 };
    g.qty += qty(i);
    setAgg.set(i.set_id, g);
  }
  const topSets = [...setAgg.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  const { data: setRows } = await db.from("catalog_sets").select("id, lang, logo").in("id", topSets.map(([id]) => id));
  const logoOf = (id: string) => setRows?.find((r) => r.id === id && r.lang === "fr")?.logo ?? setRows?.find((r) => r.id === id)?.logo ?? hostedLogo("fr", id) ?? null;

  // Répartitions
  const count = <K extends string>(rows: typeof live, key: (i: (typeof live)[number]) => K) => {
    const m = new Map<K, number>();
    for (const i of rows) m.set(key(i), (m.get(key(i)) ?? 0) + qty(i));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const langs = count(live, (i) => i.language || "FR");
  const conds = count(live, (i) => i.condition);
  const rarities = count(live, (i) => rarityLabel(i.rarity)).slice(0, 11);

  // Scellés les plus détenus (et par combien de comptes)
  const prod = new Map<number, { p: (typeof d.sealed)[number]["product"]; qty: number; owners: Set<string> }>();
  for (const l of d.sealed) {
    const g = prod.get(l.product.id) ?? { p: l.product, qty: 0, owners: new Set<string>() };
    g.qty += l.quantity;
    g.owners.add(l.owner_id);
    prod.set(l.product.id, g);
  }
  const topProducts = [...prod.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Hors catalogue récentes (visuels privés : URL signées)
  const customs = d.customCards.slice(0, 6);
  const paths = customs.map((c) => c.image_path).filter((p): p is string => !!p);
  const signed = new Map<string, string | null>();
  if (paths.length) {
    const { data } = await db.storage.from("card-photos").createSignedUrls(paths, 3600);
    paths.forEach((p, i) => signed.set(p, data?.[i]?.signedUrl ?? null));
  }
  const nameOf = new Map(d.accounts.map((a) => [a.id, a.name ?? a.email]));
  const grades = new Map<string, number>();
  for (const g of d.pregrades) if (!grades.has(g.item_id)) grades.set(g.item_id, g.grade);
  const gradeDist = Array.from({ length: 10 }, (_, k) => 10 - k).map((g) => ({ g, n: [...grades.values()].filter((x) => Math.round(x) === g).length }));
  const gradeMax = Math.max(...gradeDist.map((x) => x.n), 1);
  const cotePct = live.length ? (withCote / live.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <StatStrip cols={5}>
        <StatCard label="Exemplaires" value={fmtInt(cards)} sub={`${fmtInt(live.length)} références`} />
        <StatCard label="Valeur saisie" value={formatEur(valued)} sub={`${fmtInt(manual)} cartes valorisées`} />
        <StatCard label="Cote connue" value={`${Math.round(cotePct)} %`} sub={`${fmtInt(withCote)} références`} />
        <StatCard label="Scellés" value={fmtInt(sealedQty)} sub={`${prod.size} produits`} />
        <StatCard label="Hors catalogue" value={fmtInt(d.customCards.length)} sub="avec photo perso" />
      </StatStrip>

      <section className="panel p-5">
        <PanelHead title="Cartes les plus possédées" hint="Toutes collections confondues" />
        <TopCardsGrid cards={topOwned(d.items)} />
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Sets les plus collectionnés" hint="Exemplaires par extension" />
          {topSets.map(([id, s]) => (
            <RankRow
              key={id}
              label={id === "custom" ? "Hors catalogue" : s.name}
              lead={
                <span className="flex h-6 w-11 shrink-0 items-center justify-center">
                  {id === "custom" ? <Camera size={13} className="text-faint" aria-hidden /> : <SetLogo logo={logoOf(id)} className="max-h-6 max-w-11 object-contain" />}
                </span>
              }
              value={s.qty}
              max={topSets[0][1].qty}
            />
          ))}
        </section>
        <section className="panel p-5">
          <PanelHead title="Langues et états" hint={`Sur ${fmtInt(cards)} exemplaires`} />
          <div className="flex flex-col gap-6">
            <PieRing
              parts={langs.map(([k, v], i) => ({ label: LANGS[k] ?? k, value: v, color: LANG_COLORS[i % LANG_COLORS.length] }))}
              center={`${Math.round(((langs[0]?.[1] ?? 0) / Math.max(cards, 1)) * 100)} %`}
              sub={(LANGS[langs[0]?.[0] ?? ""] ?? "").toLowerCase() || undefined}
            />
            <PieRing parts={conds.map(([k, v]) => ({ label: k, value: v, color: CONDITION_COLORS[k] ?? "var(--faint)" }))} center={conds[0]?.[0] ?? "—"} sub="le plus courant" />
          </div>
        </section>
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Raretés" hint="Rareté TCGdex des cartes possédées, libellés harmonisés" />
          {rarities.map(([k, v]) => (
            <RankRow key={k} label={k} value={v} max={rarities[0][1]} color="#f4c361" />
          ))}
        </section>
        <section className="panel p-5">
          <PanelHead title="Qualité des données" hint="Ce qui aide, ou manque, pour bien valoriser" />
          <div className="flex items-center gap-4">
            <PercentRing pct={cotePct} />
            <div className="min-w-0">
              <p className="font-semibold">Cote Cardmarket connue</p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {fmtInt(withCote)} références sur {fmtInt(live.length)} ont une cote relevée chaque nuit.
              </p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-ring">
            {[
              { icon: Tag, tone: "accent" as const, label: "Valeurs saisies à la main", v: manual },
              { icon: Camera, tone: "muted" as const, label: "Cartes hors catalogue", v: d.customCards.length },
              { icon: Coins, tone: "muted" as const, label: "Cartes vendues", v: sold },
              { icon: Trash2, tone: "warn" as const, label: "En corbeille", v: d.trash },
            ].map((r) => (
              <li key={r.label} className="flex items-center gap-3 py-2.5 last:pb-0">
                <IconBox icon={r.icon} tone={r.tone} />
                <span className="flex-1 text-[13.5px]">{r.label}</span>
                <span className="num font-semibold">{fmtInt(r.v)}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="panel p-5">
        <PanelHead title="Scellés les plus détenus" hint={`${fmtInt(sealedQty)} exemplaires · ${prod.size} produits`} />
        {topProducts.length === 0 ? (
          <p className="text-sm text-muted">Aucun produit scellé.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {topProducts.map(({ p, qty: q, owners }) => (
              <li key={p.id} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-ring">
                <div className="relative aspect-[4/3] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2.5" />
                  <span className="num absolute right-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-px text-[10.5px] font-bold text-white">×{q}</span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 min-h-[2lh] text-xs font-semibold leading-tight">{p.name}</p>
                  <p className="mt-1 text-[10.5px] text-muted">
                    {owners.size} compte{owners.size > 1 ? "s" : ""}
                    {d.sealedCote.get(p.id) != null && <span className="num"> · {formatEur(d.sealedCote.get(p.id)!)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Hors catalogue récentes" hint="Cartes ajoutées avec une photo perso" />
          {customs.length === 0 ? (
            <p className="text-sm text-muted">Aucune.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {customs.map((c, i) => {
                const url = c.image_path ? signed.get(c.image_path) : null;
                return (
                  <li key={i} className="min-w-0">
                    <div className="card-tile flex aspect-[63/88] items-center justify-center bg-raised">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {url ? <img src={url} alt={c.name} loading="lazy" className="h-full w-full object-cover" /> : <Camera size={16} className="text-faint" aria-hidden />}
                    </div>
                    <p className="mt-1.5 truncate text-[11px]">{c.name}</p>
                    <p className="truncate text-[10px] text-faint">
                      {nameOf.get(c.owner_id) ?? "—"} · {shortDate(c.created_at, d.now)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <PanelHead title="Pré-gradations" hint={`${grades.size} carte${grades.size > 1 ? "s" : ""} notée${grades.size > 1 ? "s" : ""}, dernière note par carte`} />
          <div className="flex h-36 items-end gap-1.5">
            {gradeDist
              .slice()
              .reverse()
              .map(({ g, n }) => (
                <div key={g} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  {n > 0 && <span className="num text-[11px] font-semibold">{n}</span>}
                  <i className="block w-full rounded-md" style={{ height: n ? `${(n / gradeMax) * 80}%` : 3, background: n ? (g >= 9 ? "var(--gain)" : g >= 7 ? "#f4c361" : "var(--loss)") : "var(--raised)" }} />
                  <span className="num text-[10.5px] text-faint">{g}</span>
                </div>
              ))}
          </div>
        </section>
      </section>
    </div>
  );
}
