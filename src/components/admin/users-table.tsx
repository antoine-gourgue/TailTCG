"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon, ArrowUp, ArrowDown } from "lucide-react";
import { formatEur } from "@/lib/domain";
import type { PerUser } from "@/lib/admin-data";

type SortKey = "value" | "cards" | "gradings" | "created" | "active";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export function UsersTable({ users }: { users: PerUser[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("value");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const needle = normalize(q.trim());
    const filtered = users.filter(
      (u) =>
        !needle ||
        normalize(`${u.email} ${u.name ?? ""}`).includes(needle)
    );
    const val = (u: PerUser) =>
      sort === "value" ? u.value
      : sort === "cards" ? u.cards
      : sort === "gradings" ? u.gradings
      : sort === "active" ? (u.lastActivity ?? u.lastSignIn ?? "")
      : (u.createdAt ?? "");
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
      return asc ? cmp : -cmp;
    });
  }, [users, q, sort, asc]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-raised px-3 py-2 text-sm">
          <SearchIcon size={14} className="text-faint" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un compte…"
            className="w-48 bg-transparent outline-none placeholder:text-faint"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="field !w-auto text-[13px]"
        >
          <option value="value">Tri : valeur</option>
          <option value="cards">Tri : cartes</option>
          <option value="gradings">Tri : pré-gradations</option>
          <option value="created">Tri : inscription</option>
          <option value="active">Tri : dernière activité</option>
        </select>
        <button
          type="button"
          onClick={() => setAsc((v) => !v)}
          className="btn btn-ghost !px-2.5 !py-1.5"
          title={asc ? "Croissant" : "Décroissant"}
        >
          {asc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
        </button>
        <span className="ml-auto text-xs text-faint">{rows.length} compte(s)</span>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left">
              <th className="label-xs px-4 py-3">Compte</th>
              <th className="label-xs px-4 py-3">Inscrit</th>
              <th className="label-xs px-4 py-3">Activité</th>
              <th className="label-xs px-4 py-3 text-right">Cartes</th>
              <th className="label-xs px-4 py-3 text-right">Valeur</th>
              <th className="label-xs px-4 py-3 text-right">Grad.</th>
              <th className="label-xs px-4 py-3 text-right">Class.</th>
              <th className="label-xs px-4 py-3">Partage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-edge/50 transition last:border-0 hover:bg-raised">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/utilisateurs/${u.id}`} className="font-medium hover:text-accent-strong">
                    {u.name ?? "— (pas de pseudo)"}
                  </Link>
                  <span className="block text-xs text-muted">{u.email}</span>
                </td>
                <td className="num px-4 py-2.5 text-muted">{fmt(u.createdAt)}</td>
                <td className="num px-4 py-2.5 text-muted">{fmt(u.lastActivity ?? u.lastSignIn)}</td>
                <td className="num px-4 py-2.5 text-right">{u.cards}</td>
                <td className="num px-4 py-2.5 text-right font-medium">{formatEur(u.value)}</td>
                <td className="num px-4 py-2.5 text-right">{u.gradings}</td>
                <td className="num px-4 py-2.5 text-right">{u.binders}</td>
                <td className="px-4 py-2.5">
                  {u.shared ? (
                    <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[11px] font-semibold text-gain">
                      {u.showValues ? "Valeurs" : "Actif"}
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
