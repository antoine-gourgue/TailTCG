import {
  Award,
  BadgeCheck,
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
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatEur } from "@/lib/domain";
import { ValueHistoryChart, type ValuePoint } from "@/components/value-history-chart";
import {
  BarRow,
  Donut,
  Empty,
  Fact,
  MonthlyBars,
  Panel,
  RankRow,
  StatTile,
  type MonthPoint,
  type RankItem,
  type Slice,
} from "@/components/stats-widgets";

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
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const SETS_SHOWN = 8;

/** Contenu de la page Statistiques (données déjà calculées côté serveur) */
export function StatsView({ d }: { d: StatsData }) {
  const maxSpent = d.sources[0]?.spent ?? 0;
  return (
    <div className="flex flex-col gap-5">
      {/* ——— Chiffres clés ——— */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Layers}
          label="Cartes"
          value={String(d.count)}
          sub={`${plural(d.unique, "unique")} · ${
            d.completeSets > 0 ? `${plural(d.completeSets, "set")} complet${d.completeSets > 1 ? "s" : ""}` : plural(d.sets.length, "set")
          }`}
        />
        <StatTile
          icon={Wallet}
          label="Investi"
          value={formatEur(d.invested)}
          sub={
            d.pricedCount === 0
              ? "Aucun prix d'achat saisi"
              : `${formatEur(d.invested / d.pricedCount)} par carte · ${pct(d.pricedCount, d.count)}% renseignées`
          }
        />
        <StatTile
          icon={Coins}
          label="Valeur estimée"
          value={formatEur(d.value)}
          sub={
            d.value != null
              ? `${pct(d.valuedCount, d.count)}% des cartes valorisées`
              : "Saisis une valeur sur tes fiches"
          }
        />
        <StatTile
          icon={d.gain != null && d.gain < 0 ? TrendingDown : TrendingUp}
          label="Plus-value"
          value={d.gain == null ? "—" : signed(d.gain)}
          tone={d.gain == null ? undefined : d.gain >= 0 ? "up" : "down"}
          sub={
            d.gain == null
              ? "Latente, hors ventes"
              : `${d.gainPct != null ? `${d.gainPct > 0 ? "+" : ""}${Math.round(d.gainPct)}%` : "—"}${
                  d.monthDelta != null ? ` · ${signed(d.monthDelta)} sur 30 j` : ""
                }`
          }
        />
      </div>

      {/* ——— Courbe + vue d'ensemble ——— */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          icon={LineChart}
          title="Évolution de la valeur"
          hint="Construite à partir de tes actualisations datées, carte par carte."
        >
          {d.valueSeries.length > 0 ? (
            <Scrollable>
              <ValueHistoryChart points={d.valueSeries} />
            </Scrollable>
          ) : (
            <Empty>
              Actualise la valeur estimée de tes cartes depuis leur fiche : la courbe se dessinera
              ici.
            </Empty>
          )}
        </Panel>

        <Panel icon={ListChecks} title="Vue d'ensemble">
          <div className="-mx-2.5 flex flex-col">
            <Fact
              icon={ClipboardList}
              label="À compléter"
              sub="Ajoutées sans état ni prix"
              value={String(d.toReview)}
            />
            <Fact icon={BadgeCheck} label="Gradées" sub="PSA, CGC…" value={String(d.graded)} />
            <Fact
              icon={Heart}
              label="Wishlist"
              sub={
                d.wishCount === 0
                  ? "Aucune carte recherchée"
                  : d.wishCost != null
                    ? `≈ ${formatEur(d.wishCost)} au cours du marché`
                    : "Cote marché inconnue"
              }
              value={String(d.wishCount)}
              href="/wishlist"
            />
            <Fact
              icon={Tag}
              label="Ventes"
              sub={
                d.soldCount === 0
                  ? "Aucune vente"
                  : `${plural(d.soldCount, "exemplaire")} vendu${d.soldCount > 1 ? "s" : ""}`
              }
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
          d.yearSpend > 0
            ? `${formatEur(d.yearSpend)} et ${plural(d.yearCards, "carte")} sur 12 mois · ${formatEur(
                d.yearSpend / Math.max(d.activeMonths, 1)
              )} par mois actif`
            : d.yearCards > 0
              ? `${plural(d.yearCards, "carte")} ajoutées sur 12 mois · saisis les prix d'achat pour suivre ton budget`
              : "Selon la date d'achat, sinon la date d'ajout."
        }
      >
        {d.yearCards === 0 ? (
          <Empty>Aucune carte datée sur les 12 derniers mois.</Empty>
        ) : (
          <Scrollable>
            <MonthlyBars months={d.months} metric={d.yearSpend > 0 ? "spend" : "cards"} />
          </Scrollable>
        )}
      </Panel>

      {/* ——— Sets + sources ——— */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          icon={Award}
          title="Progression par set"
          hint="Cartes distinctes possédées sur le total du set."
        >
          <div className="-mx-2.5 flex flex-col">
            {d.sets.slice(0, SETS_SHOWN).map((s) => (
              <SetRow key={s.id} set={s} />
            ))}
          </div>
          {d.sets.length > SETS_SHOWN && (
            <details className="group -mx-2.5 mt-1">
              <summary className="cursor-pointer list-none rounded-xl px-2.5 py-2 text-xs font-medium text-muted transition hover:bg-raised hover:text-foreground">
                <span className="group-open:hidden">
                  Voir les {d.sets.length - SETS_SHOWN} autres sets
                </span>
                <span className="hidden group-open:inline">Réduire</span>
              </summary>
              <div className="flex flex-col">
                {d.sets.slice(SETS_SHOWN).map((s) => (
                  <SetRow key={s.id} set={s} />
                ))}
              </div>
            </details>
          )}
        </Panel>

        <Panel
          icon={ShoppingBag}
          title="Dépenses par source"
          hint={
            d.sourcesCount > 0
              ? `${formatEur(d.invested)} répartis sur ${plural(d.sourcesCount, "source")}`
              : undefined
          }
        >
          {d.sources.length === 0 ? (
            <Empty>Aucun prix d&apos;achat renseigné pour l&apos;instant.</Empty>
          ) : (
            <div className="-mx-2.5 flex flex-col">
              {d.sources.map((s) => (
                <BarRow
                  key={s.key}
                  label={s.label}
                  value={`${formatEur(s.spent)} · ${pct(s.spent, d.invested)}%`}
                  pct={maxSpent > 0 ? (s.spent / maxSpent) * 100 : 0}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ——— Répartitions ——— */}
      <div className="grid gap-5 md:grid-cols-3">
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

      {/* ——— Classements ——— */}
      {d.hasGain && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            icon={TrendingUp}
            title="Meilleures plus-values"
            hint="Valeur estimée moins prix d'achat."
          >
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
    </div>
  );
}

/** Sur mobile, les graphiques gardent une largeur lisible et défilent */
function Scrollable({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
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
        {complete ? (
          <span className="ml-1.5 font-semibold text-gain">Complet</span>
        ) : (
          ` · ${Math.round(set.pct ?? 0)}%`
        )}
      </>
    ) : (
      plural(set.cards, "carte")
    );
  // Les cartes hors catalogue vivent sur /extensions/perso ; un set inconnu
  // n'a pas de page
  const href =
    set.id === "custom" ? "/extensions/perso" : set.id === "?" ? undefined : `/extensions/${set.id}`;
  return (
    <BarRow
      label={set.name}
      value={value}
      pct={set.pct ?? 0}
      href={href}
      tone={complete ? "gain" : "accent"}
    />
  );
}
