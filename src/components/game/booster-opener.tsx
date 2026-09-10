"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Infinity as InfinityIcon, Package, Search } from "lucide-react";
import { openBooster } from "@/app/boosters/actions";
import { BoosterStage, type StageSet } from "@/components/game/booster-stage";
import { formatCountdown, MAX_STOCK, settleStock, UNLIMITED_BOOSTERS, type Profile } from "@/lib/game";

export type SetOption = StageSet;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Choix du set (les derniers à la une, tous en recherche) puis scène
 * d'ouverture plein écran. La réserve et le compte à rebours vivent ici.
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

  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            {UNLIMITED_BOOSTERS ? <InfinityIcon size={18} aria-hidden /> : <Package size={18} aria-hidden />}
          </span>
          <div>
            {UNLIMITED_BOOSTERS ? (
              <>
                <p className="text-sm font-medium">Boosters illimités</p>
                <p className="text-xs text-muted">
                  Phase de test — la limite d&apos;un booster toutes les 12 h reviendra ensuite.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        <Link href="/boosters/collection" className="btn btn-ghost text-[13px]">
          Ma collection virtuelle
        </Link>
      </div>

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
            {sets.length} sets jouables au total — les autres sont dans la recherche, jusqu&apos;au Set de
            base de 1999.
          </p>
        </section>
      )}

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
