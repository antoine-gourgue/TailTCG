import Link from "next/link";
import { signOut } from "@/app/actions";

const links = [
  { href: "/", label: "Collection" },
  { href: "/recherche", label: "Recherche" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-edge bg-surface/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight"
        >
          Pokédex Collection
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="text-sm text-muted transition hover:text-foreground"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </header>
  );
}
