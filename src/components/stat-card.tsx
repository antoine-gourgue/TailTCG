import type { ReactNode } from "react";

/** Petite carte de chiffre : libellé, valeur en mono, sous-texte utile */
export function StatCard({
  label,
  value,
  sub,
  tone,
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down";
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl bg-surface px-4 py-3 ring-1 ring-ring ${className}`}>
      <p className="label-xs truncate text-muted">{label}</p>
      <p className={`display num mt-1 truncate text-xl font-bold leading-tight ${tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""}`}>{value}</p>
      {sub && <p className="num mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Bandeau de chiffres : grille sur desktop, rangée qui défile
 * horizontalement sur mobile (chaque carte garde une largeur lisible).
 */
export function StatStrip({ children, cols = 5 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = cols === 3 ? "sm:grid-cols-3" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5";
  return (
    <div className={`scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 ${grid} [&>*]:w-[150px] [&>*]:shrink-0 sm:[&>*]:w-auto`}>
      {children}
    </div>
  );
}
