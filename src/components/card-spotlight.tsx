import type { ReactNode } from "react";
import { ArrowUpRight, Star } from "lucide-react";
import { CardImage } from "@/components/card-image";
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

type Cell = { key: string; label: string; value: ReactNode; href?: string };

/**
 * Fiche express d'une carte, la même partout (page d'un set, scan, ajout,
 * classeurs) : le visuel mis en lumière par un halo tiré de la carte, le nom
 * en grand, puis des faits nets (rareté, cote Cardmarket, …) et les actions.
 * `layout="auto"` : empilé sur mobile, visuel à gauche dès sm ; `stack` :
 * toujours empilé (colonne étroite).
 */
export function CardSpotlight({
  card,
  price,
  cmUrl,
  kicker,
  facts = [],
  actions,
  layout = "auto",
  imageSlot,
  wish,
  inDialog = false,
}: {
  card: SpotlightCard;
  /** Cote Cardmarket : montant, null = indisponible, "loading" ; absente = pas de ligne */
  price?: number | null | "loading";
  cmUrl?: string | null;
  /** Ligne de contexte au-dessus du nom (statut, provenance) */
  kicker?: ReactNode;
  facts?: SpotlightFact[];
  actions?: ReactNode;
  layout?: "auto" | "stack";
  /** Visuel sur mesure à la place de l'image (carte Pokédex…) */
  imageSlot?: ReactNode;
  /** Étoile « recherchée » */
  wish?: { on: boolean; pending?: boolean; toggle: () => void };
  /** Dans une Sheet sans en-tête : laisse la place à la croix de fermeture */
  inDialog?: boolean;
}) {
  const side = layout === "auto";
  const rarity = card.rarity === undefined ? undefined : card.rarity ? rarityLabel(card.rarity) : null;
  const symbol = rarity ? raritySymbol(rarity) : null;
  const number = card.localId
    ? `${card.localId}${card.total && !card.localId.includes("/") ? ` / ${card.total}` : ""}`
    : null;

  const cells: Cell[] = [];
  if (rarity !== undefined) {
    cells.push({
      key: "rarity",
      label: "Rareté",
      value: rarity ? (
        <span>
          {symbol && (
            <span className="mr-1.5 text-accent-strong" aria-hidden>
              {symbol}
            </span>
          )}
          {rarity}
        </span>
      ) : (
        <span className="font-normal text-faint">Non renseignée</span>
      ),
    });
  }
  if (price !== undefined || cmUrl) {
    cells.push({
      key: "price",
      label: "Cardmarket",
      href: cmUrl ?? undefined,
      value:
        price === "loading" ? (
          <span className="font-normal text-faint">Relevé…</span>
        ) : price == null ? (
          <span className="font-normal text-faint">Indisponible</span>
        ) : (
          <span className="num">{formatEur(price)}</span>
        ),
    });
  }
  for (const f of facts) cells.push({ key: f.label, label: f.label, value: f.value });
  const oddLast = cells.length % 2 === 1;

  return (
    <div className={side ? "sm:grid sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start sm:gap-6" : ""}>
      <figure className={`relative isolate mx-auto w-[min(62vw,230px)] ${side ? "sm:w-auto" : ""}`}>
        {card.image && !imageSlot && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-5 -inset-y-3 -z-10 overflow-hidden rounded-[45%] opacity-55 blur-2xl saturate-[1.4]"
          >
            <CardImage
              base={card.image}
              alt=""
              direct={card.direct}
              fallback={card.fallback}
              quality="low"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="card-tile aspect-[63/88] !shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          {imageSlot ?? (
            <CardImage base={card.image} alt={card.name} direct={card.direct} fallback={card.fallback} quality="high" />
          )}
        </div>
      </figure>

      <div className={`mt-5 min-w-0 ${side ? "sm:mt-0" : ""}`}>
        {kicker && <p className="label-xs mb-2 flex items-center gap-1.5">{kicker}</p>}
        <div className={`flex items-start gap-3 ${inDialog ? "sm:pr-8" : ""}`}>
          <div className="min-w-0 flex-1">
            <h2 className="display text-2xl font-bold leading-[1.1] tracking-tight">
              {card.name}
              {card.lang && (
                <span className="ml-2 inline-block rounded-md bg-raised px-1.5 py-0.5 align-middle text-[11px] font-semibold tracking-wide text-muted">
                  {card.lang}
                </span>
              )}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted">
              <span>{card.setName}</span>
              {number && <span className="num whitespace-nowrap text-faint">· {number}</span>}
            </p>
          </div>
          {wish && (
            <button
              type="button"
              onClick={wish.toggle}
              disabled={wish.pending}
              title={wish.on ? "Retirer des recherchées" : "Ajouter aux recherchées"}
              aria-label={wish.on ? "Retirer des recherchées" : "Ajouter aux recherchées"}
              aria-pressed={wish.on}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
                wish.on
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
              } ${wish.pending ? "opacity-60" : ""}`}
            >
              <Star size={16} fill={wish.on ? "currentColor" : "none"} aria-hidden />
            </button>
          )}
        </div>

        {cells.length > 0 && (
          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-edge bg-raised/40">
            {cells.map((c, i) => {
              const last = oddLast && i === cells.length - 1;
              const cls = `min-w-0 px-3.5 py-3 ${last ? "col-span-2" : i % 2 === 1 ? "border-l border-edge" : ""} ${
                i >= 2 ? "border-t border-edge" : ""
              }`;
              const inner = (
                <>
                  <span className="label-xs flex items-center justify-between gap-1">
                    {c.label}
                    {c.href && <ArrowUpRight size={12} className="shrink-0" aria-hidden />}
                  </span>
                  <span className="mt-1 block break-words text-sm font-semibold leading-snug">{c.value}</span>
                </>
              );
              return c.href ? (
                <a
                  key={c.key}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Voir sur Cardmarket"
                  className={`${cls} transition hover:bg-raised`}
                >
                  {inner}
                </a>
              ) : (
                <div key={c.key} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        {actions && <div className="mt-4 flex flex-col gap-2">{actions}</div>}
      </div>
    </div>
  );
}
