import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { dayMonth } from "@/lib/admin-format";

/**
 * Briques visuelles du back-office (sans état ni accès serveur : utilisables
 * dans les pages serveur comme dans les composants client).
 */

export type Tone = "ok" | "warn" | "ko" | "off" | "accent" | "sealed" | "game" | "scan" | "muted" | "gold";

const BOX: Record<Tone, string> = {
  ok: "bg-gain/12 text-gain",
  warn: "bg-warn/12 text-warn",
  ko: "bg-loss/12 text-loss",
  off: "bg-raised text-faint",
  accent: "bg-accent-soft text-accent-strong",
  sealed: "bg-sealed/12 text-sealed",
  game: "bg-game/14 text-game",
  scan: "bg-scan/12 text-scan",
  muted: "bg-raised text-muted",
  gold: "bg-[#f4c361]/14 text-[#d9a640]",
};

/** Pastille d'icône teintée */
export function IconBox({ icon: Icon, tone = "muted", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-6 w-6 rounded-lg" : "h-9 w-9 rounded-xl";
  return (
    <span className={`flex shrink-0 items-center justify-center ${s} ${BOX[tone]}`} aria-hidden>
      <Icon size={size === "sm" ? 12 : 17} />
    </span>
  );
}

/** Point d'état, avec halo */
export function Dot({ tone }: { tone: "ok" | "warn" | "ko" | "off" }) {
  const c = tone === "ok" ? "bg-gain shadow-[0_0_0_4px_color-mix(in_srgb,var(--gain)_18%,transparent)]" : tone === "warn" ? "bg-warn shadow-[0_0_0_4px_color-mix(in_srgb,var(--warn)_18%,transparent)]" : tone === "ko" ? "bg-loss shadow-[0_0_0_4px_color-mix(in_srgb,var(--loss)_18%,transparent)]" : "bg-faint/50";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-hidden />;
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${BOX[tone]}`}>{children}</span>;
}

/** Titre de panneau : titre, aide, action à droite */
export function PanelHead({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="display text-[15px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Avatar : initiale sur dégradé, teinte propre au compte */
export function Avatar({ name, hue, size = "md" }: { name: string | null; hue: number; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-16 w-16 text-2xl" : "h-9 w-9 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${s}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 75% 45%))` }}
      aria-hidden
    >
      {(name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Mini-courbe d'activité (comptes, pas valeurs : couleur fixe) */
export function Spark({ values, color = "var(--accent-strong)", className = "h-7 w-28" }: { values: number[]; color?: string; className?: string }) {
  const w = 120;
  const h = 28;
  const max = Math.max(...values, 0);
  if (max === 0) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
        <line x1={0} x2={w} y1={h - 2} y2={h - 2} stroke="var(--raised)" strokeWidth={2} />
      </svg>
    );
  }
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.14} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Barres verticales empilées par jour. `sqrt` adoucit les hauteurs quand un
 * pic écraserait les autres jours (la valeur affichée reste la vraie).
 */
