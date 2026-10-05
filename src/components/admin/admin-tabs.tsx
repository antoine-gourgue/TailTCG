"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Layers, Package, Server } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble", Icon: LayoutDashboard, exact: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", Icon: Users },
  { href: "/admin/collections", label: "Collections", Icon: Layers },
  { href: "/admin/jeu", label: "Jeu", Icon: Package },
  { href: "/admin/systeme", label: "Système", Icon: Server },
];

/** Onglets du back-office : pilules (actif en dégradé), défilement horizontal sur mobile */
export function AdminTabs({ users, systemWarn }: { users: number; systemWarn: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-none -mx-4 mb-6 mt-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:inline-flex sm:max-w-full sm:gap-1 sm:rounded-full sm:bg-surface sm:p-1 sm:px-1 sm:ring-1 sm:ring-ring">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition ${
              active
                ? "bg-gradient-to-r from-accent to-accent-strong font-semibold text-white shadow-lg shadow-accent/30"
                : "bg-surface text-muted ring-1 ring-ring hover:text-foreground sm:bg-transparent sm:ring-0"
            }`}
          >
            <t.Icon size={14} aria-hidden />
            {t.label}
            {t.href === "/admin/utilisateurs" && <span className={`num text-[11px] ${active ? "text-white/75" : "text-faint"}`}>{users}</span>}
            {t.href === "/admin/systeme" && systemWarn && <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="à surveiller" />}
          </Link>
        );
      })}
    </nav>
  );
}
