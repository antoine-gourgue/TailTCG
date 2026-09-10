"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Repeat2, Search, Tag, User, X } from "lucide-react";
import { cancelTrade, proposeTrade, respondTrade, setForTradeMany } from "@/app/boosters/trade-actions";
import { CardImage } from "@/components/card-image";
import { FloatingBar } from "@/components/floating-bar";
import { Sheet } from "@/components/sheet";
import { Toast } from "@/components/toast";
import { TIER_LABEL, gradeTone, type Tier } from "@/lib/game";

export type TCard = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
  tier: Tier;
  grade: number | null;
};
export type MarketCard = { card: TCard; ownerId: string; ownerName: string };
export type TradeView = { id: string; tier: Tier; pseudo: string; mine: TCard; theirs: TCard };

type View = "market" | "incoming" | "outgoing" | "mine";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** Vignette de carte pour les échanges : image, rareté, sceau de note */
function CardTile({ card, className = "" }: { card: TCard; className?: string }) {
  const tone = card.grade != null ? gradeTone(card.grade) : null;
  return (
    <div className={`card-tile aspect-[63/88] ${className}`} style={tone ? { outline: `2px solid ${tone.ring}`, outlineOffset: "-2px" } : undefined}>
      <CardImage base={card.image} alt={card.name} />
      {tone && card.grade != null && (
        <span className="absolute left-1 top-1 z-10 rounded-md px-1 text-[10px] font-bold shadow num" style={{ background: tone.ring, color: tone.text }}>
          {card.grade}
        </span>
      )}
      <span className="tile-badge bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap !px-1.5 !text-[9px]">
        {TIER_LABEL[card.tier]}
      </span>
    </div>
  );
}