export function DayBars({ series, days, height = 170, sqrt = false }: { series: { values: number[]; color: string }[]; days: string[]; height?: number; sqrt?: boolean }) {
  const n = days.length;
  const total = days.map((_, k) => series.reduce((a, s) => a + s.values[k], 0));
  const scale = (v: number) => (sqrt ? Math.sqrt(v) : v);
  const max = Math.max(...days.map((_, k) => series.reduce((a, s) => a + scale(s.values[k]), 0)), 1);
  const peak = total.reduce((best, v, i) => (v > total[best] ? i : best), 0);
  const ticks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return (
    <div>
      <div className="relative mt-6 flex items-end gap-[3px] border-b border-ring" style={{ height }}>
        {days.map((d, k) => (
          <div key={d} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${dayMonth(d)} : ${total[k]}`}>
            {total[k] === 0 ? (
              <i className="block h-[3px] rounded-[3px] bg-raised" />
            ) : (
              [...series].reverse().map((s, si) =>
                s.values[k] ? <i key={si} className="block rounded-[3px]" style={{ height: `${(scale(s.values[k]) / max) * 100}%`, background: s.color }} /> : null,
              )
            )}
          </div>
        ))}
        {total[peak] > 0 && (
          <span
            className="num absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-raised px-1.5 py-px text-[11px] font-semibold"
            style={{ left: `${((peak + 0.5) / n) * 100}%`, top: `${100 - (series.reduce((a, s) => a + scale(s.values[peak]), 0) / max) * 100}%`, marginTop: -4 }}
          >
            {total[peak].toLocaleString("fr-FR")}
          </span>
        )}
      </div>
      <div className="num mt-1.5 flex justify-between text-[10.5px] text-faint">
        {ticks.map((k) => (
          <span key={k}>{dayMonth(days[k])}</span>
        ))}
      </div>
    </div>
  );
}

/** Ligne de classement : libellé (avec visuel), barre, valeur */
export function RankRow({ label, lead, value, max, color = "var(--accent)", hint }: { label: ReactNode; lead?: ReactNode; value: number; max: number; color?: string; hint?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px_44px] items-center gap-3 py-1.5 text-[13px] sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_56px]">
      <div className="flex min-w-0 items-center gap-2">
        {lead}
        <span className="truncate">{label}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <i className="block h-full rounded-full" style={{ width: `${Math.max(2, (value / Math.max(max, 1)) * 100)}%`, background: color }} />
      </div>
      <span className="num text-right font-semibold">{hint ?? value.toLocaleString("fr-FR")}</span>
    </div>
  );
}

/** Anneau à parts colorées + légende */
export function PieRing({ parts, center, sub }: { parts: { label: string; value: number; color: string }[]; center: ReactNode; sub?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  // Bornes cumulées de chaque part (calcul pur, sans variable réassignée)
  const ends = parts.map((_, i) => parts.slice(0, i + 1).reduce((a, p) => a + p.value, 0));
  const stops = parts.map((p, i) => `${p.color} ${(((ends[i] - p.value) / total) * 360).toFixed(2)}deg ${((ends[i] / total) * 360).toFixed(2)}deg`);
  return (
    <div className="flex items-center gap-5">
      <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="absolute inset-4 rounded-full bg-surface" />
        <div className="relative text-center">
          <p className="num text-base font-bold leading-tight">{center}</p>
          {sub && <p className="text-[10px] text-muted">{sub}</p>}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[12.5px]">
            <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="num font-semibold">{p.value.toLocaleString("fr-FR")}</span>
            <span className="num w-10 text-right text-faint">{Math.round((p.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Anneau de pourcentage */
export function PercentRing({ pct, color = "var(--gain)" }: { pct: number; color?: string }) {
  return (
    <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--raised) 0)` }}>
      <div className="absolute inset-2.5 rounded-full bg-surface" />
      <b className="num relative text-lg">{Math.round(pct)} %</b>
    </div>
  );
}

/** Carte d'état (santé d'une tâche ou du ménage) */
export function HealthCard({ icon, tone, title, line, detail, dot }: { icon: LucideIcon; tone: Tone; title: string; line: ReactNode; detail: ReactNode; dot: "ok" | "warn" | "ko" | "off" }) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <IconBox icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <Dot tone={dot} />
        </p>
        <p className="mt-0.5 text-[12.5px]">{line}</p>
        <p className="num mt-0.5 truncate text-[11px] text-faint">{detail}</p>
      </div>
    </div>
  );
}

/** Retour vers la fiche du propriétaire, avec son avatar */
export function OwnerBack({ href, name, hue, label = "Retour au compte" }: { href: string; name: string; hue: number; label?: string }) {
  return (
    <Link href={href} className="flex w-max items-center gap-2 text-[13px] text-muted transition hover:text-foreground">
      <span aria-hidden>←</span>
      <Avatar name={name} hue={hue} size="sm" />
      <span>
        {label} <b className="font-semibold text-foreground">{name}</b>
      </span>
    </Link>
  );
}

/** Chiffre clé d'un en-tête : libellé, valeur, sous-texte */
export function HeroStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "faint" }) {
  return (
    <div className="min-w-0 rounded-2xl bg-raised/60 px-3.5 py-3 ring-1 ring-ring">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`display num mt-1 truncate text-xl font-bold leading-tight ${tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : tone === "faint" ? "text-faint" : ""}`}>{value}</p>
      {sub && <p className="num mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
