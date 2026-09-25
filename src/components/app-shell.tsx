"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  LayoutGrid,
  LayoutDashboard,
  NotebookTabs,
  SearchIcon,
  Star,
  MapPin,
  Settings,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  History,
  Award,
  ShieldCheck,
  Package,
  Boxes,
} from "lucide-react";
import { signOut } from "@/app/actions";
import { getShellCache, setShellCache, type ShellData } from "@/lib/shell-store";
import { Logo } from "@/components/logo";
import { ImageGate } from "@/components/image-gate";
import { useTheme } from "@/components/theme-toggle";
import { DisplayNameGate } from "@/components/display-name-gate";
import { CommandPalette, OPEN_PALETTE_EVENT } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";

/* État de la sidebar (ouverte / rail) : vit sur <html data-sidebar>, comme le thème */
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

type NavItem = { href: string; label: string; Icon: typeof LayoutGrid };
type NavGroup = { label: string; items: NavItem[] };

/** Deux groupes, tout visible : ce que je possède, puis les outils */
const GROUPS: NavGroup[] = [
  {
    label: "Ma collection",
    items: [
      { href: "/collection", label: "Collection", Icon: LayoutDashboard },
      { href: "/", label: "Cartes", Icon: LayoutGrid },
      { href: "/scelles", label: "Scellés", Icon: Boxes },
      { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
      { href: "/wishlist", label: "Recherchées", Icon: Star },
    ],
  },
  {
    label: "Explorer",
    items: [
      { href: "/recherche", label: "Ajouter", Icon: SearchIcon },
      { href: "/boosters", label: "Boosters", Icon: Package },
      { href: "/pregrades", label: "Pré-gradées", Icon: Award },
      { href: "/boutiques", label: "Boutiques", Icon: MapPin },
      { href: "/journal", label: "Journal", Icon: History },
    ],
  },
];
const ADMIN: NavItem = { href: "/admin", label: "Admin", Icon: ShieldCheck };

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/carte");
  if (href === "/recherche") return pathname.startsWith("/recherche") || pathname.startsWith("/ajouter") || pathname.startsWith("/extensions");
  if (href === "/collection") return pathname.startsWith("/collection") || pathname.startsWith("/stats");
  return pathname.startsWith(href);
}

/* Données du shell : chargées une fois puis gardées en mémoire de module,
 * rafraîchies en arrière-plan à chaque montage */
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

/** `skeleton` : coquille seule (état de chargement), sans voile d'images ni palettes */
export function AppShell({ children, skeleton = false }: { children: React.ReactNode; skeleton?: boolean }) {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const shell = useShellData();
  const sidebar = useSyncExternalStore(subscribeSidebar, getSidebar, () => "open" as const);

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
  const groups = shell?.isAdmin ? GROUPS.map((g, i) => (i === GROUPS.length - 1 ? { ...g, items: [...g.items, ADMIN] } : g)) : GROUPS;
  const initial = (shell?.displayName?.[0] ?? shell?.email?.[0] ?? "?").toUpperCase();
  const who = shell?.displayName ?? shell?.email?.split("@")[0] ?? "…";
  const settingsActive = pathname.startsWith("/parametres");

  const linkClass = (active: boolean) =>
    `flex items-center rounded-xl px-3 py-2.5 text-sm transition ${rail ? "justify-center gap-0" : "gap-3"} ${
      active ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:bg-raised hover:text-foreground"
    }`;
  const iconBtn = (active = false, danger = false) =>
    `flex h-8 w-8 items-center justify-center rounded-lg transition ${
      active ? "bg-accent-soft text-accent-strong" : `text-faint hover:bg-raised ${danger ? "hover:text-loss" : "hover:text-foreground"}`
    }`;

  return (
    <>
      {/* ——— Sidebar flottante (desktop) ——— */}
      <aside className="app-sidebar fixed bottom-3 left-3 top-3 z-40 hidden flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl md:flex">
        <div className={`flex items-center ${rail ? "h-auto flex-col gap-2 py-4" : "h-16 justify-between pl-5 pr-3"}`}>
          <Link href="/collection" className="flex items-center">
            {rail ? <Logo variant="mark" size={30} /> : <Logo variant="lockup" size={30} />}
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
              <ChevronLeft size={14} className={`transition-transform ${rail ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-1">
          {groups.map((g, gi) => (
            <div key={g.label} className={`flex flex-col gap-1 ${gi > 0 ? (rail ? "mt-2 border-t border-edge pt-2" : "mt-3") : ""}`}>
              {!rail && <p className="label-xs px-3 pb-1 pt-1 text-faint">{g.label}</p>}
              {g.items.map((item) => (
                <Link key={item.href} href={item.href} title={rail ? item.label : undefined} className={linkClass(isActive(item.href, pathname))}>
                  <item.Icon size={17} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Pied : qui, et trois actions — thème, paramètres, déconnexion */}
        <div className={`flex items-center border-t border-edge px-3 py-3 ${rail ? "flex-col gap-2" : "gap-2"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong" title={shell?.email} aria-hidden>
            {initial}
          </span>
          {!rail && (
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={shell?.email}>
              {who}
            </span>
          )}
          <div className={`flex items-center ${rail ? "flex-col gap-1" : "gap-0.5"}`}>
            <button type="button" onClick={toggleTheme} title={theme === "dark" ? "Thème clair" : "Thème sombre"} aria-label="Changer de thème" className={iconBtn()}>
              {theme === "dark" ? <Sun size={15} strokeWidth={1.9} aria-hidden /> : <Moon size={15} strokeWidth={1.9} aria-hidden />}
            </button>
            <Link href="/parametres" title="Paramètres" aria-label="Paramètres" className={iconBtn(settingsActive)}>
              <Settings size={15} strokeWidth={1.9} aria-hidden />
            </Link>
            <form action={signOut}>
              <button type="submit" title="Déconnexion" aria-label="Déconnexion" className={iconBtn(false, true)}>
                <LogOut size={15} strokeWidth={1.9} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ——— Navigation mobile : barre haute sobre + onglets + sheet Profil ——— */}
      <MobileNav pathname={pathname} shell={shell} theme={theme} onToggleTheme={toggleTheme} onOpenPalette={openPalette} />

      {/* ——— Contenu : le voile d'images ne couvre que cette zone, la navigation reste visible ——— */}
      {!skeleton && <CommandPalette />}
      {!skeleton && shell && !shell.displayName && <DisplayNameGate />}
      <div className="app-main relative">
        {!skeleton && <ImageGate />}
        {children}
      </div>
    </>
  );
}
