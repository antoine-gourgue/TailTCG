"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { signOut } from "@/app/actions";
import { ThemeToggle, useTheme } from "@/components/theme-toggle";

/* État de la sidebar : vit sur <html data-sidebar>, comme le thème */
let sidebarListeners: Array<() => void> = [];

function subscribeSidebar(cb: () => void) {
  sidebarListeners.push(cb);
  return () => {
    sidebarListeners = sidebarListeners.filter((l) => l !== cb);
  };
}

function getSidebar(): "open" | "rail" {
  return document.documentElement.dataset.sidebar === "rail" ? "rail" : "open";
}

function Pokeball({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="var(--accent)" />
      <path d="M2 12h20a10 10 0 0 1-20 0Z" fill="#fff" opacity="0.92" />
      <rect x="2" y="11" width="20" height="2" rx="1" fill="#1a1a1d" />
      <circle cx="12" cy="12" r="3.2" fill="#1a1a1d" />
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
    </svg>
  );
}

const icons = {
  collection: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="8" height="10" rx="1.5" />
      <rect x="13" y="3" width="8" height="10" rx="1.5" transform="rotate(4 17 8)" />
      <path d="M5 17h14M5 21h9" />
    </svg>
  ),
  ajouter: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
    </svg>
  ),
  boutiques: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  stats: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
} as const;

const NAV = [
  { href: "/", label: "Collection", icon: icons.collection },
  { href: "/recherche", label: "Ajouter", icon: icons.ajouter },
  { href: "/boutiques", label: "Boutiques", icon: icons.boutiques },
  { href: "/stats", label: "Stats", icon: icons.stats },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/carte");
  if (href === "/recherche")
    return pathname.startsWith("/recherche") || pathname.startsWith("/ajouter");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const sidebar = useSyncExternalStore(
    subscribeSidebar,
    getSidebar,
    () => "open" as const
  );

  function toggleSidebar() {
    const next = sidebar === "open" ? "rail" : "open";
    if (next === "rail") {
      document.documentElement.dataset.sidebar = "rail";
    } else {
      delete document.documentElement.dataset.sidebar;
    }
    try {
      localStorage.setItem("sidebar", next);
    } catch {}
    sidebarListeners.forEach((l) => l());
  }

  const rail = sidebar === "rail";

  return (
    <>
      {/* ——— Sidebar (desktop) ——— */}
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-edge bg-surface md:flex">
        <div
          className={`flex items-center ${
            rail ? "h-auto flex-col gap-2 py-4" : "h-16 justify-between pl-5 pr-3"
          }`}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <Pokeball />
            <span className="nav-label display text-[15px]">Pokédex</span>
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            title={rail ? "Déplier" : "Replier"}
            aria-label={rail ? "Déplier la navigation" : "Replier la navigation"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-foreground"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${rail ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-1">
          {NAV.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={rail ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  rail ? "justify-center" : ""
                } ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-strong"
                    : "text-muted hover:bg-raised hover:text-foreground"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-edge px-3 py-3">
          <button
            type="button"
            onClick={toggleTheme}
            title={rail ? (theme === "dark" ? "Thème clair" : "Thème sombre") : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-raised hover:text-foreground ${
              rail ? "justify-center" : ""
            }`}
          >
            <span className="shrink-0">
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </span>
            <span className="nav-label">
              {theme === "dark" ? "Thème clair" : "Thème sombre"}
            </span>
          </button>
          <form action={signOut}>
            <button
              type="submit"
              title={rail ? "Déconnexion" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-raised hover:text-foreground ${
                rail ? "justify-center" : ""
              }`}
            >
              <span className="shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </span>
              <span className="nav-label">Déconnexion</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ——— Barre haute (mobile) ——— */}
      <header className="sticky top-0 z-40 border-b border-edge bg-surface/90 backdrop-blur-md md:hidden">
        <div className="flex h-13 items-center gap-2 px-4 py-2">
          <Pokeball size={20} />
          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto text-sm">
            {NAV.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 transition ${
                    active
                      ? "bg-accent-soft font-semibold text-accent-strong"
                      : "text-muted"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      {/* ——— Contenu ——— */}
      <div className="app-main">{children}</div>
    </>
  );
}
