"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Search, Sparkles, X } from "lucide-react";
import { gradeGameCards } from "@/app/boosters/actions";
import { CardImage } from "@/components/card-image";
import { FloatingBar } from "@/components/floating-bar";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { GradingReveal, type RevealItem } from "@/components/game/grading-reveal";
import type { OwnedCard } from "@/components/game/game-cards-grid";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/game";
import { play } from "@/lib/sfx";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const SCAN_MS = 1900;

/**
 * Laboratoire de gradation : on coche plusieurs cartes non gradées et on les
 * fait grader d'un coup ; une animation de scan précède les résultats.
 */
export function GradingLab({ cards, gradedCount }: { cards: OwnedCard[]; gradedCount: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [phase, setPhase] = useState<"idle" | "scanning" | "results">("idle");
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<RevealItem[]>([]);
  const [detail, setDetail] = useState<OwnedCard | null>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const tiers = useMemo(() => {
    const present = new Set(cards.map((c) => c.tier));
    return TIERS.filter((t) => present.has(t));
  }, [cards]);

  const needle = normalize(q.trim());
  const list = useMemo(
    () =>
      cards.filter(
        (c) =>
          (!needle || normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) &&
          (tierFilter === "all" || c.tier === tierFilter)
      ),
    [cards, needle, tierFilter]
  );

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAll() {
    setSel(new Set(list.map((c) => c.id)));
  }

  async function grade() {
    if (sel.size === 0 || phase === "scanning") return;
    const ids = [...sel];
    setCount(ids.length);
    setResults([]);
    setPhase("scanning");
    const started = Date.now();
    const res = await gradeGameCards(ids);
    const wait = Math.max(0, SCAN_MS - (Date.now() - started));
    window.setTimeout(() => {
      if ("error" in res) {
        setPhase("idle");
        return;
      }
      const sorted = [...res.graded]
        .sort((a, b) => b.grade.overall - a.grade.overall)
        .map((r) => ({ card: byId.get(r.id)!, grade: r.grade }))
        .filter((r) => r.card);
      setResults(sorted);
      setPhase("results");
      const best = sorted[0]?.grade.overall ?? 0;
      play(best >= 9 ? "ultra" : best >= 7 ? "rare" : "flip");
    }, wait);
  }

  function closeResults() {
    setPhase("idle");
    setResults([]);
    setSel(new Set());
    router.refresh();
  }

  const detailView: GameCardView | null = detail
    ? {
        id: detail.id,
        image: detail.image,
        name: detail.name,
        set_name: detail.setName,
        local_id: detail.localId,
        tier: detail.tier,
        grade: detail.grade,
        gradable: true,
      }
    : null;

  if (cards.length === 0) {
    return (
      <p className="rounded-xl bg-raised/60 px-4 py-10 text-center text-sm text-muted">
        Toutes tes cartes sont déjà gradées.{" "}
        {gradedCount > 0 && (
          <>
            <span className="num">{gradedCount}</span> au total — vois-les dans la collection.
          </>
        )}
      </p>
    );
  }

  return (
    <>
      {/* Recherche + filtre + tout cocher */}
      <div className="relative mb-3">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher une carte à grader…"
          className="field !pl-9"
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-edge px-3 py-1.5 text-[13px] font-medium text-muted transition hover:text-foreground"
        >
          <CheckCheck size={14} aria-hidden />
          Tout cocher <span className="num opacity-70">{list.length}</span>
        </button>
        {tiers.length > 1 && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as "all" | Tier)}
            aria-label="Filtrer par rareté"
            className="field !w-auto !py-1.5 text-[13px]"
          >
            <option value="all">Toutes raretés</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[13px] text-muted">
          <span className="num">{cards.length}</span> à grader
        </span>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl bg-raised/60 px-4 py-8 text-center text-sm text-muted">Aucune carte ne correspond.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {list.map((c) => {
            const on = sel.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  aria-label={`Sélectionner ${c.name}`}
                  className="group block w-full text-left"
                >
                  <div
                    className={`card-tile aspect-[63/88] transition ${
                      on ? "outline outline-2 outline-offset-2 outline-accent" : "opacity-95"
                    }`}
                  >
                    <CardImage base={c.image} alt={c.name} />
                    <span
                      className={`absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                        on ? "border-transparent bg-accent text-accent-ink" : "border-white/50 bg-black/40 text-transparent"
                      }`}
                      aria-hidden
                    >
                      <CheckCheck size={13} strokeWidth={3} />
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-faint">{c.setName}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Barre d'action */}
      {sel.size > 0 && phase === "idle" && (
        <FloatingBar>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            aria-label="Tout désélectionner"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
          >
            <X size={16} aria-hidden />
          </button>
          <span className="num shrink-0 whitespace-nowrap text-sm font-semibold">{sel.size}</span>
          <button
            type="button"
            onClick={grade}
            className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px]"
          >
            <Sparkles size={15} aria-hidden />
            <span className="hidden min-[400px]:inline">Faire grader</span>
            <span className="min-[400px]:hidden">Grader</span>
          </button>
        </FloatingBar>
      )}

      {/* Scan + résultats plein écran */}
      <GradingReveal
        open={phase === "scanning" || phase === "results"}
        scanning={phase === "scanning"}
        count={count}
        results={results}
        onClose={closeResults}
        onCard={(c) => setDetail(c)}
      />

      <GameCardDetail card={detailView} onClose={() => setDetail(null)} z="z-[90]" />
    </>
  );
}
