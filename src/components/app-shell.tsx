"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  LayoutGrid,
  NotebookTabs,
  SearchIcon,
  Star,
  MapPin,
  BarChart3,
  Settings,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  Plus,
  History,
} from "lucide-react";
import { signOut } from "@/app/actions";
import { formatEur } from "@/lib/domain";
import {
  getShellCache,
  setShellCache,
  type ShellData,
} from "@/lib/shell-store";
import { Logo } from "@/components/logo";
import { ImageGate } from "@/components/image-gate";
import { ThemeToggle, useTheme } from "@/components/theme-toggle";
import { DisplayNameGate } from "@/components/display-name-gate";
import { CommandPalette, OPEN_PALETTE_EVENT } from "@/components/command-palette";

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

const NAV = [
  { href: "/", label: "Collection", Icon: LayoutGrid },
  { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
  { href: "/recherche", label: "Ajouter", Icon: SearchIcon },
  { href: "/wishlist", label: "Recherchées", Icon: Star },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/journal", label: "Journal", Icon: History },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
];

/* Onglets du bas sur mobile — Ajouter au centre, en avant */
const MOBILE_TABS = [
  { href: "/", label: "Collection", Icon: LayoutGrid },
  { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
  { href: "/recherche", label: "Ajouter", Icon: Plus, primary: true },
  { href: "/wishlist", label: "Recherchées", Icon: Star },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/carte");
  if (href === "/recherche")
    return (
      pathname.startsWith("/recherche") ||
      pathname.startsWith("/ajouter") ||
      pathname.startsWith("/extensions")
    );
  return pathname.startsWith(href);
}

/* Widget de la sidebar : chargé une fois puis gardé en mémoire de module,
 * rafraîchi en arrière-plan à chaque montage */
function useShellData(): ShellData | null {
  const [data, setData] = useState<ShellData | null>(getShellCache());

  useEffect(() => {
    let on = true;
    fetch("/api/shell")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: ShellData | null) => {
        if (on && j) {
          setShellCache(j);
          setData(j);
        }
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  return data;
}

function openPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const shell = useShellData();
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
  const initial = (shell?.email?.[0] ?? "?").toUpperCase();

  return (
    <>
      {/* ——— Sidebar flottante (desktop) ——— */}
      <aside className="app-sidebar fixed bottom-3 left-3 top-3 z-40 hidden flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl md:flex">
        <div
          className={`flex items-center ${
            rail ? "h-auto flex-col gap-2 py-4" : "h-16 justify-between pl-5 pr-3"
          }`}
        >
          <Link href="/" className="flex items-center">
            {rail ? (
              <Logo variant="mark" size={30} />
            ) : (
              <Logo variant="lockup" size={30} />
            )}
          </Link>
          <div className={`flex items-center ${rail ? "flex-col gap-1" : "gap-0.5"}`}>
            <button
              type="button"
              onClick={openPalette}
              title="Recherche rapide (⌘K)"
              aria-label="Recherche rapide"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-foreground"
            >
              <SearchIcon size={14} aria-hidden />
            </button>
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
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-1">
          {NAV.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={rail ? item.label : undefined}
                className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition ${
                  rail ? "justify-center gap-0" : "gap-3"
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

        {/* Widget : la valeur du classeur, toujours sous la main */}
        {!rail && shell && shell.count > 0 && (
          <div className="mx-3 mb-2 rounded-xl border border-edge bg-raised/60 px-3.5 py-2.5">
            <p className="label-xs">Ma collection</p>
            <p className="display num mt-0.5 text-lg font-bold leading-tight">
              {shell.value != null ? formatEur(shell.value) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {shell.count} carte{shell.count > 1 ? "s" : ""}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-edge px-3 py-3">
          <button
            type="button"
            onClick={toggleTheme}
            title={rail ? (theme === "dark" ? "Thème clair" : "Thème sombre") : undefined}
            className={`flex items-center rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-raised hover:text-foreground ${
              rail ? "justify-center gap-0" : "gap-3"
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

          {/* Compte : avatar, email, déconnexion */}
          <div
            className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${
              rail ? "flex-col px-0" : ""
            }`}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong"
              aria-hidden
            >
              {initial}
            </span>
            {!rail && (
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted"
                title={shell?.email}
              >
                {shell?.email ?? "…"}
              </span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                title="Déconnexion"
                aria-label="Déconnexion"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss"
              >
                <LogOut size={14} strokeWidth={1.9} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ——— Barre haute (mobile) : logo + accès secondaires ——— */}
      <header className="sticky top-0 z-40 border-b border-edge bg-surface/90 backdrop-blur-md md:hidden">
        <div className="flex h-13 items-center gap-1.5 px-3 py-2">
          <Link href="/" className="mr-auto flex items-center">
            <Logo variant="lockup" size={26} />
          </Link>
          <button
            type="button"
            onClick={openPalette}
            aria-label="Recherche rapide"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-muted"
          >
            <SearchIcon size={14} aria-hidden />
          </button>
          <Link
            href="/boutiques"
            aria-label="Boutiques"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-edge ${
              isActive("/boutiques", pathname)
                ? "text-accent-strong"
                : "text-muted"
            }`}
          >
            <MapPin size={14} aria-hidden />
          </Link>
          <Link
            href="/parametres"
            aria-label="Paramètres"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-edge ${
              isActive("/parametres", pathname)
                ? "text-accent-strong"
                : "text-muted"
            }`}
          >
            <Settings size={14} aria-hidden />
          </Link>
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Déconnexion"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-muted"
            >
              <LogOut size={14} aria-hidden />
            </button>
          </form>
        </div>
      </header>

      {/* ——— Barre d'onglets (mobile) ——— */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const active = isActive(tab.href, pathname);
            if (tab.primary) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-label={tab.label}
                  className="flex flex-col items-center justify-end pb-1.5"
                >
                  <span className="flex h-11 w-11 -translate-y-3.5 items-center justify-center rounded-full border-4 border-surface bg-accent text-accent-ink shadow-lg">
                    <tab.Icon size={20} strokeWidth={2.2} aria-hidden />
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-medium transition ${
                  active ? "text-accent-strong" : "text-muted"
                }`}
              >
                <tab.Icon size={18} strokeWidth={active ? 2.1 : 1.8} aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ——— Contenu ——— */}
      <ImageGate />
      <CommandPalette />
      {shell && !shell.displayName && <DisplayNameGate />}
      <div className="app-main">{children}</div>
    </>
  );
}
