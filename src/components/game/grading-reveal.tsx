"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { GradedSlab } from "@/components/graded-slab";
import type { OwnedCard } from "@/components/game/game-cards-grid";
import { gradeLabel, gradeTone, type Grade } from "@/lib/game";

export type RevealItem = { card: OwnedCard; grade: Grade };

const noopSubscribe = () => () => {};

/**
 * Ouverture de la gradation en masse, plein écran : d'abord un scan, puis les
 * cartes qui se retournent une à une dans leur boîtier, avec récap des notes.
 */
export function GradingReveal({
  open,
  scanning,
  count,
  results,
  onClose,
  onCard,
}: {
  open: boolean;
  scanning: boolean;
  count: number;
  results: RevealItem[];
  onClose: () => void;
  onCard: (card: OwnedCard) => void;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted || !open) return null;

  const best = results[0];
  const dist = new Map<number, number>();
  for (const r of results) dist.set(r.grade.overall, (dist.get(r.grade.overall) ?? 0) + 1);
  const batch = [...dist.entries()].sort((a, b) => b[0] - a[0]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0a090c] text-foreground animate-[stage-in_.3s_ease-out]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 50% 38%, ${best ? gradeTone(best.grade.overall).glow : "rgba(240,72,62,.14)"}, transparent 70%)`,
        }}
      />

      {/* En-tête */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <div className="min-w-0">
          <p className="display truncate text-base font-semibold">
            {scanning ? "Gradation en cours…" : "Résultats de gradation"}
          </p>
          <p className="truncate text-xs text-muted">
            {scanning
              ? `Analyse de ${count} carte${count > 1 ? "s" : ""}`
              : `${results.length} carte${results.length > 1 ? "s" : ""} gradée${results.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {!scanning && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition hover:bg-white/10 hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      {scanning ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <span className="relative flex h-28 w-28 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
            <span className="absolute inset-3 animate-pulse rounded-full bg-accent/20" />
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Sparkles size={34} aria-hidden />
            </span>
          </span>
          <div className="h-1.5 w-64 max-w-[80vw] overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 rounded-full bg-accent" style={{ animation: "bar-indet 1s linear infinite" }} />
          </div>
          <p className="text-sm text-muted">Centrage · Coins · Bords · Surface</p>
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="px-4 sm:px-6">
            {best && (
              <div className="mx-auto mb-3 flex max-w-lg items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl"
                  style={{
                    background: gradeTone(best.grade.overall).ring,
                    color: gradeTone(best.grade.overall).text,
                    boxShadow: `0 0 24px ${gradeTone(best.grade.overall).glow}`,
                  }}
                >
                  <span className="num text-xl font-bold leading-none">{best.grade.overall}</span>
                  <span className="text-[8px] font-bold uppercase">/ 10</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted">Meilleure note</p>
                  <p className="display truncate text-base font-semibold">{best.card.name}</p>
                  <p className="text-xs text-muted">{gradeLabel(best.grade.overall)}</p>
                </div>
              </div>
            )}
            {batch.length > 0 && (
              <div className="mx-auto mb-3 flex max-w-lg flex-wrap justify-center gap-1.5">
                {batch.map(([note, n]) => {
                  const tone = gradeTone(note);
                  return (
                    <span
                      key={note}
                      className="num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: `${tone.ring}22`, color: tone.ring }}
                    >
                      {n}× <span className="font-bold">{note}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
            <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r, i) => (
                <li key={r.card.id}>
                  <button
                    type="button"
                    onClick={() => onCard(r.card)}
                    aria-label={`Voir ${r.card.name}`}
                    className="block w-full [transform-style:preserve-3d]"
                    style={{ animation: `reveal-flip .6s cubic-bezier(.2,.8,.3,1) ${Math.min(i, 15) * 160}ms both` }}
                  >
                    <GradedSlab
                      name={r.card.name}
                      setName={r.card.setName}
                      localId={r.card.localId}
                      imageUrl={r.card.image}
                      grade={r.grade.overall}
                      centering={r.grade.centering}
                      corners={r.grade.corners}
                      edges={r.grade.edges}
                      surface={r.grade.surface}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 flex justify-center border-t border-white/10 px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} className="btn btn-primary !px-10">
              Terminé
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
