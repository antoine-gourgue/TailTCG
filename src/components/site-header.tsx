"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/", label: "Collection" },
  { href: "/recherche", label: "Ajouter" },
  { href: "/boutiques", label: "Boutiques" },
  { href: "/stats", label: "Stats" },
];

export function SiteHeader() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/" || pathname.startsWith("/carte");
    if (href === "/recherche")
      return pathname.startsWith("/recherche") || pathname.startsWith("/ajouter");
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
        <Link href="/" className="display mr-4 flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] text-accent-ink">
            ◓
          </span>
          Pokédex Collection
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 transition ${
                isActive(l.href)
                  ? "bg-accent-soft font-medium text-accent-strong"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface hover:text-foreground"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
