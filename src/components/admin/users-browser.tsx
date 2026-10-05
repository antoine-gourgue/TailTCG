"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Share2 } from "lucide-react";
import type { AdminAccount } from "@/lib/admin-data";
import { activityTone, fmtInt, isDormant, relTime, shortDate } from "@/lib/admin-format";
import { formatEur } from "@/lib/domain";
import { Avatar, Badge, Dot, Spark } from "@/components/admin/admin-ui";

type Filter = "all" | "active" | "shared" | "dormant" | "banned" | "unconfirmed";
type Sort = "value" | "cards" | "sealed" | "game" | "activity" | "created";

const WEEK = 7 * 86_400_000;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

function Badges({ a, now }: { a: AdminAccount; now: number }) {
  return (
    <>
      {a.admin && <Badge tone="accent">Admin</Badge>}
      {a.shared && (
        <Badge tone="ok">
          <Share2 size={10} aria-hidden /> Vitrine
        </Badge>
      )}
      {a.banned && <Badge tone="ko">Suspendu</Badge>}
      {!a.confirmed && <Badge tone="warn">Email non confirmé</Badge>}
      {isDormant(a.lastActivity, now) && <Badge>Endormi</Badge>}
    </>
  );
}

/** Liste des comptes : recherche, filtres en puces, tri ; tableau sur desktop, cartes sur mobile */
export function UsersBrowser({ accounts, now }: { accounts: AdminAccount[]; now: number }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("value");
  const [asc, setAsc] = useState(false);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      active: accounts.filter((a) => a.lastActivity && now - new Date(a.lastActivity).getTime() <= WEEK).length,
      shared: accounts.filter((a) => a.shared).length,
      dormant: accounts.filter((a) => isDormant(a.lastActivity, now)).length,
      banned: accounts.filter((a) => a.banned).length,
      unconfirmed: accounts.filter((a) => !a.confirmed).length,
    }),
    [accounts, now],
  );

  const rows = useMemo(() => {
    const needle = norm(q.trim());
    const keep = (a: AdminAccount) => {
      if (needle && !norm(`${a.name ?? ""} ${a.email}`).includes(needle)) return false;
      if (filter === "active") return !!a.lastActivity && now - new Date(a.lastActivity).getTime() <= WEEK;
      if (filter === "shared") return a.shared;
      if (filter === "dormant") return isDormant(a.lastActivity, now);
      if (filter === "banned") return a.banned;
      if (filter === "unconfirmed") return !a.confirmed;
      return true;
    };
    const key = (a: AdminAccount): number | string =>
      sort === "value" ? (a.value ?? 0) : sort === "cards" ? a.cards : sort === "sealed" ? a.sealed : sort === "game" ? a.game : sort === "activity" ? (a.lastActivity ?? "") : (a.createdAt ?? "");
    return accounts.filter(keep).sort((x, y) => {
      const a = key(x);
      const b = key(y);
      const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return asc ? cmp : -cmp;
    });
  }, [accounts, q, filter, sort, asc, now]);

  const chips: { key: Filter; label: string; hideEmpty?: boolean }[] = [
    { key: "all", label: "Tous" },
    { key: "active", label: "Actifs 7 j" },
    { key: "shared", label: "Vitrine" },
    { key: "dormant", label: "Endormis" },
    { key: "banned", label: "Suspendus" },
    { key: "unconfirmed", label: "Non confirmés", hideEmpty: true },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo ou email…" aria-label="Chercher un compte" className="pill-input min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-sm" />
        <div className="flex flex-wrap gap-1.5">
          {chips
            .filter((c) => !c.hideEmpty || counts[c.key] > 0)
            .map((c) => (
              <button key={c.key} type="button" onClick={() => setFilter(c.key)} data-on={filter === c.key} className="seg rounded-full px-3 py-1.5 text-xs font-medium">
                {c.label} <span className="num ml-0.5 opacity-60">{counts[c.key]}</span>
              </button>
            ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="pill-select" aria-label="Trier">
            <option value="value">Valeur</option>
            <option value="cards">Cartes</option>
            <option value="sealed">Scellés</option>
            <option value="game">Jeu</option>
            <option value="activity">Dernière activité</option>
            <option value="created">Inscription</option>
          </select>
          <button type="button" onClick={() => setAsc((v) => !v)} className="btn btn-ghost !px-2.5 !py-1.5" title={asc ? "Croissant" : "Décroissant"} aria-label={asc ? "Tri croissant" : "Tri décroissant"}>
            {asc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
          </button>
        </div>
      </div>

      {rows.length === 0 && <p className="panel mt-3.5 p-8 text-center text-sm text-muted">Aucun compte ne correspond.</p>}

      {/* Desktop : tableau */}
      {rows.length > 0 && (
        <div className="panel mt-3.5 hidden px-5 pb-2 pt-4 md:block">
          <div className="grid grid-cols-[minmax(0,2.4fr)_112px_64px_64px_80px_104px_124px_16px] gap-4 border-b border-ring pb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <span>Compte</span>
            <span>Activité 30 j</span>
            <span className="text-right">Cartes</span>
            <span className="text-right">Scellés</span>
            <span className="text-right">Jeu</span>
            <span className="text-right">Valeur</span>
            <span>Dernière activité</span>
            <span />
          </div>
          <ul className="divide-y divide-ring">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/utilisateurs/${a.id}`} className="grid grid-cols-[minmax(0,2.4fr)_112px_64px_64px_80px_104px_124px_16px] items-center gap-4 py-3 transition hover:bg-raised/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={a.name ?? a.email} hue={a.hue} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {a.name ?? <span className="text-muted">Sans pseudo</span>}
                        <Badges a={a} now={now} />
                      </p>
                      <p className="mt-0.5 truncate text-xs text-faint">
                        {a.email} · inscrit le {shortDate(a.createdAt, now)}
                      </p>
                    </div>
                  </div>
                  <Spark values={a.spark} className="h-6 w-28" />
                  <span className="num text-right">{fmtInt(a.cards)}</span>
                  <span className="num text-right">{fmtInt(a.sealed)}</span>
                  <span className="num text-right">{fmtInt(a.game)}</span>
                  <span className="num text-right font-bold">{a.value != null ? formatEur(a.value) : "—"}</span>
                  <span className="flex items-center gap-2 text-[12.5px]">
                    <Dot tone={activityTone(a.lastActivity, now)} />
                    {relTime(a.lastActivity, now)}
                  </span>
                  <ChevronRight size={15} className="text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mobile : une carte par compte */}
      <ul className="mt-3.5 flex flex-col gap-2.5 md:hidden">
        {rows.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/utilisateurs/${a.id}`} className="panel block p-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={a.name ?? a.email} hue={a.hue} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {a.name ?? <span className="text-muted">Sans pseudo</span>}
                    <Badges a={a} now={now} />
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-faint">{a.email}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[
                  ["Cartes", fmtInt(a.cards)],
                  ["Scellés", fmtInt(a.sealed)],
                  ["Jeu", fmtInt(a.game)],
                  ["Valeur", a.value != null ? formatEur(a.value) : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-xl bg-raised px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</p>
                    <p className="num mt-0.5 truncate text-[13px] font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs">
                  <Dot tone={activityTone(a.lastActivity, now)} />
                  {relTime(a.lastActivity, now)}
                </span>
                <Spark values={a.spark} className="h-6 w-28" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
