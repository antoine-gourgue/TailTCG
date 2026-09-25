import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { formatEur } from "@/lib/domain";
import { CardImage } from "@/components/card-image";

/* Briques serveur de la page Statistiques : mêmes panneaux, mêmes lignes
   « sheet » que le reste de l'app ; couleur unique (accent) déclinée en
   intensité plutôt qu'une palette. */

export function Panel({
  icon: Icon,
  title,
  hint,
  action,
  className = "",
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel flex flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display flex items-center gap-2 text-base font-semibold">
            <Icon size={16} className="shrink-0 text-muted" aria-hidden />
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">{children}</p>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="label-xs">{label}</p>
        <Icon size={15} className="text-faint" aria-hidden />
      </div>
      <p
        className={`num display min-w-0 text-xl font-bold leading-none md:text-2xl ${
          tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-xs leading-snug text-muted">{sub}</p>}
    </div>
  );
}

export function Bar({
  pct,
  tone = "accent",
  className = "",
}: {
  pct: number;
  tone?: "accent" | "gain";
  className?: string;
}) {
  const width = pct <= 0 ? 0 : Math.min(Math.max(pct, 1.5), 100);
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-foreground/[0.07] ${className}`}>
      <div
        className={`h-full rounded-full ${tone === "gain" ? "bg-gain" : "bg-accent"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/** Ligne « sheet » : libellé, valeur alignée, barre en dessous */
export function BarRow({
  label,
  value,
  pct,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  pct: number;
  href?: string;
  tone?: "accent" | "gain";
}) {
  const body = (
    <>
      <span className="truncate text-sm font-medium">{label}</span>
      <span className="num shrink-0 text-xs text-muted">{value}</span>
      <Bar pct={pct} tone={tone} className="col-span-2" />
    </>
  );
  const cls =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-2 transition";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-raised`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Intensités de l'accent, de la plus forte à la plus légère */
export type Slice = { code: string; label: string; count: number };

/** Le Donut (interactif) vit dans donut.tsx ; `Slice` reste ici pour les données */

export type MonthPoint = {
  key: string;
  label: string;
  spend: number;
  cards: number;
  current: boolean;
  /** part de `spend` consacrée aux scellés (empilée en couleur dédiée) */
  sealed?: number;
};


export type RankItem = {
  id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string;
  gain: number;
  pct: number | null;
};

/** Ligne classement : vignette, carte, plus-value en € et en % */
export function RankRow({ item }: { item: RankItem }) {
  const up = item.gain >= 0;
  const sign = item.gain > 0 ? "+" : "";
  return (
    <li>
      <Link
        href={`/carte/${item.id}`}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-raised"
      >
        <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-raised shadow">
          <CardImage base={item.image_url || null} alt="" placeholder="compact" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.card_name}</span>
          <span className="block truncate text-xs text-muted">
            {item.set_name} · <span className="num">{item.local_id}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`num block text-sm font-semibold ${up ? "text-gain" : "text-loss"}`}>
            {sign}
            {formatEur(item.gain)}
          </span>
          {item.pct != null && (
            <span className="num block text-[11px] text-muted">
              {sign}
              {Math.round(item.pct)}%
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** Ligne de la vue d'ensemble : icône, libellé, valeur ; lien optionnel */
export function Fact({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: "up" | "down";
}) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      <span
        className={`num shrink-0 text-sm font-semibold ${
          tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""
        }`}
      >
        {value}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl px-2.5 py-2 transition";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-raised`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
