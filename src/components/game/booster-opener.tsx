"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Infinity as InfinityIcon, LayoutGrid, Package, Search, Sparkles } from "lucide-react";
import { openBooster } from "@/app/boosters/actions";
import type { PlayableSet } from "@/lib/game-sets";
import { BoosterStage } from "@/components/game/booster-stage";
import { PackArt, hueOf } from "@/components/game/pack-art";
import { Sheet } from "@/components/sheet";
import { SetLogo } from "@/components/game/set-logo";
import { formatCountdown, settleStock, UNLIMITED_BOOSTERS, type Profile } from "@/lib/game";

export type SetOption = PlayableSet;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Panneau d'ouverture du hub : un carrousel où le paquet actif domine, les
 * voisins en retrait, une lueur teintée du set ; en dessous le set, ton
 * avancement et le bouton « Ouvrir ». Les autres sets sont dans une feuille
 * de recherche. `initialSetId` (lien « Rejouer », fiche carte) met ce set en
 * tête du carrousel.
 */
export function BoosterOpener({
  profile: initialProfile,
  featured: featuredIn,
  sets,
  serverNow,
  ownedBySet,
  lastRareAt,
  initialSetId,
}: {
  profile: Profile;
  featured: SetOption[];
  sets: SetOption[];
  serverNow: number;
  /** Cartes distinctes possédées par set (collection virtuelle) */
  ownedBySet: Record<string, number>;
  /** Date (ISO) du dernier tirage holo ou mieux, par set */
  lastRareAt: Record<string, string>;
  initialSetId?: string;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [now, setNow] = useState(serverNow);
  const [chosen, setChosen] = useState<SetOption | null>(null);
  const [active, setActive] = useState(0);
  const [allOpen, setAllOpen] = useState(false);
  const [q, setQ] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);

  // Le set demandé passe en tête, sans doublon
  const featured = (() => {
    const wanted = initialSetId ? sets.find((s) => s.id === initialSetId) : null;
    if (!wanted) return featuredIn;
    return [wanted, ...featuredIn.filter((s) => s.id !== wanted.id)];
  })();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { stock, nextAt } = settleStock(profile, now);
  const canOpen = UNLIMITED_BOOSTERS || stock > 0;
  const current = featured[active] ?? featured[0] ?? null;
  const hue = current ? hueOf(current.id) : 0;
  const needle = normalize(q.trim());
  const results = needle
    ? sets.filter((s) => normalize(`${s.name} ${s.serie} ${s.id}`).includes(needle)).slice(0, 40)
    : sets.slice(0, 40);
  const owned = current ? ownedBySet[current.id] ?? 0 : 0;
  const rareAt = current ? lastRareAt[current.id] : undefined;

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    Array.from(el.querySelectorAll<HTMLElement>("[data-pack]")).forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActive((a) => (a === best ? a : best));
  }
  function goTo(i: number) {
    const el = trackRef.current;
    el?.querySelectorAll<HTMLElement>("[data-pack]")[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
  function pick(s: SetOption) {
    setAllOpen(false);
    setChosen(s);
  }

  return (
    <section
      className="panel relative flex flex-col items-center overflow-hidden !p-4 sm:!p-5"
      style={{ background: `radial-gradient(60% 55% at 50% 38%, hsl(${hue} 70% 45% / .3), var(--surface) 70%)` }}
    >
      {/* Réserve, accès à tous les sets, flèches */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="seg inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-accent-strong" data-on="true">
            {UNLIMITED_BOOSTERS ? <InfinityIcon size={14} aria-hidden /> : <Package size={14} aria-hidden />}
            {UNLIMITED_BOOSTERS ? "Illimité" : `${stock} booster${stock > 1 ? "s" : ""}${nextAt == null ? "" : ` · +1 dans ${formatCountdown(nextAt - now)}`}`}
          </span>
          <button type="button" onClick={() => setAllOpen(true)} className="seg inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-muted hover:text-foreground">
            <Search size={13} aria-hidden /> Tous les sets <span className="num text-[11px] opacity-70">{sets.length}</span>
          </button>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <button type="button" onClick={() => goTo(Math.max(0, active - 1))} disabled={active === 0} aria-label="Set précédent" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground disabled:opacity-30">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => goTo(Math.min(featured.length - 1, active + 1))} disabled={active >= featured.length - 1} aria-label="Set suivant" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground disabled:opacity-30">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>

      {/* Carrousel de paquets */}
      {featured.length === 0 ? (
        <p className="relative z-10 py-20 text-sm text-muted">Aucun set disponible pour le moment.</p>
      ) : (
        <div className="relative z-10 -mx-4 w-[calc(100%+2rem)] sm:-mx-5 sm:w-[calc(100%+2.5rem)]">
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="scrollbar-none flex snap-x snap-mandatory items-center gap-[4vw] overflow-x-auto px-[calc(50%-min(28vw,110px))] py-5 sm:gap-8"
            aria-label="Boosters disponibles"
          >
            {featured.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.id}
                  data-pack
                  type="button"
                  onClick={() => (on ? pick(s) : goTo(i))}
                  aria-label={on ? `Ouvrir un booster ${s.name}` : `Voir ${s.name}`}
                  aria-current={on ? "true" : undefined}
                  className={`w-[min(56vw,220px)] shrink-0 snap-center transition-[transform,opacity,filter] duration-300 ease-out ${
                    on ? "scale-100 opacity-100 animate-[pack-float_5s_ease-in-out_infinite]" : "scale-[0.72] opacity-45 blur-[1px] hover:opacity-70"
                  }`}
                >
                  <PackArt set={s} shine={on} className="w-full" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Set actif + actions */}
      {current && (
        <div className="relative z-10 flex w-full flex-col items-center gap-3 pb-1 text-center">
          <div className="flex items-center gap-1.5">
            {featured.map((s, i) => (
              <button key={s.id} type="button" onClick={() => goTo(i)} aria-label={s.name} className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-accent" : "w-1.5 bg-edge-strong hover:bg-muted"}`} />
            ))}
          </div>
          <div>
            <p className="label-xs text-muted">
              {current.serie} · <span className="num">{current.total}</span> cartes
            </p>
            <p className="display mt-0.5 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">{current.name}</p>
            <p className="num mt-1 text-xs text-muted">
              {owned > 0 ? (
                <>
                  Tu as <span className="font-semibold text-foreground">{owned} / {current.total}</span>
                </>
              ) : (
                "Aucune carte de ce set pour l’instant"
              )}
              {rareAt && <span> · dernière rare {since(rareAt)}</span>}
            </p>
          </div>
          <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => pick(current)} disabled={!canOpen} className="btn btn-primary w-full !py-3 text-[15px] shadow-lg shadow-accent/30 sm:w-auto sm:!px-9">
              <Sparkles size={16} aria-hidden />
              {canOpen ? "Ouvrir le booster" : `Prochain dans ${nextAt ? formatCountdown(nextAt - now) : "…"}`}
            </button>
            <Link href={`/boosters/collection?set=${encodeURIComponent(current.id)}`} className="btn btn-ghost w-full sm:w-auto">
              <LayoutGrid size={15} aria-hidden />
              Ma collection du set
            </Link>
          </div>
        </div>
      )}

      {/* Tous les sets */}
      <Sheet
        open={allOpen}
        onClose={() => setAllOpen(false)}
        label="Tous les sets"
        size="md"
        flush
        header={
          <div className="min-w-0 flex-1">
            <p className="display text-base font-semibold">Tous les sets</p>
            <p className="mt-0.5 text-sm text-muted">{sets.length} sets jouables, jusqu&apos;au Set de base de 1999.</p>
          </div>
        }
      >
        <div className="border-b border-edge px-5 py-3">
          <input type="search" value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Nom du set, série…" aria-label="Chercher un set" className="pill-input text-[13px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))]">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Aucun set ne correspond.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((s) => {
                const n = ownedBySet[s.id] ?? 0;
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => pick(s)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-raised active:bg-raised">
                      <span className="flex h-8 w-12 shrink-0 items-center justify-center">
                        <SetLogo logo={s.logo} className="max-h-8 max-w-full object-contain" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted">{s.serie}</span>
                      </span>
                      <span className="num shrink-0 text-right text-xs text-faint">
                        {n > 0 ? (
                          <>
                            <span className="text-gain">{n}</span> / {s.total}
                          </>
                        ) : (
                          `${s.total} cartes`
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!needle && sets.length > 40 && <p className="px-3 py-3 text-center text-xs text-faint">Cherche un nom pour voir les autres.</p>}
        </div>
      </Sheet>

      {chosen && (
        <BoosterStage
          set={chosen}
          onOpen={openBooster}
          onOpened={(res) => {
            setProfile(res.profile);
            setNow(Date.now());
          }}
          onClose={() => {
            setChosen(null);
            router.refresh();
          }}
          unlimited={UNLIMITED_BOOSTERS}
          stock={stock}
          nextAt={nextAt}
          now={now}
        />
      )}
    </section>
  );
}

/** « il y a 2 h », « hier », « il y a 5 j » */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}
