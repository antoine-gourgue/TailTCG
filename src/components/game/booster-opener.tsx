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
import { formatCountdown, settleStock, UNLIMITED_BOOSTERS, type Profile } from "@/lib/game";

export type SetOption = PlayableSet;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Accueil des boosters, épuré et centré sur le paquet : un carrousel où le
 * paquet actif domine, les voisins en retrait ; une lueur teintée du set
 * derrière ; en dessous le nom et un grand bouton « Ouvrir ». Tous les
 * autres sets sont dans une feuille de recherche.
 */
export function BoosterOpener({
  profile: initialProfile,
  featured,
  sets,
  serverNow,
}: {
  profile: Profile;
  featured: SetOption[];
  sets: SetOption[];
  serverNow: number;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [now, setNow] = useState(serverNow);
  const [chosen, setChosen] = useState<SetOption | null>(null);
  const [active, setActive] = useState(0);
  const [allOpen, setAllOpen] = useState(false);
  const [q, setQ] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);

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
    <div className="relative flex flex-col items-center">
      {/* Lueur d'ambiance, teinte du set actif */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[62%] transition-[background] duration-500"
        style={{
          background: `radial-gradient(70% 60% at 50% 30%, hsl(${hue} 70% 45% / .28), transparent 70%)`,
        }}
      />

      {/* Réserve */}
      <div className="relative z-10 mb-1 flex items-center gap-2.5 rounded-full border border-edge bg-surface/80 py-1.5 pl-1.5 pr-4 text-sm backdrop-blur">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          {UNLIMITED_BOOSTERS ? <InfinityIcon size={15} aria-hidden /> : <Package size={15} aria-hidden />}
        </span>
        {UNLIMITED_BOOSTERS ? (
          <span className="font-medium">Boosters illimités</span>
        ) : (
          <span>
            <span className="num font-semibold">{stock}</span>
            <span className="font-medium"> booster{stock > 1 ? "s" : ""}</span>
            <span className="text-muted">
              {nextAt == null ? ` · réserve pleine` : ` · +1 dans ${formatCountdown(nextAt - now)}`}
            </span>
          </span>
        )}
      </div>

      {/* Carrousel de paquets */}
      {featured.length === 0 ? (
        <p className="relative z-10 py-20 text-sm text-muted">Aucun set disponible pour le moment.</p>
      ) : (
        <div className="relative z-10 w-full">
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="scrollbar-none flex snap-x snap-mandatory items-center gap-[5vw] overflow-x-auto px-[calc(50%-min(35vw,150px))] py-6"
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
                  className={`w-[min(70vw,300px)] shrink-0 snap-center transition-[transform,opacity,filter] duration-300 ease-out ${
                    on
                      ? "scale-100 opacity-100 animate-[pack-float_5s_ease-in-out_infinite]"
                      : "scale-[0.72] opacity-40 blur-[1px] hover:opacity-70"
                  }`}
                >
                  <PackArt set={s} shine={on} className="w-full" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => goTo(Math.max(0, active - 1))}
            disabled={active === 0}
            aria-label="Set précédent"
            className="absolute left-1 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface/90 text-muted shadow-lg backdrop-blur transition hover:text-foreground disabled:opacity-0 sm:flex"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(featured.length - 1, active + 1))}
            disabled={active >= featured.length - 1}
            aria-label="Set suivant"
            className="absolute right-1 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface/90 text-muted shadow-lg backdrop-blur transition hover:text-foreground disabled:opacity-0 sm:flex"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}

      {/* Set actif + actions */}
      {current && (
        <div className="relative z-10 flex flex-col items-center gap-4 pb-2">
          <div className="flex items-center gap-1.5">
            {featured.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={s.name}
                className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-accent" : "w-1.5 bg-edge-strong hover:bg-muted"}`}
              />
            ))}
          </div>
          <div className="text-center">
            <p className="display text-2xl font-bold tracking-tight sm:text-3xl">{current.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {current.serie} · <span className="num">{current.total}</span> cartes · 5 par booster
            </p>
          </div>
          <button
            type="button"
            onClick={() => pick(current)}
            disabled={!canOpen}
            className="btn btn-primary w-full max-w-xs !py-3.5 text-base shadow-[0_10px_30px_var(--accent-soft)] sm:w-auto sm:!px-12"
          >
            <Sparkles size={17} aria-hidden />
            {canOpen ? "Ouvrir le booster" : `Prochain dans ${nextAt ? formatCountdown(nextAt - now) : "…"}`}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAllOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-raised hover:text-foreground"
            >
              <Search size={14} aria-hidden />
              Tous les sets <span className="num text-faint">{sets.length}</span>
            </button>
            <span aria-hidden className="text-faint">·</span>
            <Link
              href="/boosters/collection"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-raised hover:text-foreground"
            >
              <LayoutGrid size={14} aria-hidden />
              Ma collection
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
            <p className="mt-0.5 text-sm text-muted">
              {sets.length} sets jouables, jusqu&apos;au Set de base de 1999.
            </p>
          </div>
        }
      >
        <div className="border-b border-edge px-5 py-3">
          <div className="relative">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom du set, série…"
              className="field !pl-9 text-[13px]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))]">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Aucun set ne correspond.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-raised active:bg-raised"
                  >
                    <span className="flex h-8 w-12 shrink-0 items-center justify-center">
                      <SetLogo logo={s.logo} className="max-h-8 max-w-full object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted">{s.serie}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-faint">{s.total} cartes</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!needle && sets.length > 40 && (
            <p className="px-3 py-3 text-center text-xs text-faint">Cherche un nom pour voir les autres.</p>
          )}
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
    </div>
  );
}

/** Logo d'un set, icône de paquet si l'image manque */
function SetLogo({ logo, className }: { logo: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) return <Package size={22} className="text-faint" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${logo}.webp`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
