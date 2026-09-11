import type { ReactNode } from "react";
import { Check, ListChecks } from "lucide-react";

/*
 * Briques de grille partagées, extraites de la collection et du catalogue :
 * même grille, même légende sous la tuile, même coche de sélection, mêmes
 * onglets segmentés. Les pages du jeu (/boosters) s'en servent pour rester
 * dans la DA du site plutôt que de réinventer leurs propres vignettes.
 */

/** Grille de tuiles du site (2 → 5 colonnes, entrée en fondu) */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <ul className="rise-in grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {children}
    </ul>
  );
}

/** Légende sous une tuile : nom, puis une ligne secondaire (set · n°, dresseur…) */
export function TileCaption({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="mt-2.5 px-0.5">
      <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">{name}</p>
      {sub != null && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Contour d'une tuile sélectionnée */
export const SELECTED_RING = "outline outline-2 outline-offset-2 outline-accent";

/** Coche de sélection dans le coin bas droit d'une tuile (mode sélection) */
export function TileCheck({ on }: { on: boolean }) {
  return (
    <span
      className={`absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
        on ? "border-transparent bg-accent text-accent-ink" : "border-white/50 bg-black/40 text-transparent"
      }`}
      aria-hidden
    >
      <Check size={13} strokeWidth={3} />
    </span>
  );
}

/** Bouton « Sélectionner » / « Annuler » d'une barre d'outils */
export function SelectToggle({
  selecting,
  onToggle,
  label = "Sélectionner",
  cancelLabel = "Annuler",
}: {
  selecting: boolean;
  onToggle: () => void;
  label?: string;
  cancelLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selecting}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition ${
        selecting
          ? "border-accent/50 bg-accent-soft font-medium text-accent-strong"
          : "border-edge text-muted hover:text-foreground"
      }`}
    >
      <ListChecks size={13} aria-hidden /> {selecting ? cancelLabel : label}
    </button>
  );
}

/** Onglets segmentés (même DA que la bascule Pages / Grille et les onglets Boosters) */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: T; label: string; n?: number }[];
  value: T;
  onChange: (key: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-lg border border-edge bg-surface p-0.5"
    >
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
            value === t.key ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {t.label}
          {t.n != null && t.n > 0 && <span className="num ml-1 text-faint">{t.n}</span>}
        </button>
      ))}
    </div>
  );
}
