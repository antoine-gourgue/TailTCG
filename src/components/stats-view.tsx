import Link from "next/link";
import {
  Award,
  BadgeCheck,
  Boxes,
  CalendarDays,
  ClipboardList,
  Coins,
  Heart,
  Languages,
  Layers,
  LineChart,
  ListChecks,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  Activity,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { formatEur } from "@/lib/domain";
import { kindLabel } from "@/lib/sealed";
import { combineStats, type SealedRank, type SealedStats } from "@/lib/stats-data";
import { ValueHistoryChart, type ValuePoint } from "@/components/value-history-chart";
import { BarRow, Empty, Fact, Panel, RankRow, StatTile, type MonthPoint, type RankItem, type Slice } from "@/components/stats-widgets";
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
  typeSlices: Slice[];
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
const SETS_SHOWN = 8;

/**
 * Tableau de bord : cartes seules, ou cartes + scellés (`s` fourni) — le haut
 * devient alors global (3 chiffres, comparatif cartes / scellés, courbe et
 * achats en couches) et une section Scellés s'ajoute en bas.
 */
export function StatsView({ d, s }: { d: StatsData; s?: SealedStats }) {
  const maxSpent = d.sources[0]?.spent ?? 0;
  const sealed = s && s.count > 0 ? s : null;
  const c = sealed ? combineStats(d, sealed) : null;
  const months = c ? c.months : d.months;
  const yearSpend = c ? c.yearSpend : d.yearSpend;
  const activeMonths = c ? c.activeMonths : d.activeMonths;

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Chiffres clés ——— */}
      {c && sealed ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon={Coins}
            label="Valeur estimée"
            value={formatEur(c.value)}
            sub={c.value == null ? "Aucune cote ni valeur saisie" : c.monthDelta != null ? `${signed(c.monthDelta)} sur 30 jours` : `${plural(c.count, "objet")}, cartes et scellés`}
          />
          <StatTile
            icon={Store}
            label="Valeur Cardmarket"
            value={formatEur(c.market)}
            sub={d.market == null ? "Aucune carte cotée · scellés à la cote" : `${d.marketCount} carte${d.marketCount > 1 ? "s" : ""} sur ${d.count} cotée${d.marketCount > 1 ? "s" : ""} · scellés à la cote`}
          />
          <StatTile icon={Wallet} label="Investi" value={formatEur(c.invested)} sub={c.pricedCount === 0 ? "Aucun prix d'achat saisi" : `${plural(c.pricedCount, "objet")} au prix d'achat connu`} />
          <StatTile
            icon={c.gain != null && c.gain < 0 ? TrendingDown : TrendingUp}
            label="Plus-value"
            value={c.gain == null ? "—" : signed(c.gain)}
            tone={c.gain == null ? undefined : c.gain >= 0 ? "up" : "down"}
            sub={c.gain == null ? "Latente, hors ventes" : `${c.gainPct != null ? signedPct(c.gainPct) : "—"} · latente, hors ventes`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon={Layers}
            label="Cartes"
            value={String(d.count)}
            sub={`${plural(d.unique, "unique")} · ${d.completeSets > 0 ? `${plural(d.completeSets, "set")} complet${d.completeSets > 1 ? "s" : ""}` : plural(d.sets.length, "set")}`}
          />
          <StatTile
            icon={Wallet}
            label="Investi"
            value={formatEur(d.invested)}
            sub={d.pricedCount === 0 ? "Aucun prix d'achat saisi" : `${formatEur(d.invested / d.pricedCount)} par carte · ${pct(d.pricedCount, d.count)}% renseignées`}
          />
          <StatTile
            icon={Coins}
            label="Valeur estimée"
            value={formatEur(d.value)}
            sub={
              d.value != null
                ? `${d.market != null ? `Cardmarket ${formatEur(d.market)} · ` : ""}${pct(d.valuedCount, d.count)}% des cartes valorisées`
                : d.market != null
                  ? `Cardmarket ${formatEur(d.market)} · saisis une valeur sur tes fiches`
                  : "Saisis une valeur sur tes fiches"
            }
          />
          <StatTile
            icon={d.gain != null && d.gain < 0 ? TrendingDown : TrendingUp}
            label="Plus-value"
            value={d.gain == null ? "—" : signed(d.gain)}
            tone={d.gain == null ? undefined : d.gain >= 0 ? "up" : "down"}
            sub={d.gain == null ? "Latente, hors ventes" : `${d.gainPct != null ? signedPct(d.gainPct) : "—"}${d.monthDelta != null ? ` · ${signed(d.monthDelta)} sur 30 j` : ""}`}
          />
        </div>
      )}

      {/* ——— Cartes vs scellés ——— */}
      {c && sealed && (
        <Panel icon={Layers} title="Cartes et scellés" hint="Ce que pèse chaque partie de la collection.">
          {c.cardsShare != null && (
            <div className="mb-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
                  Cartes <span className="num text-muted">{Math.round(c.cardsShare)} %</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="num text-muted">{100 - Math.round(c.cardsShare)} %</span> Scellés
                  <span className="h-2.5 w-2.5 rounded-sm bg-sealed" aria-hidden />
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`Cartes ${Math.round(c.cardsShare)} % de la valeur, scellés ${100 - Math.round(c.cardsShare)} %`}>
                <span className="bg-accent" style={{ width: `${c.cardsShare}%` }} />
                <span className="flex-1 bg-sealed" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 text-sm">
            <div className="col-span-3 grid grid-cols-subgrid items-end pb-2">
              <span />
              <ColHead tone="accent" label="Cartes" sub={`${plural(d.count, "carte")} · ${plural(d.sets.length, "set")}`} href="/" />
              <ColHead tone="sealed" label="Scellés" sub={`${plural(sealed.count, "produit")} · ${plural(sealed.unique, "référence")}`} href="/scelles" />
            </div>
            <CompareRow label="Valeur" a={formatEur(d.value)} b={formatEur(sealed.value)} />
            <CompareRow
              label="Cardmarket"
              a={d.market != null ? `${formatEur(d.market)}` : <span className="text-muted">—</span>}
              b={
                sealed.value != null ? (
                  <>
                    {formatEur(sealed.value)} <span className="text-xs font-normal text-muted">= cote</span>
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )
              }
            />
            <CompareRow label="Investi" a={formatEur(d.invested)} b={formatEur(sealed.invested)} />
            <CompareRow label="Plus-value" a={<Gain v={d.gain} p={d.gainPct} />} b={<Gain v={sealed.gain} p={sealed.gainPct} />} />
            <CompareRow
              label="Sur 30 jours"
              a={c.cardsMonthDelta != null ? <Gain v={c.cardsMonthDelta} /> : <span className="text-xs font-normal text-faint">Historique trop court</span>}
              b={c.sealedMonthDelta != null ? <Gain v={c.sealedMonthDelta} /> : <span className="text-xs font-normal text-faint">Relevé en cours</span>}
            />
          </div>
        </Panel>
      )}

      {/* ——— Courbe + suivi ——— */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          icon={LineChart}
          title="Évolution de la valeur"
          hint={
            c && sealed
              ? `Cartes et scellés empilés, total en trait plein.${c.sealedStart ? ` Cote des scellés relevée chaque nuit depuis le ${shortDate(c.sealedStart)}.` : ""}`
              : "Construite à partir de tes actualisations datées, carte par carte."
          }
        >
          {(c ? c.valueSeries : d.valueSeries).length > 0 ? (
            <Scrollable>
              {c && sealed ? (
                <ValueHistoryChart
                  points={c.valueSeries}
                  layers={[
                    { label: "Cartes", points: d.valueSeries },
                    { label: "Scellés", points: sealed.series },
                  ]}
                />
              ) : (
                <ValueHistoryChart points={d.valueSeries} />
              )}
            </Scrollable>
          ) : (
            <Empty>Actualise la valeur estimée de tes cartes depuis leur fiche : la courbe se dessinera ici.</Empty>
          )}
        </Panel>

        <Panel icon={ListChecks} title={sealed ? "Suivi des cartes" : "Vue d'ensemble"}>
          <div className="-mx-2.5 flex flex-col">
            <Fact icon={ClipboardList} label="À compléter" sub="Ajoutées sans état ni prix" value={String(d.toReview)} />
            <Fact icon={BadgeCheck} label="Gradées" sub="PSA, CGC…" value={String(d.graded)} />
            <Fact
              icon={Heart}
              label="Wishlist"
              sub={d.wishCount === 0 ? "Aucune carte recherchée" : d.wishCost != null ? `≈ ${formatEur(d.wishCost)} au cours du marché` : "Cote marché inconnue"}
              value={String(d.wishCount)}
              href="/wishlist"
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

      {/* ——— Achats par mois ——— */}
      <Panel
        icon={CalendarDays}
        title="Achats par mois"
        hint={
          yearSpend > 0
            ? `${formatEur(yearSpend)} sur 12 mois${c && c.yearSealedSpend > 0 ? `, dont ${formatEur(c.yearSealedSpend)} de scellés` : ""} · ${plural(d.yearCards, "carte")} · ${formatEur(yearSpend / Math.max(activeMonths, 1))} par mois actif`
            : d.yearCards > 0
              ? `${plural(d.yearCards, "carte")} ajoutées sur 12 mois · saisis les prix d'achat pour suivre ton budget`
              : "Selon la date d'achat, sinon la date d'ajout."
        }
      >
        {d.yearCards === 0 && yearSpend === 0 ? (
          <Empty>Aucun achat daté sur les 12 derniers mois.</Empty>
        ) : (
          <Scrollable>
            <MonthlyBars months={months} metric={yearSpend > 0 ? "spend" : "cards"} />
          </Scrollable>
        )}
      </Panel>

      {/* ═══ Cartes ═══ */}
      {sealed && <SectionTitle icon={Layers} title="Cartes" hint={`${plural(d.count, "carte")} · ${plural(d.unique, "unique")}`} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel icon={Award} title="Progression par set" hint="Cartes distinctes possédées sur le total du set.">
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

        <Panel icon={ShoppingBag} title="Dépenses par source" hint={d.sourcesCount > 0 ? `${formatEur(d.invested)} répartis sur ${plural(d.sourcesCount, "source")}` : undefined}>
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
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Panel icon={Sparkles} title="Par état">
          <Donut slices={d.conditionSlices} label="Répartition par état" />
        </Panel>
        <Panel icon={Languages} title="Par langue">
          <Donut slices={d.languageSlices} label="Répartition par langue" />
        </Panel>
        <Panel icon={Tag} title="Par type">
          <Donut slices={d.typeSlices} label="Répartition par type" />
        </Panel>
      </div>

      {d.hasGain && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel icon={TrendingUp} title="Meilleures plus-values" hint="Valeur estimée moins prix d'achat.">
            <ul className="-mx-2.5 flex flex-col">
              {d.top.map((i) => (
                <RankRow key={i.id} item={i} />
              ))}
            </ul>
          </Panel>
          <Panel icon={TrendingDown} title="Moins bonnes plus-values">
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
        </div>
      )}

      {/* ═══ Scellés ═══ */}
      {sealed && (
        <>
          <SectionTitle
            icon={Boxes}
            title="Scellés"
            hint={`${plural(sealed.count, "produit")} · ${sealed.value != null ? formatEur(sealed.value) : "cote inconnue"}${sealed.gain != null ? ` · ${signed(sealed.gain)}` : ""}`}
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel icon={Boxes} title="Par type">
              <Donut slices={sealed.kindSlices} unit="produits" label="Scellés par type" />
            </Panel>
            <Panel icon={Coins} title="Valeur par type" hint={sealed.value != null ? `${formatEur(sealed.value)} au total` : undefined}>
              {sealed.kindValues.length === 0 ? (
                <Empty>Pas encore de cote.</Empty>
              ) : (
                <div className="-mx-2.5 flex flex-col">
                  {sealed.kindValues.map((k) => (
                    <BarRow
                      key={k.key}
                      label={`${k.label} · ${k.count}`}
                      value={`${formatEur(k.value)} · ${pct(k.value, sealed.value ?? 0)}%`}
                      pct={sealed.kindValues[0].value > 0 ? (k.value / sealed.kindValues[0].value) * 100 : 0}
                    />
                  ))}
                </div>
              )}
            </Panel>
            <Panel icon={Activity} title="Cotes en mouvement" hint="Variation sur 7 jours, d'après le relevé quotidien.">
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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel icon={Coins} title="Scellés les plus cotés" hint="Cote × quantité possédée.">
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
            <Panel icon={TrendingUp} title="Plus-values scellés" hint="Cote moins prix d'achat, sur les lots au prix connu.">
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

/** En-tête de colonne du comparatif : pastille de couleur, nom cliquable, sous-titre */
function ColHead({ tone, label, sub, href }: { tone: "accent" | "sealed"; label: string; sub: string; href: string }) {
  return (
    <div className="min-w-0">
      <Link href={href} className="group flex items-center gap-1.5 font-semibold hover:text-accent-strong">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${tone === "accent" ? "bg-accent" : "bg-sealed"}`} aria-hidden />
        {label}
        <ArrowRight size={13} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent-strong" aria-hidden />
      </Link>
      <p className="truncate text-xs text-muted">{sub}</p>
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className="col-span-3 grid grid-cols-subgrid items-center border-t border-edge py-2.5">
      <span className="label-xs text-faint">{label}</span>
      <span className="num font-semibold">{a}</span>
      <span className="num font-semibold">{b}</span>
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

/** Sur mobile, les graphiques gardent une largeur lisible et défilent */
function Scrollable({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 min-w-0 overflow-x-auto px-1 sm:overflow-visible">
      <div className="min-w-[540px] sm:min-w-0">{children}</div>
    </div>
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
