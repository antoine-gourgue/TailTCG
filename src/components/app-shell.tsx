"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Award,
  Boxes,
  History,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Moon,
  NotebookTabs,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  SearchIcon,
  ShieldCheck,
  Star,
  Sun,
} from "lucide-react";
import { signOut } from "@/app/actions";
import { formatEur } from "@/lib/domain";
import { getShellCache, setShellCache, type ShellData } from "@/lib/shell-store";
import { Logo } from "@/components/logo";
import { ImageGate } from "@/components/image-gate";
import { useTheme } from "@/components/theme-toggle";
import { DisplayNameGate } from "@/components/display-name-gate";
import { CommandPalette, OPEN_PALETTE_EVENT } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { PhoneCaptureButton } from "@/components/capture/phone-capture-button";

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

type NavItem = { href: string; label: string; Icon: typeof LayoutGrid; count?: (s: ShellData) => number };
type NavGroup = { label: string; items: NavItem[] };

/** Deux groupes, tout visible : ce que je possède, puis les outils */
const GROUPS: NavGroup[] = [
  {
    label: "Ma collection",
    items: [
      { href: "/collection", label: "Collection", Icon: LayoutDashboard },
      { href: "/cartes", label: "Cartes", Icon: LayoutGrid, count: (s) => s.count },
      { href: "/scelles", label: "Scellés", Icon: Boxes, count: (s) => s.sealedCount },
      { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs, count: (s) => s.binders },
      { href: "/recherchees", label: "Recherchées", Icon: Star, count: (s) => s.wishes },
    ],
  },
  {
    label: "Explorer",
    items: [
      { href: "/catalogue", label: "Catalogue", Icon: SearchIcon },
      { href: "/boosters", label: "Boosters", Icon: Package },
      { href: "/pregrades", label: "Pré-gradées", Icon: Award, count: (s) => s.graded },
      { href: "/boutiques", label: "Boutiques", Icon: MapPin },
      { href: "/journal", label: "Journal", Icon: History },
    ],
  },
];
const ADMIN: NavItem = { href: "/admin", label: "Admin", Icon: ShieldCheck };

