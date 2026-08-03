"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  LayoutGrid,
  SearchIcon,
  MapPin,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
} from "lucide-react";
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

const NAV = [
  { href: "/", label: "Collection", Icon: LayoutGrid },
  { href: "/recherche", label: "Ajouter", Icon: SearchIcon },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
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
            <ChevronLeft
              size={14}
              className={`transition-transform ${rail ? "rotate-180" : ""}`}
              aria-hidden
            />
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
                <item.Icon size={17} strokeWidth={1.9} className="shrink-0" aria-hidden />
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
                <Sun size={16} strokeWidth={1.9} aria-hidden />
              ) : (
                <Moon size={16} strokeWidth={1.9} aria-hidden />
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
                <LogOut size={16} strokeWidth={1.9} aria-hidden />
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
