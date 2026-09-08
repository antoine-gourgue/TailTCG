import Link from "next/link";
import { BookOpen, LayoutGrid } from "lucide-react";

/** Bascule Pages / Grille d'un classeur — l'état vit dans l'URL (`?vue=`) */
export function ViewToggle({
  base,
  current,
}: {
  base: string;
  current: "pages" | "grille";
}) {
  const cls = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
      active
        ? "bg-raised text-foreground shadow-sm"
        : "text-muted hover:text-foreground"
    }`;
  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface p-0.5">
      <Link
        href={base}
        aria-current={current === "pages" ? "page" : undefined}
        className={cls(current === "pages")}
      >
        <BookOpen size={14} aria-hidden />
        Pages
      </Link>
      <Link
        href={`${base}?vue=grille`}
        aria-current={current === "grille" ? "page" : undefined}
        className={cls(current === "grille")}
      >
        <LayoutGrid size={14} aria-hidden />
        Grille
      </Link>
    </div>
  );
}
