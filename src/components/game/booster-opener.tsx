"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Package, Search, Sparkles } from "lucide-react";
import { openBooster, type DrawnCard, type OpenResult } from "@/app/boosters/actions";
import { CardImage } from "@/components/card-image";
import { CardBack } from "@/components/game/card-back";
import { Toast } from "@/components/toast";
import {
  formatCountdown,
  MAX_STOCK,
  settleStock,
  TIER_LABEL,
  type Profile,
  type Tier,
} from "@/lib/game";

export type SetOption = {
  id: string;
  name: string;
  serie: string;
  logo: string | null;
  total: number;
};

type Pack = Exclude<OpenResult, { error: string }>;

const TIER_CLASS: Record<Tier, string> = {
  common: "!bg-neutral-700/90 !text-neutral-100",
  uncommon: "!bg-emerald-700/90 !text-emerald-50",
  rare: "!bg-sky-700/90 !text-sky-50",
  holo: "!bg-violet-700/90 !text-violet-50",
  ultra: "!bg-amber-500/95 !text-black",
  secret: "!bg-gradient-to-r !from-amber-300 !via-rose-300 !to-sky-300 !text-black",
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Ouverture de boosters : réserve et compte à rebours, choix du set (les
 * derniers à la une, tous en recherche), puis les cartes face cachée à
 * retourner une à une.
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
  const [q, setQ] = useState("");
  const [pack, setPack] = useState<Pack | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);

  // Le compte à rebours avance toutes les 30 s
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { stock, nextAt } = settleStock(profile, now);
  const needle = normalize(q.trim());
  const results = needle
    ? sets.filter((s) => normalize(`${s.name} ${s.serie} ${s.id}`).includes(needle)).slice(0, 40)
    : [];

  function open(set: SetOption) {
    if (pending || stock < 1) return;
    start(async () => {
      const res = await openBooster(set.id);
      if ("error" in res) {
        setToast({ message: res.error, tone: "error" });
        return;
      }
      setPack(res);
      setRevealed(new Set());
      setProfile(res.profile);
      setNow(Date.now());
    });
  }
  function reveal(i: number) {
    setRevealed((r) => new Set(r).add(i));
  }
  function revealAll() {
    if (!pack) return;
    setRevealed(new Set(pack.cards.map((_, i) => i)));
  }
  function finish() {
    setPack(null);
    setRevealed(new Set());
    router.refresh();
  }

  const allRevealed = pack != null && revealed.size >= pack.cards.length;
  const newCount = pack ? pack.cards.filter((c) => c.isNew).length : 0;

  const stockLine = (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Package size={18} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium">
            <span className="num">{stock}</span> booster{stock > 1 ? "s" : ""} disponible
            {stock > 1 ? "s" : ""}
            <span className="text-faint"> · réserve de {MAX_STOCK}</span>
          </p>
          <p className="text-xs text-muted">
            {nextAt == null
              ? "Réserve pleine — le compteur repart à la prochaine ouverture."
              : `Prochain booster dans ${formatCountdown(nextAt - now)}`}
          </p>
        </div>
      </div>
      <Link href="/boosters/collection" className="btn btn-ghost text-[13px]">
        Ma collection virtuelle
      </Link>
    </div>
  );

  // ——— Ouverture en cours : cartes face cachée ———
  if (pack) {
    return (
      <div className="flex flex-col gap-5">
        {stockLine}
        <div className="panel p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="display text-lg font-semibold">{pack.setName}</p>
              <p className="text-sm text-muted">
                {allRevealed
                  ? newCount > 0
                    ? `${newCount} nouvelle${newCount > 1 ? "s" : ""} carte${newCount > 1 ? "s" : ""} pour ta collection virtuelle`
                    : "Que des doublons cette fois, ça arrive."
                  : "Touche une carte pour la retourner."}
              </p>
            </div>
            {!allRevealed && (
              <button type="button" onClick={revealAll} className="btn btn-ghost text-[13px]">
                Tout retourner
              </button>
            )}
          </div>

          <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {pack.cards.map((c, i) => (
              <li key={c.id} className="w-[30%] sm:w-[18%]">
                <FlipCard card={c} flipped={revealed.has(i)} onFlip={() => reveal(i)} />
              </li>
            ))}
          </ul>

          {allRevealed && (
            <div className="sheet-actions mt-6 justify-center">
              <button type="button" onClick={finish} className="btn btn-ghost">
                Choisir un autre set
              </button>
              <button
                type="button"
                onClick={() => {
                  const set = sets.find((s) => s.id === pack.setId) ?? featured.find((s) => s.id === pack.setId);
                  if (set) open(set);
                }}
                disabled={pending || stock < 1}
                className="btn btn-primary"
              >
                <Package size={15} aria-hidden />
                {stock < 1 ? "Plus de booster" : pending ? "Ouverture…" : "Ouvrir un autre booster"}
              </button>
            </div>
          )}
        </div>
        {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
      </div>
    );
  }

  // ——— Set choisi : le booster à ouvrir ———
  if (chosen) {
    return (
      <div className="flex flex-col gap-5">
        {stockLine}
        <div className="panel flex flex-col items-center gap-5 p-6 text-center sm:p-8">
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="btn btn-ghost self-start !px-2.5 text-[13px]"
          >
            <ChevronLeft size={14} aria-hidden />
            Autre set
          </button>
          <BoosterPack set={chosen} pending={pending} />
          <div>
            <p className="display text-xl font-semibold">{chosen.name}</p>
            <p className="text-sm text-muted">
              {chosen.serie} · <span className="num">{chosen.total}</span> cartes · 5 cartes par booster
            </p>
          </div>
          <button
            type="button"
            onClick={() => open(chosen)}
            disabled={pending || stock < 1}
            className="btn btn-primary !px-8 !py-3 text-base"
          >
            <Sparkles size={16} aria-hidden />
            {stock < 1
              ? `Prochain booster dans ${nextAt ? formatCountdown(nextAt - now) : "…"}`
              : pending
                ? "Ouverture…"
                : "Ouvrir le booster"}
          </button>
        </div>
        {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
      </div>
    );
  }

  // ——— Choix du set ———
  return (
    <div className="flex flex-col gap-5">
      {stockLine}

      <div className="relative sm:max-w-md">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un set, une série…"
          className="field !pl-9 text-[13px]"
        />
      </div>

      {needle ? (
        results.length === 0 ? (
          <p className="text-sm text-muted">Aucun set ne correspond.</p>
        ) : (
          <ul className="panel flex flex-col p-2">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setChosen(s)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-raised"
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
        )
      ) : (
        <section>
          <p className="label-xs mb-3">Derniers sets</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featured.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setChosen(s)}
                  className="panel group flex w-full flex-col gap-3 p-4 text-left transition hover:border-accent hover:shadow-lg"
                >
                  <span className="flex h-14 items-center justify-center">
                    <SetLogo
                      logo={s.logo}
                      className="max-h-14 max-w-full object-contain transition group-hover:scale-105"
                    />
                  </span>
                  <span className="mt-auto min-w-0">
                    <span className="block truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                      {s.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">
                      {s.serie} · <span className="num">{s.total}</span> cartes
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">
            Tous les autres sets sont dans la recherche ci-dessus, jusqu&apos;au Set de base de 1999.
          </p>
        </section>
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
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

/** Le booster fermé : un paquet vertical au logo du set */
function BoosterPack({ set, pending }: { set: SetOption; pending: boolean }) {
  return (
    <div
      className={`relative h-64 w-44 overflow-hidden rounded-xl border border-white/10 shadow-[0_18px_40px_rgba(0,0,0,.5)] transition ${
        pending ? "animate-pulse" : ""
      }`}
      style={{ background: "linear-gradient(160deg, #2b2a31, #141317 60%, #0e0d10)" }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-5 bg-black/40 [clip-path:polygon(0_0,100%_0,100%_100%,0_60%)]" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-5 bg-black/40 [clip-path:polygon(0_40%,100%_0,100%_100%,0_100%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5">
        <SetLogo logo={set.logo} className="max-h-20 max-w-full object-contain drop-shadow-lg" />
        <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
          Booster
        </span>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
    </div>
  );
}

/** Carte face cachée qui pivote quand on la touche */
export function FlipCard({ card, flipped, onFlip }: { card: DrawnCard; flipped: boolean; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={flipped}
      aria-label={flipped ? card.name : "Retourner la carte"}
      className="block w-full [perspective:1200px]"
    >
      <div
        className={`relative aspect-[63/88] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : "hover:-translate-y-1"
        }`}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <CardBack />
        </div>
        {/* card-tile impose position:relative : la face est un conteneur à part */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="card-tile h-full w-full">
            <CardImage base={card.image} alt={card.name} quality="high" />
            <span className={`tile-badge bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap ${TIER_CLASS[card.tier]}`}>
              {TIER_LABEL[card.tier]}
            </span>
            {card.isNew && (
              <span className="tile-badge left-1.5 top-1.5 !bg-accent !text-accent-ink">Nouvelle</span>
            )}
          </div>
        </div>
      </div>
      <p className={`mt-1.5 truncate text-center text-xs transition ${flipped ? "text-foreground" : "text-transparent"}`}>
        {card.name}
      </p>
    </button>
  );
}
