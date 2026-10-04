import type { ReactNode } from "react";

/**
 * En-tête de page du système « Dock » : surtitre discret, titre en grand
 * avec son compteur, sous-titre optionnel, actions à droite (une seule en
 * accent par page, les autres en fantôme).
 */
export function PageHead({
  kicker,
  title,
  count,
  sub,
  children,
  className = "",
}: {
  kicker?: string;
  title: ReactNode;
  count?: string | number | null;
  sub?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {kicker && <p className="label-xs text-muted">{kicker}</p>}
        <h1 className="display mt-1 flex min-w-0 items-baseline gap-3 text-[28px] font-bold tracking-tight sm:text-3xl">
          <span className="truncate">{title}</span>
          {count != null && count !== "" && <span className="num shrink-0 text-base font-semibold text-muted">{count}</span>}
        </h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