export function isActive(href: string, pathname: string) {
  if (href === "/cartes") return pathname.startsWith("/carte");
  if (href === "/catalogue") return pathname.startsWith("/catalogue") || pathname.startsWith("/ajouter") || pathname.startsWith("/extensions");
  if (href === "/collection") return pathname.startsWith("/collection");
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

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatEur(v)}`;

/**
 * Coquille de l'app : le Dock (sidebar profonde, toujours sombre) sur desktop
 * avec son mode replié, la navigation mobile (barre haute + dock bas), et
 * les gardes communes (images, palette ⌘K, pseudo).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
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

  const groups = shell?.isAdmin ? GROUPS.map((g, i) => (i === GROUPS.length - 1 ? { ...g, items: [...g.items, ADMIN] } : g)) : GROUPS;
  const initial = (shell?.displayName?.[0] ?? shell?.email?.[0] ?? "?").toUpperCase();
  const who = shell?.displayName ?? shell?.email?.split("@")[0] ?? "…";
  const settingsActive = pathname.startsWith("/parametres");
  const gainPct = shell && shell.gain != null && shell.invested > 0 ? Math.round((shell.gain / shell.invested) * 100) : null;

  const linkClass = (active: boolean) =>
    `relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] transition ${
      active
        ? "bg-gradient-to-r from-accent to-accent-strong font-semibold text-white shadow-lg shadow-accent/30"
        : "text-dock-muted hover:bg-dock-raised hover:text-dock-text"
    }`;
  const railLink = (active: boolean) =>
    `relative flex h-11 flex-col items-center justify-center gap-1 rounded-xl transition ${
      active
        ? "bg-gradient-to-b from-accent to-accent-strong text-white shadow-lg shadow-accent/30"
        : "text-dock-muted hover:bg-dock-raised hover:text-dock-text"
    }`;
  const iconBtn = (active = false, danger = false) =>
    `flex h-8 w-8 items-center justify-center rounded-full transition ${
      active ? "bg-dock-raised text-dock-text" : `text-dock-faint hover:bg-dock-raised ${danger ? "hover:text-loss" : "hover:text-dock-text"}`
    }`;
  const roundBtn = "flex h-7 w-7 items-center justify-center rounded-full bg-dock-raised text-dock-muted transition hover:text-dock-text";

  return (
    <>
      {/* ——— Dock (desktop) ———
          Les deux états (déplié / rail) sont tous deux dans le DOM et c'est le
          CSS (html[data-sidebar]) qui montre l'un ou l'autre : aucun flash à
          l'hydratation, et la largeur s'anime proprement. */}
      <aside className="app-sidebar fixed bottom-3 left-3 top-3 z-40 hidden overflow-hidden rounded-[28px] bg-dock p-4 text-dock-text shadow-2xl ring-1 ring-dock-edge md:block">
        {/* ——— Déplié ——— */}
        <div className="sb-open h-full flex-col">
          <div className="flex items-center justify-between px-1">
            <Link href="/collection" className="flex items-center" aria-label="Collection">
              <Logo variant="lockup" size={28} />
            </Link>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={openPalette} title="Recherche rapide (⌘K)" aria-label="Recherche rapide" className={`${roundBtn} !h-8 !w-8`}>
                <SearchIcon size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                title="Replier la navigation"
                aria-label="Replier la navigation"
                className="flex h-8 w-8 items-center justify-center rounded-full text-dock-faint transition hover:bg-dock-raised hover:text-dock-text"
              >
                <PanelLeftClose size={15} aria-hidden />
              </button>
            </div>
          </div>

          {/* Le chiffre de la collection, puis l'action principale */}
          <Link href="/collection" className="mt-4 block rounded-2xl bg-dock-raised p-3.5 ring-1 ring-dock-edge transition hover:ring-dock-text/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dock-faint">Ma collection</p>
            <p className="display num mt-1 text-2xl font-bold leading-none">{shell ? formatEur(shell.value) : "…"}</p>
            <p className="num mt-1.5 text-xs text-dock-muted">
              {shell?.gain != null ? (
                <span className={shell.gain > 0 ? "text-gain" : shell.gain < 0 ? "text-loss" : ""}>
                  {signed(shell.gain)}
                  {gainPct != null && ` · ${gainPct > 0 ? "+" : ""}${gainPct} %`}
                </span>
              ) : shell ? (
                `${shell.count} carte${shell.count > 1 ? "s" : ""} · ${shell.sealedCount} scellé${shell.sealedCount > 1 ? "s" : ""}`
              ) : (
                " "
              )}
            </p>
          </Link>
          <div className="mt-3">
            <PhoneCaptureButton kind="detect" label="Scanner" title="Scanner une carte" icon="scan" directHref="/scanner" className="btn btn-primary w-full !py-2.5 text-sm shadow-lg shadow-accent/30" />
          </div>

          <nav className="scrollbar-none mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-1">
                <p className="px-3.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dock-faint">{g.label}</p>
                {g.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const n = item.count && shell ? item.count(shell) : 0;
                  return (
                    <Link key={item.href} href={item.href} className={linkClass(active)}>
                      <item.Icon size={19} strokeWidth={1.9} className="shrink-0" aria-hidden />
                      <span className="nav-label flex-1">{item.label}</span>
                      {n > 0 && <span className={`num text-xs ${active ? "text-white/80" : "text-dock-faint"}`}>{n}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Pied : qui, thème, déconnexion */}
          <div className="mt-3 flex items-center gap-2 border-t border-dock-edge pt-3">
            <Link href="/parametres" title="Paramètres du compte" className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-dock-raised ${settingsActive ? "bg-dock-raised" : ""}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#f4c361] text-xs font-bold text-white" aria-hidden>
                {initial}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{who}</span>
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
              aria-label="Changer de thème"
              className="flex items-center rounded-full bg-dock-raised p-0.5"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${theme === "dark" ? "bg-dock-raised text-dock-text ring-1 ring-dock-edge" : "text-dock-faint"}`}>
                <Moon size={12} aria-hidden />
              </span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${theme === "light" ? "bg-dock-raised text-dock-text ring-1 ring-dock-edge" : "text-dock-faint"}`}>
                <Sun size={12} aria-hidden />
              </span>
            </button>
            <form action={signOut}>
              <button type="submit" title="Déconnexion" aria-label="Déconnexion" className={iconBtn(false, true)}>
                <LogOut size={15} strokeWidth={1.9} aria-hidden />
              </button>
            </form>
          </div>
        </div>

        {/* ——— Rail replié : icône + libellé court pour chaque entrée ——— */}
        <div className="sb-rail h-full flex-col items-center">
          <Link href="/collection" className="flex h-9 items-center" aria-label="Collection">
            <Logo variant="mark" size={30} />
          </Link>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" onClick={openPalette} title="Recherche rapide (⌘K)" aria-label="Recherche rapide" className={roundBtn}>
              <SearchIcon size={13} aria-hidden />
            </button>
            <button type="button" onClick={toggleSidebar} title="Déplier la navigation" aria-label="Déplier la navigation" className={roundBtn}>
              <PanelLeftOpen size={14} aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <PhoneCaptureButton kind="detect" label="" title="Scanner une carte" icon="scan" directHref="/scanner" className="btn btn-primary !h-11 !w-11 !rounded-full !p-0 shadow-lg shadow-accent/30" />
            <span className="text-[10px] font-medium text-dock-muted">Scanner</span>
          </div>

          <nav className="scrollbar-none mt-3 flex w-full flex-1 flex-col gap-3 overflow-y-auto">
            {groups.map((g, gi) => (
              <div key={g.label} className={`flex flex-col gap-1 ${gi > 0 ? "border-t border-dock-edge pt-3" : ""}`}>
                {g.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const n = item.count && shell ? item.count(shell) : 0;
                  return (
                    <Link key={item.href} href={item.href} title={item.label} className={railLink(active)}>
                      <item.Icon size={18} strokeWidth={1.9} aria-hidden />
                      {/* Compteur dans le coin de la case, à côté de l'icône, jamais dessus */}
                      {n > 0 && (
                        <span
                          className={`num absolute right-1.5 top-1 min-w-[16px] rounded-full px-1 text-center text-[9px] font-semibold leading-4 ${
                            active ? "bg-white/25 text-white" : "bg-accent/15 text-accent-strong"
                          }`}
                        >
                          {n}
                        </span>
                      )}
                      <span className="max-w-full truncate px-1 text-[9.5px] font-medium leading-none">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-2 flex w-full flex-col items-center gap-1.5 border-t border-dock-edge pt-3">
            <Link
              href="/parametres"
              title="Paramètres du compte"
              aria-label="Paramètres du compte"
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#f4c361] text-xs font-bold text-white ring-2 transition hover:ring-accent/50 ${settingsActive ? "ring-accent" : "ring-transparent"}`}
            >
              {initial}
            </Link>
            <button type="button" onClick={toggleTheme} title={theme === "dark" ? "Thème clair" : "Thème sombre"} aria-label="Changer de thème" className={iconBtn()}>
              {theme === "dark" ? <Sun size={15} strokeWidth={1.9} aria-hidden /> : <Moon size={15} strokeWidth={1.9} aria-hidden />}
            </button>
            <form action={signOut}>
              <button type="submit" title="Déconnexion" aria-label="Déconnexion" className={iconBtn(false, true)}>
                <LogOut size={15} strokeWidth={1.9} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ——— Navigation mobile : barre haute + dock bas ——— */}
      <MobileNav pathname={pathname} shell={shell} theme={theme} onToggleTheme={toggleTheme} onOpenPalette={openPalette} />

      {/* ——— Contenu ——— */}
      <ImageGate />
      <CommandPalette />
      {shell && !shell.displayName && <DisplayNameGate />}
      <div className="app-main">{children}</div>
    </>
  );
}
