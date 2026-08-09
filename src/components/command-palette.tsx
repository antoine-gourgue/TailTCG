"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  NotebookTabs,
  SearchIcon,
  Star,
  MapPin,
  BarChart3,
  Settings,
  History,
  RectangleVertical,
  CornerDownLeft,
} from "lucide-react";

/** minuscules sans accents */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const PAGES = [
  { href: "/", label: "Collection", Icon: LayoutGrid },
  { href: "/classeurs", label: "Classeurs", Icon: NotebookTabs },
  { href: "/recherche", label: "Ajouter une carte", Icon: SearchIcon },
  { href: "/wishlist", label: "Recherchées", Icon: Star },
  { href: "/boutiques", label: "Boutiques", Icon: MapPin },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/journal", label: "Journal", Icon: History },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
];

type PaletteCard = {
  id: string;
  name: string;
  set: string;
  localId: string;
  sold: boolean;
};
type PaletteData = { cards: PaletteCard[]; binders: { id: string; name: string }[] };

let dataCache: PaletteData | null = null;

type Row = {
  href: string;
  label: string;
  sub?: string;
  group: string;
  Icon: typeof LayoutGrid;
};

export const OPEN_PALETTE_EVENT = "tailtcg:palette";

/**
 * Palette de commande globale : ⌘K / Ctrl+K, ou l'événement
 * OPEN_PALETTE_EVENT (loupe mobile). Navigue vers pages, classeurs, cartes.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<PaletteData | null>(dataCache);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setSel(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      setOpen(true);
      setQ("");
      setSel(0);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open || dataCache) return;
    fetch("/api/palette")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PaletteData | null) => {
        if (j) {
          dataCache = j;
          setData(j);
        }
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const needle = normalize(q.trim());

  const pageRows: Row[] = PAGES.filter(
    (p) => !needle || normalize(p.label).includes(needle)
  ).map((p) => ({ href: p.href, label: p.label, group: "Pages", Icon: p.Icon }));

  const binderRows: Row[] = (data?.binders ?? [])
    .filter((b) => !needle || normalize(b.name).includes(needle))
    .map((b) => ({
      href: `/classeurs/${b.id}`,
      label: b.name,
      group: "Classeurs",
      Icon: NotebookTabs,
    }));

  const cardRows: Row[] = needle
    ? (data?.cards ?? [])
        .filter((c) =>
          normalize(`${c.name} ${c.set} ${c.localId}`).includes(needle)
        )
        .slice(0, 8)
        .map((c) => ({
          href: `/carte/${c.id}`,
          label: c.name,
          sub: `${c.set} · ${c.localId}${c.sold ? " · vendue" : ""}`,
          group: "Mes cartes",
          Icon: RectangleVertical,
        }))
    : [];

  const rows = [...pageRows, ...binderRows, ...cardRows];
  const selIndex = Math.min(sel, Math.max(rows.length - 1, 0));

  function go(row: Row | undefined) {
    if (!row) return;
    setOpen(false);
    router.push(row.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((v) => Math.min(v + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(rows[selIndex]);
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche rapide"
    >
      <div
        className="panel rise-in w-full max-w-lg overflow-hidden !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-edge px-4">
          <SearchIcon size={16} className="shrink-0 text-faint" aria-hidden />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onInputKey}
            autoFocus
            placeholder="Carte, classeur, page…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded-md border border-edge px-1.5 py-0.5 text-[10px] text-faint sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">
              Aucun résultat pour « {q} ».
            </p>
          )}
          {rows.map((row, i) => {
            const header =
              row.group !== lastGroup ? (
                <p key={`h-${row.group}`} className="label-xs px-3 pb-1 pt-2.5">
                  {row.group}
                </p>
              ) : null;
            lastGroup = row.group;
            const active = i === selIndex;
            return (
              <div key={`${row.href}-${i}`}>
                {header}
                <button
                  type="button"
                  onClick={() => go(row)}
                  onMouseEnter={() => setSel(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-accent-soft text-accent-strong"
                      : "text-foreground"
                  }`}
                >
                  <row.Icon size={15} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  <span className="truncate">{row.label}</span>
                  {row.sub && (
                    <span className="min-w-0 truncate text-xs text-muted">
                      {row.sub}
                    </span>
                  )}
                  {active && (
                    <CornerDownLeft
                      size={13}
                      className="ml-auto shrink-0 text-faint"
                      aria-hidden
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
