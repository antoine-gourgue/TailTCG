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
  History,
  Award,
  ShieldCheck,
  Package,
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
import { useTheme } from "@/components/theme-toggle";
import { DisplayNameGate } from "@/components/display-name-gate";
import { CommandPalette, OPEN_PALETTE_EVENT } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";

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
  { href: "/boosters", label: "Boosters", Icon: Package },
  { href: "/pregrades", label: "Pré-gradées", Icon: Award },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/journal", label: "Journal", Icon: History },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
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
  // Onglet Admin ajouté en fin de nav pour les administrateurs
  const nav = shell?.isAdmin
    ? [...NAV, { href: "/admin", label: "Admin", Icon: ShieldCheck }]
    : NAV;

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
          {nav.map((item) => {
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

      {/* ——— Navigation mobile : barre haute sobre + onglets + sheet Profil ——— */}
      <MobileNav
        pathname={pathname}
        shell={shell}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenPalette={openPalette}
      />

      {/* ——— Contenu ——— */}
      <ImageGate />
      <CommandPalette />
      {shell && !shell.displayName && <DisplayNameGate />}
      <div className="app-main">{children}</div>
    </>
  );
}
