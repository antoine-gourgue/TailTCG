import Link from "next/link";
import { BadgeCheck, Boxes, ClipboardList, Heart, Tag, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { formatEur } from "@/lib/domain";
import { kindLabel } from "@/lib/sealed";
import { combineStats, type SealedRank, type SealedStats } from "@/lib/stats-data";
import { ValueHistoryChart, type ValuePoint } from "@/components/value-history-chart";
import { BarRow, Empty, Fact, Panel, RankRow, RankTile, type MonthPoint, type RankItem, type Slice } from "@/components/stats-widgets";
import { Donut } from "@/components/donut";
import { MonthlyBars } from "@/components/monthly-bars";

export type SetStat = {
  id: string;
  name: string;
  cards: number;
  owned: number;
  total: number | null;
  pct: number | null;
};

export type SourceStat = { key: string; label: string; spent: number };

export type StatsData = {
  count: number;
  unique: number;
  completeSets: number;
  graded: number;
  toReview: number;
  invested: number;
  pricedCount: number;
  value: number | null;
  valuedCount: number;
  gain: number | null;
  gainPct: number | null;
  /** valeur au cours Cardmarket (dernier relevé), cartes cotées seulement */
  market: number | null;
  marketCount: number;
  monthDelta: number | null;
  soldCount: number;
  realized: number;
  valueSeries: ValuePoint[];
  months: MonthPoint[];
  yearSpend: number;
  yearCards: number;
  activeMonths: number;
  sets: SetStat[];
  sources: SourceStat[];
  sourcesCount: number;
  conditionSlices: Slice[];
  languageSlices: Slice[];
  raritySlices: Slice[];
  hasGain: boolean;
  top: RankItem[];
  flop: RankItem[];
  wishCount: number;
  wishCost: number | null;
};

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatEur(v)}`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const SETS_SHOWN = 6;

/** Carte de chiffre de la colonne du héros */
function Kpi({ label, value, sub, tone, children }: { label: string; value: string; sub?: React.ReactNode; tone?: "up" | "down"; children?: React.ReactNode }) {
  return (
    <div className="panel flex min-w-0 flex-1 flex-col justify-center p-5">
      <p className="label-xs text-muted">{label}</p>
      <p className={`display num mt-1 truncate text-2xl font-bold ${tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""}`}>{value}</p>
      {children}
      {sub && <p className="num mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Tableau de bord en bento : un héros (le chiffre et la courbe), une colonne
 * de chiffres, puis des panneaux de tailles différentes — cartes seules, ou
 * cartes + scellés (`s` fourni) avec le comparatif et la section Scellés.
 */
export function StatsView({ d, s }: { d: StatsData; s?: SealedStats }) {
  const maxSpent = d.sources[0]?.spent ?? 0;
  const sealed = s && s.count > 0 ? s : null;
  const c = sealed ? combineStats(d, sealed) : null;
  const months = c ? c.months : d.months;
  const yearSpend = c ? c.yearSpend : d.yearSpend;
  const activeMonths = c ? c.activeMonths : d.activeMonths;
  const value = c ? c.value : d.value;
  const gain = c ? c.gain : d.gain;
  const gainPct = c ? c.gainPct : d.gainPct;
  const monthDelta = c ? c.monthDelta : d.monthDelta;
  const market = c ? c.market : d.market;
  const invested = c ? c.invested : d.invested;
  const series = c ? c.valueSeries : d.valueSeries;
  const sealedShare = c && sealed && invested > 0 ? Math.round((sealed.invested / invested) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ——— Héros : le chiffre, sa plus-value, la courbe ——— */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel relative col-span-1 overflow-hidden p-5 sm:p-6 lg:col-span-8">
          <span className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="label-xs text-muted">Valeur estimée{sealed ? " · cartes et scellés" : ""}</p>
            <p className={`display num mt-1 text-[36px] font-bold leading-none tracking-tight sm:text-[44px] ${value == null ? "text-faint" : ""}`}>{formatEur(value)}</p>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {gain != null ? (
                <>
                  <span className={`num inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${gain >= 0 ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"}`}>
                    {gain >= 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                    {signed(gain)}
                    {gainPct != null && ` · ${signedPct(gainPct)}`}
                  </span>
                  <span>depuis le prix payé, latente</span>
                </>
              ) : value == null ? (
                <span>Saisis une valeur sur tes fiches, ou laisse la cote faire : la courbe se dessinera ici.</span>
              ) : (
                <span>Renseigne tes prix d&apos;achat pour suivre la plus-value.</span>
              )}
            </p>
            <div className="mt-5">
              {series.length > 0 ? (
                c && sealed ? (
                  <ValueHistoryChart
                    points={c.valueSeries}
                    layers={[
                      { label: "Cartes", points: d.valueSeries },
                      { label: "Scellés", points: sealed.series },
                    ]}
                    height={220}
                  />
                ) : (
                  <ValueHistoryChart points={d.valueSeries} height={220} />
                )
              ) : (
                <Empty>Actualise la valeur estimée de tes cartes depuis leur fiche : la courbe se dessinera ici.</Empty>
              )}
            </div>
            {c?.sealedStart && <p className="mt-2 text-[11px] text-faint">Cote des scellés relevée chaque nuit depuis le {shortDate(c.sealedStart)}.</p>}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1">
          <Kpi
            label="Valeur Cardmarket"
            value={formatEur(market)}
            sub={
              d.market == null
                ? sealed
                  ? "Aucune carte cotée · scellés à la cote"
                  : "Aucune carte cotée sur les 10 derniers jours"
                : `${d.marketCount} carte${d.marketCount > 1 ? "s" : ""} sur ${d.count} cotée${d.marketCount > 1 ? "s" : ""}${sealed ? " · scellés à la cote" : ""}`
            }
          />
          <Kpi
            label="Investi"
            value={formatEur(invested)}
            sub={
              c && sealed
                ? `cartes ${formatEur(d.invested)} · scellés ${formatEur(sealed.invested)}`
                : d.pricedCount === 0
                  ? "Aucun prix d'achat saisi"
                  : `${plural(d.pricedCount, "carte")} au prix connu · ${formatEur(d.invested / d.pricedCount)} par carte`
            }
          >
            {sealedShare != null && (
              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
                <span className="bg-accent" style={{ width: `${100 - sealedShare}%` }} />
                <span className="bg-sealed" style={{ width: `${sealedShare}%` }} />
              </div>
            )}
          </Kpi>
          {monthDelta != null ? (
            <Kpi label="Sur 30 jours" value={signed(monthDelta)} tone={monthDelta >= 0 ? "up" : "down"} sub={value ? `${signedPct((monthDelta / Math.max(value - monthDelta, 1)) * 100)} · achats inclus` : "achats inclus"} />
          ) : (
            <Kpi label="Cartes" value={String(d.count)} sub={`${plural(d.unique, "unique")} · ${d.completeSets > 0 ? `${plural(d.completeSets, "set")} complet${d.completeSets > 1 ? "s" : ""}` : plural(d.sets.length, "set")}`} />
          )}
        </div>
      </div>

      {/* ——— Comparatif, achats, rareté ——— */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {c && sealed && (
          <Panel title="Cartes et scellés" hint="Ce que chacun pèse dans la collection." className="lg:col-span-4">
            <ShareBar a={d.value ?? 0} b={sealed.value ?? 0} />
            <div className="mt-4 grid grid-cols-2 divide-x divide-ring">
              <SideCol
                tone="accent"
                label="Cartes"
                sub={`${plural(d.count, "carte")} · ${plural(d.sets.length, "set")}`}
                href="/cartes"
                rows={[
                  ["Valeur", d.value == null ? null : formatEur(d.value)],
                  ["Cardmarket", d.market == null ? null : formatEur(d.market)],
                  ["Investi", formatEur(d.invested)],
                  ["Plus-value", d.gain == null ? null : <Gain v={d.gain} p={d.gainPct} />],
                  ["30 jours", c.cardsMonthDelta == null ? null : <Gain v={c.cardsMonthDelta} />],
                ]}
              />
              <SideCol
                tone="sealed"
                label="Scellés"
                sub={`${plural(sealed.count, "produit")} · ${plural(sealed.unique, "référence")}`}
                href="/scelles"
                rows={[
                  ["Valeur", sealed.value == null ? null : formatEur(sealed.value)],
                  ["Cardmarket", sealed.value == null ? null : formatEur(sealed.value)],
                  ["Investi", formatEur(sealed.invested)],
                  ["Plus-value", sealed.gain == null ? null : <Gain v={sealed.gain} p={sealed.gainPct} />],
                  ["30 jours", c.sealedMonthDelta == null ? <span className="text-xs font-normal text-faint">relevé en cours</span> : <Gain v={c.sealedMonthDelta} />],
                ]}
              />
            </div>
          </Panel>
        )}
        <Panel
          title="Achats par mois"
          href="/journal"
          hrefLabel="Journal"
          hint={
            yearSpend > 0
              ? `${formatEur(yearSpend)} sur 12 mois${c && c.yearSealedSpend > 0 ? `, dont ${formatEur(c.yearSealedSpend)} de scellés` : ""} · ${plural(activeMonths, "mois actif")}`
              : d.yearCards > 0
                ? `${plural(d.yearCards, "carte")} ajoutées sur 12 mois · saisis les prix d'achat pour suivre ton budget`
                : "Selon la date d'achat, sinon la date d'ajout."
          }
          className={c && sealed ? "lg:col-span-4" : "lg:col-span-8"}
        >
          {d.yearCards === 0 && yearSpend === 0 ? (
            <Empty>Aucun achat daté sur les 12 derniers mois.</Empty>
          ) : (
            <div className="flex flex-1 flex-col justify-end">
              <MonthlyBars months={months} metric={yearSpend > 0 ? "spend" : "cards"} height={176} />
              {yearSpend > 0 && <MonthFacts months={months} yearSpend={yearSpend} activeMonths={activeMonths} />}
            </div>
          )}
        </Panel>
        <Panel title="Par rareté" hint={d.value != null ? "Nombre de cartes et valeur estimée de chaque rareté." : undefined} className="lg:col-span-4">
          <div className="flex flex-1 flex-col justify-center">
            <Donut slices={d.raritySlices} label="Répartition par rareté" size="lg" />
            <TopSlice slices={d.raritySlices} total={d.value} noun="rareté" />
          </div>
        </Panel>
      </div>

      {/* ——— Les cartes qui montent, les sets en cours ——— */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {d.hasGain && (
          <Panel title="Meilleures plus-values" hint="Valeur estimée moins prix d'achat." href="/cartes?sort=gain" hrefLabel="Toutes" className="lg:col-span-7">
            {d.top.length === 0 ? (
              <Empty>Pas encore de plus-value.</Empty>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {d.top.map((i) => (
                  <RankTile key={i.id} item={i} />
                ))}
              </div>
            )}
          </Panel>
        )}
        <Panel title="Sets en cours" hint="Cartes distinctes possédées sur le total du set." href="/catalogue" hrefLabel="Extensions" className={d.hasGain ? "lg:col-span-5" : "lg:col-span-12"}>
          {d.sets.length === 0 ? (
            <Empty>Aucune carte pour l&apos;instant.</Empty>
          ) : (
            <>
              <div className="-mx-2.5 flex flex-col">
                {d.sets.slice(0, SETS_SHOWN).map((st) => (
                  <SetRow key={st.id} set={st} />
                ))}
              </div>
              {d.sets.length > SETS_SHOWN && (
                <details className="group -mx-2.5 mt-1">
                  <summary className="cursor-pointer list-none rounded-xl px-2.5 py-2 text-xs font-medium text-muted transition hover:bg-raised hover:text-foreground">
                    <span className="group-open:hidden">Voir les {d.sets.length - SETS_SHOWN} autres sets</span>
                    <span className="hidden group-open:inline">Réduire</span>
                  </summary>
                  <div className="flex flex-col">
                    {d.sets.slice(SETS_SHOWN).map((st) => (
                      <SetRow key={st.id} set={st} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* ——— Pertes, sources, suivi ——— */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {d.hasGain && (
          <Panel title="Moins bonnes plus-values" hint="Les cartes qui ont baissé depuis l'achat.">
            {d.flop.length === 0 ? (
              <Empty>Aucune carte en perte, tout est dans le vert.</Empty>
            ) : (
              <ul className="-mx-2.5 flex flex-col">
                {d.flop.map((i) => (
                  <RankRow key={i.id} item={i} />
                ))}
              </ul>
            )}
          </Panel>
        )}
        <Panel title="Dépenses par source" hint={d.sourcesCount > 0 ? `${formatEur(d.invested)} répartis sur ${plural(d.sourcesCount, "source")}` : undefined} href="/boutiques" hrefLabel="Boutiques">
          {d.sources.length === 0 ? (
            <Empty>Aucun prix d&apos;achat renseigné pour l&apos;instant.</Empty>
          ) : (
            <div className="-mx-2.5 flex flex-col">
              {d.sources.map((src) => (
                <BarRow key={src.key} label={src.label} value={`${formatEur(src.spent)} · ${pct(src.spent, d.invested)}%`} pct={maxSpent > 0 ? (src.spent / maxSpent) * 100 : 0} />
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Suivi des cartes">
          <div className="-mx-2.5 flex flex-col">
            <Fact icon={ClipboardList} label="À compléter" sub="Ajoutées sans état ni prix" value={String(d.toReview)} />
            <Fact icon={BadgeCheck} label="Gradées" sub="PSA, CGC…" value={String(d.graded)} />
            <Fact
              icon={Heart}
              label="Recherchées"
              sub={d.wishCount === 0 ? "Aucune carte recherchée" : d.wishCost != null ? `≈ ${formatEur(d.wishCost)} au cours du marché` : "Cote marché inconnue"}
              value={String(d.wishCount)}
              href="/recherchees"
            />
            <Fact
              icon={Tag}
              label="Ventes"
              sub={d.soldCount === 0 ? "Aucune vente" : `${plural(d.soldCount, "exemplaire")} vendu${d.soldCount > 1 ? "s" : ""}`}
              value={d.soldCount === 0 ? "0" : signed(d.realized)}
              tone={d.soldCount === 0 ? undefined : d.realized >= 0 ? "up" : "down"}
            />
          </div>
        </Panel>
      </div>

      {/* ——— État, langue ——— */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Par état">
          <Donut slices={d.conditionSlices} label="Répartition par état" />
        </Panel>
        <Panel title="Par langue">
          <Donut slices={d.languageSlices} label="Répartition par langue" />
        </Panel>
      </div>

      {/* ═══ Scellés ═══ */}
      {sealed && (
        <>
          <SectionTitle
            icon={Boxes}
            title="Scellés"
            hint={`${plural(sealed.count, "produit")} · ${sealed.value != null ? formatEur(sealed.value) : "cote inconnue"}${sealed.gain != null ? ` · ${signed(sealed.gain)}` : ""}`}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Panel title="Par type" hint={sealed.value != null ? `${formatEur(sealed.value)} au total, nombre et valeur par type.` : undefined}>
              <div className="flex flex-1 flex-col justify-center">
                <Donut slices={sealed.kindSlices} unit="produits" label="Scellés par type" size="lg" />
                <TopSlice slices={sealed.kindSlices} total={sealed.value} noun="type" />
              </div>
            </Panel>
            <Panel title="Par set" hint="Cote × quantité, du set le plus cher au moins cher.">
              {sealed.setValues.length === 0 ? (
                <Empty>Pas encore de cote.</Empty>
              ) : (
                <div className="-mx-2.5 flex flex-1 flex-col justify-center">
                  {sealed.setValues.slice(0, 6).map((k) => (
                    <BarRow
                      key={k.key}
                      label={`${k.label} · ${k.count}`}
                      value={sealed.value ? `${formatEur(k.value)} · ${pct(k.value, sealed.value)}%` : formatEur(k.value)}
                      pct={sealed.setValues[0].value > 0 ? (k.value / sealed.setValues[0].value) * 100 : 0}
                    />
                  ))}
                  {sealed.setValues.length > 6 && <p className="px-2.5 pt-2 text-[11px] text-muted">et {sealed.setValues.length - 6} autre{sealed.setValues.length - 6 > 1 ? "s" : ""} set{sealed.setValues.length - 6 > 1 ? "s" : ""}</p>}
                </div>
              )}
            </Panel>
            <Panel title="Cotes en mouvement" hint="Variation sur 7 jours, d'après le relevé quotidien.">
              {sealed.movers.length === 0 ? (
                <Empty>L&apos;historique se constitue nuit après nuit : les variations apparaîtront d&apos;ici quelques jours.</Empty>
              ) : (
                <ul className="-mx-2.5 flex flex-col">
                  {sealed.movers.map((r) => (
                    <SealedRow key={r.id} r={r} right={<Delta v={r.delta!} />} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Scellés les plus cotés" hint="Cote × quantité possédée." href="/scelles" hrefLabel="Scellés">
              {sealed.top.length === 0 ? (
                <Empty>Pas encore de cote.</Empty>
              ) : (
                <ul className="-mx-2.5 flex flex-col">
                  {sealed.top.map((r) => (
                    <SealedRow key={r.id} r={r} right={<span className="num text-sm font-semibold">{formatEur(r.value!)}</span>} />
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Plus-values scellés" hint="Cote moins prix d'achat, sur les lots au prix connu.">
              {sealed.gains.length === 0 ? (
                <Empty>Renseigne le prix d&apos;achat de tes scellés pour suivre leur plus-value.</Empty>
              ) : (
                <ul className="-mx-2.5 flex flex-col">
                  {sealed.gains.map((r) => (
                    <SealedRow key={r.id} r={r} right={<Gain v={r.gain} p={r.gainPct} />} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Sous les barres mensuelles : le mois le plus actif, la moyenne, ce mois-ci */
function MonthFacts({ months, yearSpend, activeMonths }: { months: MonthPoint[]; yearSpend: number; activeMonths: number }) {
  const best = months.reduce((b, m) => (m.spend > (b?.spend ?? 0) ? m : b), null as MonthPoint | null);
  const current = months.find((m) => m.current) ?? null;
  const facts: [string, string, string][] = [
    ["Meilleur mois", best && best.spend > 0 ? formatEur(best.spend) : "—", best && best.spend > 0 ? best.label : ""],
    ["Par mois actif", activeMonths > 0 ? formatEur(yearSpend / activeMonths) : "—", `sur ${plural(activeMonths, "mois")}`],
    ["Ce mois-ci", current && current.spend > 0 ? formatEur(current.spend) : "0 €", current ? plural(current.cards, "carte") : ""],
  ];
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ring pt-3">
      {facts.map(([k, v, sub]) => (
        <div key={k} className="min-w-0">
          <dt className="label-xs !text-[10px] truncate text-muted">{k}</dt>
          <dd className="num truncate text-sm font-semibold leading-tight">{v}</dd>
          {sub && <dd className="truncate text-[11px] text-faint">{sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** La tranche qui pèse le plus en valeur, avec sa part du total */
function TopSlice({ slices, total, noun }: { slices: Slice[]; total: number | null; noun: string }) {
  const withValue = slices.filter((x) => x.value != null && x.code !== "__rest__");
  if (!total || withValue.length === 0) return null;
  const top = withValue.reduce((b, x) => (x.value! > (b?.value ?? 0) ? x : b), null as Slice | null);
  if (!top || !top.value) return null;
  return (
    <p className="mt-4 border-t border-ring pt-3 text-xs text-muted">
      {noun === "type" ? "Le type" : "La rareté"} qui pèse le plus : <span className="font-medium text-foreground">{top.label}</span> ·{" "}
      <span className="num text-foreground">{formatEur(top.value)}</span> · <span className="num">{Math.round((top.value / total) * 100)} %</span> de la valeur
      {top.count > 0 && <> · <span className="num">{formatEur(top.value / top.count)}</span> par {noun === "type" ? "produit" : "carte"}</>}
    </p>
  );
}

/** Part de la valeur : une seule barre, cartes à gauche, scellés à droite */
function ShareBar({ a, b }: { a: number; b: number }) {
  const sum = a + b;
  const pa = sum > 0 ? Math.round((a / sum) * 100) : 50;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden>
        <span className="bg-accent" style={{ width: `${pa}%` }} />
        <span className="bg-sealed" style={{ width: `${100 - pa}%` }} />
      </div>
      <p className="num mt-1.5 flex justify-between text-[11px] text-muted">
        <span>Cartes {pa} % de la valeur</span>
        <span>Scellés {100 - pa} %</span>
      </p>
    </div>
  );
}

/** Une colonne du comparatif : pastille, nom cliquable, sous-titre, puis ses chiffres */
function SideCol({ tone, label, sub, href, rows }: { tone: "accent" | "sealed"; label: string; sub: string; href: string; rows: [string, React.ReactNode][] }) {
  return (
    <div className="min-w-0 first:pr-4 last:pl-4">
      <Link href={href} className="flex items-center gap-1.5 font-semibold underline-offset-4 hover:text-accent-strong hover:underline">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone === "accent" ? "bg-accent" : "bg-sealed"}`} aria-hidden />
        {label}
      </Link>
      <p className="truncate text-[11px] text-muted">{sub}</p>
      <dl className="mt-3 flex flex-col gap-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="label-xs !text-[10px] text-muted">{k}</dt>
            <dd className="num truncate text-sm font-semibold leading-tight">{v ?? <span className="font-normal text-faint">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Montant signé coloré, pourcentage discret à côté */
function Gain({ v, p }: { v: number | null; p?: number | null }) {
  if (v == null) return <span className="text-muted">—</span>;
  return (
    <span className={`num text-sm font-semibold ${v > 0 ? "text-gain" : v < 0 ? "text-loss" : ""}`}>
      {signed(v)}
      {p != null && <span className="ml-1 text-xs font-normal text-muted">{signedPct(p)}</span>}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="display flex items-center gap-2 text-lg font-semibold">
        <Icon size={16} strokeWidth={1.9} className="text-accent-strong" aria-hidden />
        {title}
      </h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function Delta({ v }: { v: number }) {
  return (
    <span className={`num text-sm font-semibold ${v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-muted"}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1).replace(".", ",")} %
    </span>
  );
}

/** Ligne d'un classement scellé : visuel, nom, type · extension, valeur à droite */
function SealedRow({ r, right }: { r: SealedRank; right: React.ReactNode }) {
  return (
    <li>
      <Link href={`/scelles/produit/${r.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-raised">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
          {r.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <Boxes size={18} className="text-neutral-400" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.name}</span>
          <span className="block truncate text-xs text-muted">
            {kindLabel(r.kind)} · {r.set}
            {r.quantity > 1 ? ` · × ${r.quantity}` : ""}
          </span>
        </span>
        <span className="shrink-0">{right}</span>
      </Link>
    </li>
  );
}

function SetRow({ set }: { set: SetStat }) {
  const complete = set.pct != null && set.pct >= 100;
  const value =
    set.total != null ? (
      <>
        {set.owned} / {set.total}
        {complete ? <span className="ml-1.5 font-semibold text-gain">Complet</span> : ` · ${Math.round(set.pct ?? 0)}%`}
      </>
    ) : (
      plural(set.cards, "carte")
    );
  // Les cartes hors catalogue vivent sur /extensions/perso ; un set inconnu n'a pas de page
  const href = set.id === "custom" ? "/extensions/perso" : set.id === "?" ? undefined : `/extensions/${set.id}`;
  return <BarRow label={set.name} value={value} pct={set.pct ?? 0} href={href} tone={complete ? "gain" : "accent"} />;
}