export function TradesClient({
  marketplace,
  incoming,
  outgoing,
  myCards,
  myForTrade,
}: {
  marketplace: MarketCard[];
  incoming: TradeView[];
  outgoing: TradeView[];
  myCards: TCard[];
  myForTrade: string[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(incoming.length > 0 ? "incoming" : "market");
  const [busy, startBusy] = useTransition();
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const [target, setTarget] = useState<MarketCard | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // État « à échanger » local, mis à jour tout de suite (retour visuel)
  const [forTrade, setForTradeState] = useState<Set<string>>(() => new Set(myForTrade));
  // Sélection multiple dans « Mes cartes », comme partout sur le site
  const [sel, setSel] = useState<Set<string>>(new Set());

  function run(fn: () => Promise<{ error: string } | { ok: true }>, okMsg: string) {
    startBusy(async () => {
      const res = await fn();
      if ("error" in res) setToast({ message: res.error, tone: "error" });
      else {
        setToast({ message: okMsg });
        router.refresh();
      }
    });
  }

  const tabs: { key: View; label: string; n?: number }[] = [
    { key: "market", label: "Place d'échange" },
    { key: "incoming", label: "Reçues", n: incoming.length },
    { key: "outgoing", label: "Envoyées", n: outgoing.length },
    { key: "mine", label: "Mes cartes" },
  ];

  // Cartes de même rareté à offrir pour la cible choisie
  const candidates = target ? myCards.filter((c) => c.tier === target.card.tier) : [];

  function openPropose(m: MarketCard) {
    setTarget(m);
    setOffer(null);
  }
  function confirmPropose() {
    if (!target || !offer) return;
    const t = target;
    run(() => proposeTrade(offer, t.card.id), `Proposition envoyée à ${t.ownerName}`);
    setTarget(null);
  }

  function toggleSel(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function applyTrade(on: boolean) {
    const ids = [...sel];
    if (ids.length === 0) return;
    // Retour visuel immédiat
    setForTradeState((prev) => {
      const n = new Set(prev);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
    setSel(new Set());
    startBusy(async () => {
      const res = await setForTradeMany(ids, on);
      if ("error" in res) setToast({ message: res.error, tone: "error" });
      else
        setToast({
          message: on
            ? `${ids.length} carte${ids.length > 1 ? "s" : ""} à échanger`
            : `${ids.length} carte${ids.length > 1 ? "s" : ""} retirée${ids.length > 1 ? "s" : ""}`,
        });
      router.refresh();
    });
  }
  const selAllOnTrade = sel.size > 0 && [...sel].every((id) => forTrade.has(id));
  const selSomeOnTrade = [...sel].some((id) => forTrade.has(id));

  const needle = normalize(q.trim());
  const mineFiltered = needle
    ? myCards.filter((c) => normalize(`${c.name} ${c.setName}`).includes(needle))
    : myCards;

  return (
    <>
      {/* Onglets internes */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setView(t.key);
              setSel(new Set());
            }}
            aria-current={view === t.key ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              view === t.key ? "bg-accent text-accent-ink" : "border border-edge text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.n != null && t.n > 0 && (
              <span className={`num rounded-full px-1.5 text-[11px] ${view === t.key ? "bg-black/20" : "bg-raised"}`}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {/* Place d'échange */}
      {view === "market" &&
        (marketplace.length === 0 ? (
          <Empty icon={<Repeat2 size={40} strokeWidth={1.3} aria-hidden />}>
            Aucune carte à échanger pour le moment. Reviens plus tard, ou mets tes doubles à échanger
            dans « Mes cartes ».
          </Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {marketplace.map((m) => (
              <li key={m.card.id}>
                <button type="button" onClick={() => openPropose(m)} className="group block w-full text-left" aria-label={`Proposer un échange pour ${m.card.name}`}>
                  <CardTile card={m.card} />
                  <p className="mt-1.5 truncate text-xs font-medium">{m.card.name}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-faint">
                    <User size={10} aria-hidden />
                    {m.ownerName}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {/* Reçues */}
      {view === "incoming" &&
        (incoming.length === 0 ? (
          <Empty icon={<Check size={40} strokeWidth={1.3} aria-hidden />}>Aucune proposition reçue.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {incoming.map((t) => (
              <TradeRow key={t.id} trade={t} youReceiveLeft>
                <button type="button" disabled={busy} onClick={() => run(() => respondTrade(t.id, false), "Proposition refusée")} className="btn btn-ghost !py-1.5 text-[13px]">
                  Refuser
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => respondTrade(t.id, true), "Échange effectué !")} className="btn btn-primary !py-1.5 text-[13px]">
                  <Check size={14} aria-hidden />
                  Accepter
                </button>
              </TradeRow>
            ))}
          </ul>
        ))}

      {/* Envoyées */}
      {view === "outgoing" &&
        (outgoing.length === 0 ? (
          <Empty icon={<ArrowRight size={40} strokeWidth={1.3} aria-hidden />}>Aucune proposition en attente.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {outgoing.map((t) => (
              <TradeRow key={t.id} trade={t}>
                <button type="button" disabled={busy} onClick={() => run(() => cancelTrade(t.id), "Proposition annulée")} className="btn btn-ghost !py-1.5 text-[13px]">
                  <X size={14} aria-hidden />
                  Annuler
                </button>
              </TradeRow>
            ))}
          </ul>
        ))}

      {/* Mes cartes : sélection multiple, action groupée */}
      {view === "mine" && (
        <>
          <div className="relative mb-3">
            <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une carte…" className="field !pl-9" />
          </div>
          {myCards.length === 0 ? (
            <Empty icon={<Tag size={40} strokeWidth={1.3} aria-hidden />}>
              Ouvre des boosters : tes cartes apparaîtront ici, prêtes à mettre à échanger.
            </Empty>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-muted">
                Coche des cartes, puis mets-les à échanger.{" "}
                <span className="num text-faint">{forTrade.size} sur la place</span>
              </p>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {mineFiltered.map((c) => {
                  const on = forTrade.has(c.id);
                  const picked = sel.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggleSel(c.id)}
                        aria-pressed={picked}
                        aria-label={`Sélectionner ${c.name}`}
                        className="group block w-full text-left"
                      >
                        <div className="relative">
                          <CardTile card={c} className={picked ? "outline outline-2 outline-offset-2 outline-accent" : on ? "" : "opacity-90"} />
                          {on && (
                            <span className="absolute left-1 top-1 z-10 flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-ink shadow">
                              <Tag size={9} aria-hidden />
                              À échanger
                            </span>
                          )}
                          <span
                            className={`absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                              picked ? "border-transparent bg-accent text-accent-ink" : "border-white/50 bg-black/40 text-transparent"
                            }`}
                            aria-hidden
                          >
                            <Check size={13} strokeWidth={3} />
                          </span>
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {/* Barre d'action de « Mes cartes » */}
      {view === "mine" && sel.size > 0 && (
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
          {selAllOnTrade ? (
            <button type="button" disabled={busy} onClick={() => applyTrade(false)} className="btn btn-ghost shrink-0 !rounded-full !py-2 text-[13px]">
              Retirer
            </button>
          ) : (
            <>
              {selSomeOnTrade && (
                <button type="button" disabled={busy} onClick={() => applyTrade(false)} className="btn btn-ghost shrink-0 !rounded-full !py-2 text-[13px]">
                  Retirer
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => applyTrade(true)} className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px]">
                <Tag size={15} aria-hidden />
                <span className="hidden min-[400px]:inline">Mettre à échanger</span>
                <span className="min-[400px]:hidden">Échanger</span>
              </button>
            </>
          )}
        </FloatingBar>
      )}

      {/* Proposer un échange */}
      <Sheet
        open={target != null}
        onClose={() => setTarget(null)}
        size="lg"
        label="Proposer un échange"
        header={
          <div className="min-w-0 flex-1">
            <p className="display text-base font-semibold">Proposer un échange</p>
            <p className="mt-0.5 text-sm text-muted">
              {target && (
                <>
                  Contre <span className="font-medium text-foreground">{target.card.name}</span> de {target.ownerName}
                </>
              )}
            </p>
          </div>
        }
      >
        {target && (
          <div>
            <div className="mb-4 flex items-center justify-center gap-4">
              <div className="w-24">
                <CardTile card={target.card} />
                <p className="mt-1 text-center text-[11px] text-muted">Tu reçois</p>
              </div>
              <Repeat2 size={22} className="shrink-0 text-faint" aria-hidden />
              <div className="w-24">
                {offer ? (
                  <CardTile card={candidates.find((c) => c.id === offer)!} />
                ) : (
                  <div className="flex aspect-[63/88] items-center justify-center rounded-[4.5%/3.5%] border-2 border-dashed border-edge-strong text-center text-[11px] text-faint">
                    Choisis
                  </div>
                )}
                <p className="mt-1 text-center text-[11px] text-muted">Tu donnes</p>
              </div>
            </div>

            <p className="label-xs mb-2">
              Tes cartes {TIER_LABEL[target.card.tier]} ({candidates.length})
            </p>
            {candidates.length === 0 ? (
              <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">
                Tu n&apos;as aucune carte de cette rareté à offrir.
              </p>
            ) : (
              <ul className="grid max-h-[38vh] grid-cols-4 gap-2.5 overflow-y-auto sm:grid-cols-5">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOffer(c.id)} aria-pressed={offer === c.id} className="block w-full">
                      <CardTile card={c} className={offer === c.id ? "outline outline-2 outline-offset-2 outline-accent" : ""} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="sheet-actions mt-4">
              <button type="button" onClick={() => setTarget(null)} className="btn btn-ghost">
                Annuler
              </button>
              <button type="button" onClick={confirmPropose} disabled={!offer || busy} className="btn btn-primary">
                <Repeat2 size={15} aria-hidden />
                Proposer l&apos;échange
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </>
  );
}

/** Ligne d'échange : deux cartes reliées par une flèche + actions */
function TradeRow({ trade, youReceiveLeft = false, children }: { trade: TradeView; youReceiveLeft?: boolean; children: React.ReactNode }) {
  const left = youReceiveLeft ? trade.theirs : trade.mine;
  const right = youReceiveLeft ? trade.mine : trade.theirs;
  const leftLabel = youReceiveLeft ? "Tu reçois" : "Tu donnes";
  const rightLabel = youReceiveLeft ? "Tu donnes" : "Tu reçois";
  return (
    <li className="panel flex flex-wrap items-center gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="w-16">
          <CardTile card={left} />
          <p className="mt-1 text-center text-[10px] text-muted">{leftLabel}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-faint" aria-hidden />
        <div className="w-16">
          <CardTile card={right} />
          <p className="mt-1 text-center text-[10px] text-muted">{rightLabel}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <User size={13} aria-hidden className="text-faint" />
          {trade.pseudo}
        </p>
        <p className="text-xs text-muted">Échange {TIER_LABEL[trade.tier]}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 p-12 text-center text-faint">
      {icon}
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  );
}
