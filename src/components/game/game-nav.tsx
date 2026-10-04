import Link from "next/link";

/** Onglets de la section Boosters : pilules, l'onglet actif en dégradé accent comme le Dock */
export function GameNav({
  current,
}: {
  current: "boosters" | "collection" | "gradation" | "echanges";
}) {
  const tabs = [
    { key: "boosters" as const, href: "/boosters", label: "Ouvrir" },
    { key: "collection" as const, href: "/boosters/collection", label: "Collection" },
    { key: "gradation" as const, href: "/boosters/gradation", label: "Gradation" },
    { key: "echanges" as const, href: "/boosters/echanges", label: "Échanges" },
  ];
  return (
    <nav aria-label="Boosters" className="scrollbar-none -mx-4 flex max-w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">
      <div className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-ring">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={current === t.key ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              current === t.key ? "bg-gradient-to-r from-accent to-accent-strong text-white shadow-lg shadow-accent/30" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
