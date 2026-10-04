import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import type { QuickInfo } from "@/app/catalogue/actions";
import { CardImage } from "@/components/card-image";
import { Sparkline } from "@/components/sparkline";
import { formatEur } from "@/lib/domain";
import { rarityLabel, raritySymbol } from "@/lib/rarity";

export type SpotlightCard = {
  name: string;
  /** Base TCGdex (ou URL finale avec `direct`) ; null = pas de visuel */
  image: string | null;
  direct?: boolean;
  fallback?: string | null;
  setName: string;
  localId?: string | null;
  /** Total du set, pour « 002 / 132 » */
  total?: number | null;
  /** Rareté brute ; null = inconnue ; absente = sans objet (pas de ligne) */
  rarity?: string | null;
  /** Langue affichée à côté du nom (JP, EN…) ; rien pour le français */
  lang?: string | null;
};

export type SpotlightFact = { label: string; value: ReactNode };

/**
 * Fiche express d'une carte, la même partout (page d'un set, résultats du
 * catalogue, scan, classeurs) : le visuel sur un fond teinté par la carte,
 * l'identité, la cote Cardmarket avec son mouvement, ce que tu en as déjà,
 * puis les actions. `layout="auto"` : empilé sur mobile, visuel à gauche dès
 * sm ; `stack` : toujours empilé (colonne étroite).
 */
