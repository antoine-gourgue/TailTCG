import Link from "next/link";

/** Onglets de la section Boosters, à part du reste du site */
export function GameNav({ current }: { current: "boosters" | "collection" }) {
  const tabs = [
    { key: "boosters" as const, href: "/boosters", label: "Ouvrir" },
    { key: "collection" as const, href: "/boosters/collection", label: "Ma collection virtuelle" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
            current === t.key ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
