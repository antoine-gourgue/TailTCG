"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  Plus,
  History,
  Award,
  ShieldCheck,
  UserRound,
  ChevronRight,
  Package,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/actions";
import { formatEur } from "@/lib/domain";
import type { ShellData } from "@/lib/shell-store";
import { Logo } from "@/components/logo";

// Navigation mobile : barre haute sobre (logo + recherche), barre d'onglets
// (Collection · Classeurs · + · Recherchées · Profil). L'onglet Profil ouvre
// une sheet avec le reste de la navigation, le thème et le compte.

type Tab = { href: string; label: string; Icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/", label: "Collection", Icon: LayoutGrid },
  { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
  { href: "/wishlist", label: "Recherchées", Icon: Star },
];

/** Pages accessibles depuis la sheet Profil */
const MORE: Tab[] = [
  { href: "/boosters", label: "Boosters", Icon: Package },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/pregrades", label: "Pré-gradées", Icon: Award },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/journal", label: "Journal", Icon: History },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
];

/** Glissement vers le bas au-delà duquel la sheet se ferme */
const CLOSE_DY = 90;

export function isTabActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/carte");
  if (href === "/recherche")
    return (
      pathname.startsWith("/recherche") ||
      pathname.startsWith("/ajouter") ||
      pathname.startsWith("/extensions")
    );
  return pathname.startsWith(href);
}

export function MobileNav({
  pathname,
  shell,
  theme,
  onToggleTheme,
  onOpenPalette,
}: {
  pathname: string;
  shell: ShellData | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenPalette: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, dy: 0, active: false });

  const more = shell?.isAdmin
    ? [...MORE, { href: "/admin", label: "Admin", Icon: ShieldCheck }]
    : MORE;
  const profileActive = more.some((m) => isTabActive(m.href, pathname));
  const initial = (shell?.displayName?.[0] ?? shell?.email?.[0] ?? "?").toUpperCase();

  function close() {
    if (!open || closing) return;
    setClosing(true);
  }
  function finishClose() {
    setOpen(false);
    setClosing(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setClosing(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Glisser la sheet vers le bas pour la fermer
  function onDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    drag.current = { startY: e.clientY, dy: 0, active: true };
    // L'animation d'entrée (fill: both) l'emporterait sur le transform inline
    if (sheetRef.current) sheetRef.current.style.animation = "none";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture indisponible : le glisser reste suivi par les events suivants
    }
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${d.dy}px)`;
  }
  function onUp() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const el = sheetRef.current;
    if (d.dy > CLOSE_DY) {
      if (el) el.style.animation = "";
      close();
    } else if (el) {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
      }, 220);
    }
    d.dy = 0;
  }

  const row =
    "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition hover:bg-raised active:bg-raised";

  return (
    <>
      {/* ——— Barre haute : logo + recherche ——— */}
      <header className="sticky top-0 z-40 border-b border-edge bg-surface/90 backdrop-blur-md md:hidden">
        <div className="flex h-13 items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="Accueil">
            <Logo variant="lockup" size={26} />
          </Link>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="Recherche rapide"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground active:bg-raised"
          >
            <SearchIcon size={18} strokeWidth={1.9} aria-hidden />
          </button>
        </div>
      </header>

      {/* ——— Dock flottant : l'onglet actif s'étire avec son libellé ——— */}
      <nav
        className="fixed inset-x-3 z-40 flex h-[62px] items-center gap-1 rounded-full border border-edge bg-surface/95 px-2 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur-md md:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        aria-label="Navigation"
      >
        {TABS.slice(0, 2).map((t) => (
          <TabLink key={t.href} tab={t} active={isTabActive(t.href, pathname)} />
        ))}
        <Link
          href="/recherche"
          aria-label="Ajouter une carte"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-md transition active:scale-95 ${
            isTabActive("/recherche", pathname)
              ? "ring-2 ring-accent/40 ring-offset-2 ring-offset-surface"
              : ""
          }`}
        >
          <Plus size={22} strokeWidth={2.4} aria-hidden />
        </Link>
        <TabLink tab={TABS[2]} active={isTabActive("/wishlist", pathname)} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={tabClass(profileActive || open)}
        >
          <UserRound size={profileActive || open ? 19 : 21} strokeWidth={profileActive || open ? 2.1 : 1.8} aria-hidden />
          {(profileActive || open) && <span className="text-[13px] font-semibold">Profil</span>}
        </button>
      </nav>

      {/* ——— Sheet Profil ——— */}
      {open && (
        <div className="md:hidden">
          <div
            className={`fixed inset-0 z-50 bg-black/50 ${closing ? "fade-out" : ""}`}
            onClick={close}
            aria-hidden
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Profil et navigation"
            className={`${
              closing ? "sheet-out" : "sheet-in"
            } fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-2xl`}
            onAnimationEnd={(e) => {
              if (e.animationName === "sheet-out") finishClose();
            }}
          >
            {/* Zone de préhension : poignée + en-tête compte */}
            <div
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="cursor-grab select-none active:cursor-grabbing"
              style={{ touchAction: "none" }}
            >
              <div className="flex justify-center pt-2" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-edge-strong" />
              </div>
              <div className="flex items-center gap-3 px-5 pb-4 pt-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-accent-strong"
                  aria-hidden
                >
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="display truncate text-base font-semibold">
                    {shell?.displayName ?? "Mon compte"}
                  </p>
                  <p className="truncate text-xs text-muted">{shell?.email ?? "…"}</p>
                </div>
                {shell && shell.count > 0 && (
                  <div className="text-right">
                    <p className="display num text-base font-bold leading-tight">
                      {shell.value != null ? formatEur(shell.value) : "—"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {shell.count} carte{shell.count > 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto border-t border-edge px-2 pt-2"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {more.map((m) => {
                const active = isTabActive(m.href, pathname);
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    onClick={finishClose}
                    className={`${row} ${
                      active ? "bg-accent-soft font-semibold text-accent-strong" : "text-foreground"
                    }`}
                  >
                    <m.Icon size={19} strokeWidth={1.9} className="shrink-0" aria-hidden />
                    <span className="flex-1">{m.label}</span>
                    <ChevronRight size={16} className="text-faint" aria-hidden />
                  </Link>
                );
              })}

              <div className="my-2 border-t border-edge" />

              <button type="button" onClick={onToggleTheme} className={`${row} w-full text-foreground`}>
                {theme === "dark" ? (
                  <Sun size={19} strokeWidth={1.9} aria-hidden />
                ) : (
                  <Moon size={19} strokeWidth={1.9} aria-hidden />
                )}
                <span className="flex-1 text-left">
                  {theme === "dark" ? "Thème clair" : "Thème sombre"}
                </span>
              </button>
              <form action={signOut}>
                <button type="submit" className={`${row} w-full text-loss`}>
                  <LogOut size={19} strokeWidth={1.9} aria-hidden />
                  <span className="flex-1 text-left">Déconnexion</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Onglet du dock : pastille avec libellé quand actif, icône seule sinon */
function tabClass(active: boolean): string {
  return active
    ? "flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent-soft px-3.5 text-accent-strong"
    : "flex h-11 flex-1 items-center justify-center text-muted transition active:text-foreground";
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link href={tab.href} aria-label={tab.label} className={tabClass(active)}>
      <tab.Icon size={active ? 19 : 21} strokeWidth={active ? 2.1 : 1.8} aria-hidden />
      {active && <span className="text-[13px] font-semibold">{tab.label}</span>}
    </Link>
  );
}
