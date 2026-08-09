"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Boxes, Server } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble", Icon: LayoutDashboard, exact: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", Icon: Users },
  { href: "/admin/contenu", label: "Contenu", Icon: Boxes },
  { href: "/admin/systeme", label: "Système", Icon: Server },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              active
                ? "border-accent/50 bg-accent-soft font-semibold text-accent-strong"
                : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
            }`}
          >
            <t.Icon size={14} aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
