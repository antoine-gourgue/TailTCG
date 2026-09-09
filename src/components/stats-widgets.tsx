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
        className={`num display text-2xl font-bold leading-none ${
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
export const RAMP = [100, 72, 52, 36, 24, 15, 9].map(
  (p) => `color-mix(in srgb, var(--accent) ${p}%, transparent)`
);

export type Slice = { code: string; label: string; count: number };

/** Anneau + légende : parts d'un total, ordre = ordre des tranches */
export function Donut({ slices, unit = "cartes", label }: { slices: Slice[]; unit?: string; label: string }) {
  const present = slices.filter((s) => s.count > 0);
  const total = present.reduce((a, s) => a + s.count, 0);
  if (total === 0) return <Empty>Rien à afficher pour l&apos;instant.</Empty>;

  const R = 40;
  const C = 2 * Math.PI * R;
  const segs: (Slice & { len: number; offset: number; color: string })[] = [];
  for (let i = 0, offset = 0; i < present.length; i++) {
    const len = (present[i].count / total) * C;
    segs.push({ ...present[i], len, offset, color: RAMP[Math.min(i, RAMP.length - 1)] });
    offset += len;
  }

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={label}>
        <circle cx={50} cy={50} r={R} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={12} />
        {segs.map((s) => (
          <circle
            key={s.code}
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={12}
            strokeDasharray={`${Math.max(s.len - 1.5, 0.5)} ${C}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 50 50)"
          >
            <title>{`${s.label} : ${s.count}`}</title>
          </circle>
        ))}
        <text
          x={50}
          y={49}
          textAnchor="middle"
          fontSize={17}
          fontWeight={700}
          fill="var(--foreground)"
          fontFamily="var(--font-geist-mono)"
        >
          {total}
        </text>
        <text x={50} y={62} textAnchor="middle" fontSize={7.5} fill="var(--muted)">
          {unit}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segs.map((s) => (
          <li key={s.code} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="num ml-auto shrink-0 text-[11px] text-muted">
              {s.count} · {Math.round((s.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type MonthPoint = { key: string; label: string; spend: number; cards: number; current: boolean };

/** Barres mensuelles : dépense (ou cartes ajoutées si aucun prix) sur 12 mois */
export function MonthlyBars({ months, metric }: { months: MonthPoint[]; metric: "spend" | "cards" }) {
  const W = 640;
  const H = 150;
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 };
  const slot = (W - PAD.left - PAD.right) / months.length;
  const bw = slot * 0.56;
  const val = (m: MonthPoint) => (metric === "spend" ? m.spend : m.cards);
  const max = Math.max(...months.map(val), 0);
  const h = (v: number) => (max > 0 ? (v / max) * (H - PAD.top - PAD.bottom) : 0);
  const fmt = (v: number) => (metric === "spend" ? formatEur(v) : `${v} carte${v > 1 ? "s" : ""}`);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Achats par mois">
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={H - PAD.bottom}
        y2={H - PAD.bottom}
        stroke="currentColor"
        strokeOpacity={0.1}
      />
      {months.map((m, i) => {
        const v = val(m);
        const bh = Math.max(h(v), v > 0 ? 2 : 0);
        const x = PAD.left + i * slot + (slot - bw) / 2;
        return (
          <g key={m.key}>
            <rect
              x={x}
              y={H - PAD.bottom - bh}
              width={bw}
              height={bh}
              rx={4}
              fill="var(--accent)"
              fillOpacity={m.current ? 1 : 0.55}
            >
              <title>{`${m.label} : ${fmt(v)}${metric === "spend" && m.cards > 0 ? ` · ${m.cards} carte${m.cards > 1 ? "s" : ""}` : ""}`}</title>
            </rect>
            {v > 0 && (
              <text
                x={x + bw / 2}
                y={H - PAD.bottom - bh - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted)"
                fontFamily="var(--font-geist-mono)"
              >
                {metric === "spend" ? `${Math.round(v)} €` : v}
              </text>
            )}
            <text
              x={x + bw / 2}
              y={H - 7}
              textAnchor="middle"
              fontSize={9.5}
              fill={m.current ? "var(--foreground)" : "var(--muted)"}
              fontWeight={m.current ? 600 : 400}
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

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
          <CardImage base={item.image_url || null} alt="" />
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
