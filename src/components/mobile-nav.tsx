"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Award,
  Boxes,
  ChevronRight,
  History,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Moon,
  NotebookTabs,
  Package,
  Plus,
  ScanLine,
  SearchIcon,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/actions";
import { formatEur } from "@/lib/domain";
import type { ShellData } from "@/lib/shell-store";
import { Logo } from "@/components/logo";

// Navigation mobile du système « Dock » : barre haute sobre (logo, recherche,
// avatar) et dock bas profond — Collection · Cartes · [Scanner] · Scellés ·
// Menu. Le Scanner, rond et surélevé, est l'action principale sous le pouce ;
// le Menu ouvre une sheet avec le reste de la navigation, l'ajout, le thème
// et le compte.

type Tab = { href: string; label: string; Icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/collection", label: "Collection", Icon: LayoutDashboard },
  { href: "/cartes", label: "Cartes", Icon: LayoutGrid },
  { href: "/scelles", label: "Scellés", Icon: Boxes },
];

/** Pages accessibles depuis la sheet Menu */
const MORE: Tab[] = [
  { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
  { href: "/recherchees", label: "Recherchées", Icon: Star },
  { href: "/boosters", label: "Boosters", Icon: Package },
  { href: "/pregrades", label: "Pré-gradées", Icon: Award },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/journal", label: "Journal", Icon: History },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
];

/** Glissement vers le bas au-delà duquel la sheet se ferme */
const CLOSE_DY = 90;

export function isTabActive(href: string, pathname: string): boolean {
  if (href === "/cartes") return pathname.startsWith("/carte");
  if (href === "/catalogue") return pathname.startsWith("/catalogue") || pathname.startsWith("/ajouter") || pathname.startsWith("/extensions");
  if (href === "/collection") return pathname.startsWith("/collection");
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

  const more = shell?.isAdmin ? [...MORE, { href: "/admin", label: "Admin", Icon: ShieldCheck }] : MORE;
  const initial = (shell?.displayName?.[0] ?? shell?.email?.[0] ?? "?").toUpperCase();
  const menuActive = more.some((m) => isTabActive(m.href, pathname)) || pathname.startsWith("/catalogue") || pathname.startsWith("/ajouter") || pathname.startsWith("/extensions");

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

  const row = "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition hover:bg-raised active:bg-raised";

  return (
    <>
      {/* ——— Barre haute : logo, recherche, avatar ——— */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/collection" className="flex items-center" aria-label="Collection">
            <Logo variant="lockup" size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Recherche rapide"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition active:bg-raised"
            >
              <SearchIcon size={16} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Menu et compte"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#f4c361] text-xs font-bold text-white"
            >
              {initial}
            </button>
          </div>
        </div>
      </header>

      {/* ——— Dock bas : profond, Scanner surélevé au centre ——— */}
      <nav
        className="fixed left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-[420px] -translate-x-1/2 items-end justify-between rounded-[28px] bg-dock px-2 pb-2 pt-2 text-dock-text shadow-[0_14px_40px_rgba(0,0,0,.55)] ring-1 ring-dock-edge md:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        aria-label="Navigation"
      >
        {TABS.slice(0, 2).map((t) => (
          <TabLink key={t.href} tab={t} active={isTabActive(t.href, pathname)} />
        ))}
        <Link href="/scanner" aria-label="Scanner une carte" className="-mt-7 flex w-16 flex-col items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-strong text-white shadow-[0_10px_30px_rgba(240,72,62,.45)] ring-4 ring-background transition active:scale-95">
            <ScanLine size={24} aria-hidden />
          </span>
          <span className="mt-1 text-[10px] font-semibold text-dock-muted">Scanner</span>
        </Link>
        <TabLink tab={TABS[2]} active={isTabActive(TABS[2].href, pathname)} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Menu"
          className={tabClass(open || menuActive)}
        >
          <Menu size={21} strokeWidth={open || menuActive ? 2.2 : 1.9} aria-hidden />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </nav>

      {/* ——— Sheet Menu ——— */}
      {open && (
        <div className="md:hidden">
          <div className={`fixed inset-0 z-50 bg-black/50 ${closing ? "fade-out" : ""}`} onClick={close} aria-hidden />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu et compte"
            className={`${closing ? "sheet-out" : "sheet-in"} fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl bg-surface shadow-2xl ring-1 ring-ring`}
            onAnimationEnd={(e) => {
              if (e.animationName === "sheet-out") finishClose();
            }}
          >
            {/* Zone de préhension : poignée + en-tête compte */}
            <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="cursor-grab select-none active:cursor-grabbing" style={{ touchAction: "none" }}>
              <div className="flex justify-center pt-2" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-edge-strong" />
              </div>
              <div className="flex items-center gap-3 px-5 pb-4 pt-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#f4c361] text-base font-bold text-white" aria-hidden>
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="display truncate text-base font-semibold">{shell?.displayName ?? "Mon compte"}</p>
                  <p className="truncate text-xs text-muted">{shell?.email ?? "…"}</p>
                </div>
                {shell && shell.count > 0 && (
                  <div className="text-right">
                    <p className="display num text-base font-bold leading-tight">{shell.value != null ? formatEur(shell.value) : "—"}</p>
                    <p className="num text-[11px] text-muted">
                      {shell.count} carte{shell.count > 1 ? "s" : ""}
                      {shell.sealedCount > 0 ? ` · ${shell.sealedCount} scellé${shell.sealedCount > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-edge px-2 pt-2" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
              {/* Ajouter : carte ou scellé */}
              <div className="mb-2 grid grid-cols-2 gap-2 px-1">
                <Link href="/catalogue" onClick={finishClose} className="btn btn-primary !py-2.5 text-sm">
                  <Plus size={15} aria-hidden /> Une carte
                </Link>
                <Link href="/scelles/ajouter" onClick={finishClose} className="btn btn-ghost !py-2.5 text-sm">
                  <Boxes size={15} aria-hidden /> Un scellé
                </Link>
              </div>
              {more.map((m) => {
                const active = isTabActive(m.href, pathname);
                return (
                  <Link key={m.href} href={m.href} onClick={finishClose} className={`${row} ${active ? "bg-accent-soft font-semibold text-accent-strong" : "text-foreground"}`}>
                    <m.Icon size={19} strokeWidth={1.9} className="shrink-0" aria-hidden />
                    <span className="flex-1">{m.label}</span>
                    <ChevronRight size={16} className="text-faint" aria-hidden />
                  </Link>
                );
              })}

              <div className="my-2 border-t border-edge" />

              <button type="button" onClick={onToggleTheme} className={`${row} w-full text-foreground`}>
                {theme === "dark" ? <Sun size={19} strokeWidth={1.9} aria-hidden /> : <Moon size={19} strokeWidth={1.9} aria-hidden />}
                <span className="flex-1 text-left">{theme === "dark" ? "Thème clair" : "Thème sombre"}</span>
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

/** Onglet du dock : icône et libellé, rouge quand actif */
function tabClass(active: boolean): string {
  return `flex w-16 flex-col items-center gap-1 py-1 transition ${active ? "text-accent-strong" : "text-dock-muted active:text-dock-text"}`;
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link href={tab.href} aria-label={tab.label} aria-current={active ? "page" : undefined} className={tabClass(active)}>
      <tab.Icon size={21} strokeWidth={active ? 2.2 : 1.9} aria-hidden />
      <span className="text-[10px] font-medium">{tab.label}</span>
    </Link>
  );
}