export function CardSpotlight({
  card,
  price,
  cmUrl,
  kicker,
  facts = [],
  actions,
  secondary,
  layout = "auto",
  imageSlot,
  wish,
  inDialog = false,
  info,
  owned,
  setProgress,
  priceSource = "cardmarket",
}: {
  card: SpotlightCard;
  /** Cote Cardmarket : montant, null = indisponible, "loading" ; absente = pas de ligne */
  price?: number | null | "loading";
  cmUrl?: string | null;
  /** Ligne de contexte au-dessus du nom (statut, provenance) */
  kicker?: ReactNode;
  facts?: SpotlightFact[];
  /** Action principale (bouton pleine largeur) */
  actions?: ReactNode;
  /** Actions secondaires, sur une rangée avec l'étoile « Je la cherche » */
  secondary?: ReactNode;
  layout?: "auto" | "stack";
  /** Visuel sur mesure à la place de l'image (carte Pokédex…) */
  imageSlot?: ReactNode;
  /** Étoile « recherchée » */
  wish?: { on: boolean; pending?: boolean; toggle: () => void };
  /** Dans une Sheet sans en-tête : fond teinté bord à bord, place pour la croix */
  inDialog?: boolean;
  /** Marché, historique et détails chargés après coup (`quickInfo`) */
  info?: QuickInfo | "loading" | null;
  /** Exemplaires déjà possédés */
  owned?: number;
  /** Avancement du set de la carte */
  setProgress?: { owned: number; total: number | null; href?: string };
  /** Origine de la cote : Cardmarket, ou TCGplayer japonais converti (carte japonaise sans cote Cardmarket) */
  priceSource?: "cardmarket" | "tcgplayer";
}) {
  const side = layout === "auto";
  const loaded = info && info !== "loading" ? info : null;
  const rawRarity = card.rarity !== undefined ? card.rarity : loaded ? loaded.rarity : undefined;
  const rarity = rawRarity === undefined ? undefined : rawRarity ? rarityLabel(rawRarity) : null;
  const symbol = rarity ? raritySymbol(rarity) : null;
  const total = card.total ?? loaded?.total ?? null;
  const number = card.localId ? `${card.localId}${total && !card.localId.includes("/") ? ` / ${total}` : ""}` : null;
  const cote = price !== undefined ? price : info === "loading" ? "loading" : loaded ? loaded.price : undefined;
  const link = cmUrl ?? loaded?.cmUrl ?? null;
  const series = loaded?.series ?? [];
  const delta = series.length > 1 && series[0] > 0 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;
  const showCote = cote !== undefined || link != null;
  const showMine = owned !== undefined || setProgress != null;
  const pct = setProgress?.total ? Math.round((setProgress.owned / setProgress.total) * 100) : null;

  const image = imageSlot ?? <CardImage base={card.image} alt={card.name} direct={card.direct} fallback={card.fallback} quality="high" />;

  return (
    <div className={inDialog ? "-mx-5 -mt-4 sm:-mt-5" : ""}>
      {/* ——— Visuel et identité, sur un fond teinté par la carte ——— */}
      <div className={`relative ${inDialog ? "overflow-hidden rounded-t-2xl" : ""}`}>
        {inDialog && card.image && !imageSlot && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <CardImage base={card.image} alt="" direct={card.direct} fallback={card.fallback} quality="low" className="h-full w-full scale-150 object-cover opacity-40 blur-3xl saturate-150" />
            <div className="absolute inset-0 bg-gradient-to-b from-surface/10 via-surface/65 to-surface" />
          </div>
        )}
        <div className={`relative ${inDialog ? "px-5 pb-2 pt-7 sm:pt-6" : ""} ${side ? "sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-6" : ""}`}>
          <figure className={`relative mx-auto w-[min(56vw,200px)] ${side ? "sm:w-auto" : ""}`}>
            {!inDialog && card.image && !imageSlot && (
              <div aria-hidden className="pointer-events-none absolute -inset-x-5 -inset-y-3 -z-10 overflow-hidden rounded-[45%] opacity-55 blur-2xl saturate-[1.4]">
                <CardImage base={card.image} alt="" direct={card.direct} fallback={card.fallback} quality="low" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="card-tile aspect-[63/88] !shadow-[0_18px_40px_rgba(0,0,0,0.45)]">{image}</div>
          </figure>

          <div className={`mt-5 min-w-0 ${side ? "sm:mt-0" : ""} ${inDialog ? "sm:pr-8" : ""}`}>
            {kicker && <p className="label-xs mb-1.5 flex items-center gap-1.5 text-accent-strong">{kicker}</p>}
            <h2 className="display text-2xl font-bold leading-[1.1] tracking-tight">
              {card.name}
              {card.lang && <span className="ml-2 inline-block rounded-md bg-raised px-1.5 py-0.5 align-middle text-[11px] font-semibold tracking-wide text-muted">{card.lang}</span>}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm text-muted">
              <span>{card.setName}</span>
              {number && <span className="num whitespace-nowrap">· {number}</span>}
              {rarity !== undefined && (
                <span className="whitespace-nowrap">
                  ·{" "}
                  {rarity ? (
                    <>
                      {symbol && (
                        <span className="text-accent-strong" aria-hidden>
                          {symbol}{" "}
                        </span>
                      )}
                      {rarity}
                    </>
                  ) : (
                    <span className="text-faint">rareté inconnue</span>
                  )}
                </span>
              )}
            </p>
            {loaded && (loaded.illustrator || loaded.hp) && (
              <p className="mt-1 truncate text-xs text-faint">
                {loaded.illustrator && <>Illustration {loaded.illustrator}</>}
                {loaded.illustrator && loaded.hp ? " · " : ""}
                {loaded.hp && <span className="num">{loaded.hp} PV</span>}
              </p>
            )}
            {facts.length > 0 && (
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {facts.map((f) => (
                  <div key={f.label} className="flex items-baseline gap-1.5">
                    <dt className="label-xs !text-[10px] text-muted">{f.label}</dt>
                    <dd className="font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {showCote && (
              <div className="mt-4 rounded-2xl bg-background/60 px-3.5 py-3 ring-1 ring-ring">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="label-xs !text-[10px] text-muted">{priceSource === "tcgplayer" ? "Cote TCGplayer (JP)" : "Cote Cardmarket"}</p>
                  {delta != null && (
                    <span className={`num text-[11px] font-semibold ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-muted"}`}>
                      {delta > 0 ? "+" : ""}
                      {Math.round(delta)} % · 30 j
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <p className="display num text-2xl font-bold leading-tight">
                    {cote === "loading" ? <span className="text-base font-normal text-faint">Relevé…</span> : cote == null ? <span className="text-base font-normal text-faint">Indisponible</span> : `${priceSource === "tcgplayer" ? "≈ " : ""}${formatEur(cote)}`}
                  </p>
                  {series.length > 1 && <Sparkline values={series} className="h-7 w-24 shrink-0" />}
                </div>
                {(loaded?.market || link) && (
                  <p className="num mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
                    {loaded?.market?.trend != null && <span>tendance {formatEur(loaded.market.trend)}</span>}
                    {loaded?.market?.avg30 != null && <span>30 j {formatEur(loaded.market.avg30)}</span>}
                    {loaded?.market?.low != null && <span>dès {formatEur(loaded.market.low)}</span>}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-0.5 font-sans text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                        {priceSource === "tcgplayer" ? "TCGplayer" : "Cardmarket"} <ArrowUpRight size={11} aria-hidden />
                      </a>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={inDialog ? "px-5 pt-2" : "mt-4"}>
        {/* ——— Ce que tu en as déjà ——— */}
        {showMine && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-raised/50 px-3.5 py-2.5 text-sm ring-1 ring-ring">
            {owned !== undefined && (
              <span className="flex items-center gap-2">
                <span className="label-xs !text-[10px] text-muted">Ma collection</span>
                {owned > 0 ? (
                  <span className="num font-semibold text-gain">
                    ✓ ×{owned}
                  </span>
                ) : (
                  <span className="text-muted">pas encore</span>
                )}
              </span>
            )}
            {setProgress && (
              <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
                <span className="label-xs !text-[10px] shrink-0 text-muted">Set</span>
                <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(setProgress.owned > 0 ? 2 : 0, pct ?? 0)}%` }} />
                </span>
                <span className="num shrink-0 text-xs">
                  {setProgress.owned}
                  {setProgress.total ? ` / ${setProgress.total}` : ""}
                  {pct != null && <span className="text-muted"> · {pct} %</span>}
                </span>
                {setProgress.href && (
                  <Link href={setProgress.href} className="shrink-0 text-xs text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                    Voir l’extension
                  </Link>
                )}
              </span>
            )}
          </div>
        )}

        {/* ——— Actions ——— */}
        {(actions || wish || secondary) && (
          <div className="mt-3 flex flex-col gap-2">
            {actions}
            {(wish || secondary) && (
              <div className="flex flex-wrap gap-2">
                {wish && (
                  <button
                    type="button"
                    onClick={wish.toggle}
                    disabled={wish.pending}
                    aria-pressed={wish.on}
                    className={`btn flex-1 ${wish.on ? "bg-accent-soft text-accent-strong ring-1 ring-accent" : "btn-ghost"} ${wish.pending ? "opacity-60" : ""}`}
                  >
                    <Star size={15} fill={wish.on ? "currentColor" : "none"} aria-hidden />
                    {wish.on ? "Recherchée" : "Je la cherche"}
                  </button>
                )}
                {secondary}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
