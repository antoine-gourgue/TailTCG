"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Sparkles } from "lucide-react";
import { gradeGameCards } from "@/app/boosters/actions";
import { CardImage } from "@/components/card-image";
import { CardGrid, SELECTED_RING, TileCaption, TileCheck } from "@/components/card-grid-kit";
import { GameCardDetail, type GameCardView } from "@/components/game/card-detail";
import { GradingReveal, type RevealItem } from "@/components/game/grading-reveal";
import type { OwnedCard } from "@/components/game/game-cards-grid";
import { RarityBadge } from "@/components/game/tier-badge";
import { Toast } from "@/components/toast";
import { TIERS, type Tier } from "@/lib/game";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const SCAN_MS = 1900;
/** Affichage plafonné : la grille complète devient vite un mur de cartes */
const SHOWN = 18;
const rank = (t: Tier) => TIERS.indexOf(t);

/**
 * Laboratoire de gradation : on coche plusieurs cartes non gradées et on les
 * fait grader d'un coup ; une animation de scan précède les résultats. Puces
 * « Rares et plus » / « Toutes », recherche, et la barre d'action dans le
 * panneau.
 */
export function GradingLab({ cards, gradedCount }: { cards: OwnedCard[]; gradedCount: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"rare" | "all">("rare");
  const [phase, setPhase] = useState<"idle" | "scanning" | "results">("idle");
  const [count, setCount] = useState(0);
  const [runId, setRunId] = useState(0);
  const [results, setResults] = useState<RevealItem[]>([]);
  const [detail, setDetail] = useState<OwnedCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rareCount = useMemo(() => cards.filter((c) => rank(c.tier) >= rank("rare")).length, [cards]);
  // Sans rare, la puce « Rares et plus » n'a pas de sens : on montre tout
  const effScope = rareCount === 0 ? "all" : scope;

  const needle = normalize(q.trim());
  const list = useMemo(
    () => cards.filter((c) => (!needle || normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) && (effScope === "all" || rank(c.tier) >= rank("rare"))),
    [cards, needle, effScope]
  );
  const allChecked = list.length > 0 && list.every((c) => sel.has(c.id));

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(list.map((c) => c.id)));
  }

  async function grade() {
    if (sel.size === 0 || phase === "scanning") return;
    const ids = [...sel];
    setCount(ids.length);
    setResults([]);
    setPhase("scanning");
    const started = Date.now();
    const res = await gradeGameCards(ids).catch(() => ({ error: "Gradation impossible, réessaie." }));
    const wait = Math.max(0, SCAN_MS - (Date.now() - started));
    window.setTimeout(() => {
      if ("error" in res) {
        setPhase("idle");
        setToast(res.error);
        return;
      }
      const sorted = [...res.graded]
        .sort((a, b) => b.grade.overall - a.grade.overall)
        .map((r) => ({ card: byId.get(r.id)!, grade: r.grade }))
        .filter((r) => r.card);
      setResults(sorted);
      setRunId((v) => v + 1);
      setPhase("results");
    }, wait);
  }

  function closeResults() {
    setPhase("idle");
    setResults([]);
    setSel(new Set());
    router.refresh();
  }

  const detailView: GameCardView | null = detail
    ? { id: detail.id, image: detail.image, name: detail.name, set_name: detail.setName, set_id: detail.setId, local_id: detail.localId, tier: detail.tier, rarity: detail.rarity, grade: detail.grade, obtained_at: detail.obtainedAt, gradable: true }
    : null;
  const chip = (on: boolean) => `seg shrink-0 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;
  const empty = cards.length === 0;

  return (
    <>
      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-[15px] font-semibold">Labo</h2>
            <p className="text-xs text-muted">Coche, puis grade : la scène révèle les boîtiers un par un.</p>
          </div>
          {!empty && (
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {rareCount > 0 && (
                <button type="button" data-on={effScope === "rare"} onClick={() => setScope("rare")} className={chip(effScope === "rare")}>
                  Rares et plus <span className="num text-[11px] opacity-70">{rareCount}</span>
                </button>
              )}
              <button type="button" data-on={effScope === "all"} onClick={() => setScope("all")} className={chip(effScope === "all")}>
                Toutes <span className="num text-[11px] opacity-70">{cards.length}</span>
              </button>
              <button type="button" onClick={toggleAll} className="seg inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] text-muted">
                <ListChecks size={13} aria-hidden />
                {allChecked ? "Tout décocher" : "Tout cocher"}
              </button>
            </div>
          )}
        </div>

        {empty ? (
          <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">
            Toutes tes cartes sont déjà gradées.
            {gradedCount > 0 && (
              <>
                {" "}
                <span className="num">{gradedCount}</span> au total, à retrouver ci-dessous.
              </>
            )}
          </p>
        ) : (
          <>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une carte à grader…" aria-label="Chercher" className="pill-input mb-4 sm:!w-64" />
            {list.length === 0 ? (
              <p className="text-sm text-muted">Aucune carte ne correspond.</p>
            ) : (
              <CardGrid>
                {(showAll ? list : list.slice(0, SHOWN)).map((c) => {
                  const on = sel.has(c.id);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => toggle(c.id)} aria-pressed={on} aria-label={`Sélectionner ${c.name}`} className="group block w-full text-left">
                        <div className={`card-tile aspect-[63/88] ${on ? SELECTED_RING : ""}`}>
                          <CardImage base={c.image} alt={c.name} />
                          <TileCheck on={on} />
                          <RarityBadge rarity={c.rarity} tier={c.tier} />
                        </div>
                        <TileCaption
                          name={c.name}
                          sub={
                            <>
                              {c.setName} <span className="num text-faint">· {c.localId}</span>
                            </>
                          }
                        />
                      </button>
                    </li>
                  );
                })}
              </CardGrid>
            )}
            {list.length > SHOWN && (
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={() => setShowAll((v) => !v)} className="btn btn-ghost text-[13px]">
                  {showAll ? "Réduire" : `Afficher les ${list.length - SHOWN} autres`}
                </button>
              </div>
            )}
            {/* Barre d'action, dans le panneau */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-full bg-background/70 py-2 pl-4 pr-2 ring-1 ring-ring">
              <p className="text-[13px] text-muted">
                {sel.size > 0 ? (
                  <>
                    <span className="num font-semibold text-foreground">{sel.size}</span> carte{sel.size > 1 ? "s" : ""} cochée{sel.size > 1 ? "s" : ""} · ~ {Math.max(2, Math.round(SCAN_MS / 1000 + sel.size * 0.2))} s de scan
                  </>
                ) : (
                  "Coche des cartes pour les grader"
                )}
              </p>
              <button type="button" onClick={grade} disabled={sel.size === 0 || phase === "scanning"} className="btn btn-primary !py-2 text-[13px] shadow-lg shadow-accent/30 disabled:opacity-40 disabled:shadow-none">
                <Sparkles size={14} aria-hidden />
                {sel.size > 0 ? `Grader ${sel.size} carte${sel.size > 1 ? "s" : ""}` : "Grader"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Scan + résultats plein écran */}
      <GradingReveal open={phase === "scanning" || phase === "results"} scanning={phase === "scanning"} count={count} results={results} runId={runId} onClose={closeResults} onCard={(c) => setDetail(c)} />

      <GameCardDetail card={detailView} onClose={() => setDetail(null)} z="z-[90]" />
      {toast && <Toast message={toast} tone="error" onDone={() => setToast(null)} />}
    </>
  );
}
