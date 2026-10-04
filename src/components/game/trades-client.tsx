"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Repeat2, Tag, User, X } from "lucide-react";
import { cancelTrade, proposeTrade, respondTrade, setForTradeMany } from "@/app/boosters/trade-actions";
import { CardImage } from "@/components/card-image";
import { CardGrid, SELECTED_RING, TileCaption, TileCheck } from "@/components/card-grid-kit";
import { FloatingBar } from "@/components/floating-bar";
import { RarityBadge, rarityText } from "@/components/game/tier-badge";
import { Sheet } from "@/components/sheet";
import { Toast } from "@/components/toast";
import { gradeTone, TIER_LABEL, type Tier } from "@/lib/game";

export type TCard = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
  tier: Tier;
  rarity: string | null;
  grade: number | null;
};
export type MyCard = TCard & { double: boolean };
export type MarketCard = { card: TCard; ownerId: string; ownerName: string; since: string };
export type TradeView = { id: string; tier: Tier; pseudo: string; mine: TCard; theirs: TCard; createdAt: string };

type View = "market" | "incoming" | "outgoing" | "mine";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** « il y a 2 h », « hier », « il y a 5 j » */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

/** Tuile de carte du site, avec la rareté et la note si gradée */
function CardTile({ card, className = "", children }: { card: TCard; className?: string; children?: ReactNode }) {
  const tone = card.grade != null ? gradeTone(card.grade) : null;
  return (
    <div className={`card-tile aspect-[63/88] ${className}`}>
      <CardImage base={card.image} alt={card.name} />
      <RarityBadge rarity={card.rarity} tier={card.tier} />
      {tone && card.grade != null && (
        <span className="tile-badge num right-1.5 top-1.5" style={{ background: tone.ring, color: tone.text }}>
          ✓ {card.grade}
        </span>
      )}
      {children}
    </div>
  );
}

const chip = (on: boolean) => `seg flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;

export function TradesClient({
  marketplace,
  incoming,
  outgoing,
  myCards,
  myForTrade,
  spareByTier,
}: {
  marketplace: MarketCard[];
  incoming: TradeView[];
  outgoing: TradeView[];
  myCards: MyCard[];
  myForTrade: string[];
  /** Mes exemplaires en double, par palier : ce que je peux offrir sans me démunir */
  spareByTier: Record<Tier, number>;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(incoming.length > 0 ? "incoming" : "market");
  const [busy, startBusy] = useTransition();
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const [target, setTarget] = useState<MarketCard | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyTradable, setOnlyTradable] = useState(false);
  const [rarity, setRarity] = useState("");
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

  const tabs: { key: View; label: string; n: number }[] = [
    { key: "market", label: "Place d’échange", n: marketplace.length },
    { key: "incoming", label: "Reçues", n: incoming.length },
    { key: "outgoing", label: "Envoyées", n: outgoing.length },
    { key: "mine", label: "Mes cartes", n: forTrade.size },
  ];

  // Cartes de même palier à offrir pour la cible choisie
  const candidates = target ? myCards.filter((c) => c.tier === target.card.tier) : [];
  const needle = normalize(q.trim());
  const marketRarities = [...new Set(marketplace.map((m) => rarityText(m.card.rarity, m.card.tier)))].sort();
  const marketShown = marketplace.filter(
    (m) =>
      (!needle || normalize(`${m.card.name} ${m.card.setName} ${m.ownerName}`).includes(needle)) &&
      (!rarity || rarityText(m.card.rarity, m.card.tier) === rarity) &&
      (!onlyTradable || spareByTier[m.card.tier] > 0)
  );
  const myOnTrade = myCards.filter((c) => forTrade.has(c.id));

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
      else setToast({ message: on ? `${ids.length} carte${ids.length > 1 ? "s" : ""} à échanger` : `${ids.length} carte${ids.length > 1 ? "s" : ""} retirée${ids.length > 1 ? "s" : ""}` });
      router.refresh();
    });
  }
  const selAllOnTrade = sel.size > 0 && [...sel].every((id) => forTrade.has(id));
  const selSomeOnTrade = [...sel].some((id) => forTrade.has(id));
  const mineFiltered = needle ? myCards.filter((c) => normalize(`${c.name} ${c.setName} ${c.localId}`).includes(needle)) : myCards;

  const pendingColumn = (
    <div className="flex flex-col gap-3">
      <h2 className="display text-[15px] font-semibold">
        Propositions reçues <span className="num text-sm font-normal text-muted">{incoming.length}</span>
      </h2>
      {incoming.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-5 text-center text-xs text-muted ring-1 ring-ring">Aucune proposition reçue pour l’instant.</p>
      ) : (
        incoming.slice(0, 3).map((t) => (
          <TradeCard key={t.id} trade={t} incoming busy={busy} onAccept={() => run(() => respondTrade(t.id, true), "Échange effectué !")} onDecline={() => run(() => respondTrade(t.id, false), "Proposition refusée")} />
        ))
      )}
      {outgoing.length > 0 && (
        <>
          <h2 className="display mt-2 text-[15px] font-semibold">
            Envoyée{outgoing.length > 1 ? "s" : ""} <span className="num text-sm font-normal text-muted">{outgoing.length}</span>
          </h2>
          {outgoing.slice(0, 2).map((t) => (
            <TradeCard key={t.id} trade={t} busy={busy} onCancel={() => run(() => cancelTrade(t.id), "Proposition annulée")} />
          ))}
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Puces, recherche, filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="scrollbar-none -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:basis-auto sm:px-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              data-on={view === t.key}
              onClick={() => {
                setView(t.key);
                setSel(new Set());
              }}
              className={chip(view === t.key)}
            >
              {t.label} <span className="num text-[11px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        {(view === "market" || view === "mine") && (
          <div className="flex min-w-0 basis-full flex-wrap items-center gap-2 sm:flex-1 sm:basis-auto sm:justify-end">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === "market" ? "Carte ou dresseur" : "Chercher une carte…"} aria-label="Chercher" className="pill-input basis-full sm:basis-auto sm:!w-52" />
            {view === "market" && marketRarities.length > 1 && (
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-on={rarity !== ""} aria-label="Rareté" className="pill-select !w-auto text-[13px]">
                <option value="">Toutes raretés</option>
                {marketRarities.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {view === "market" && (
              <button type="button" data-on={onlyTradable} onClick={() => setOnlyTradable((v) => !v)} className={chip(onlyTradable)}>
                Je peux l’échanger
              </button>
            )}
          </div>
        )}
      </div>

      {/* Place d'échange */}
      {view === "market" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0">
            {marketplace.length === 0 ? (
              <Empty icon={<Repeat2 size={40} strokeWidth={1.3} aria-hidden />}>Aucune carte à échanger pour le moment. Reviens plus tard, ou mets tes doubles à échanger dans « Mes cartes ».</Empty>
            ) : marketShown.length === 0 ? (
              <p className="text-sm text-muted">Aucune carte ne correspond.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {marketShown.map((m) => {
                  const spare = spareByTier[m.card.tier];
                  return (
                    <li key={m.card.id} className="panel flex flex-col !p-2.5">
                      <CardTile card={m.card}>
                        <span className="tile-badge right-1.5 top-1.5 flex items-center gap-1 !bg-black/70 !text-white">
                          <User size={9} aria-hidden /> {m.ownerName}
                        </span>
                      </CardTile>
                      <p className="mt-2 truncate px-0.5 text-sm font-medium">{m.card.name}</p>
                      <p className="truncate px-0.5 text-[11px] text-muted">
                        {spare > 0 ? (
                          <>
                            tu as <span className="font-semibold text-gain">{spare} double{spare > 1 ? "s" : ""}</span> de même rareté
                          </>
                        ) : (
                          <>aucun double {TIER_LABEL[m.card.tier].toLowerCase()} à offrir</>
                        )}
                      </p>
                      <button type="button" onClick={() => openPropose(m)} className="btn btn-primary mt-2 w-full !py-1.5 text-[13px]" aria-label={`Proposer un échange pour ${m.card.name}`}>
                        Proposer
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="display text-[15px] font-semibold">
                    Tes doubles à l’échange <span className="num text-sm font-normal text-muted">{myOnTrade.length}</span>
                  </h2>
                  <p className="text-xs text-muted">Les autres dresseurs les voient sur la place.</p>
                </div>
                <button type="button" onClick={() => setView("mine")} className="text-xs text-muted hover:text-foreground">
                  Gérer ↗
                </button>
              </div>
              {myOnTrade.length === 0 ? (
                <p className="rounded-2xl bg-surface px-4 py-5 text-center text-xs text-muted ring-1 ring-ring">Rien sur la place : coche des doubles dans « Mes cartes » et mets-les à échanger.</p>
              ) : (
                <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  {myOnTrade.map((c) => (
                    <div key={c.id} className="w-[110px] shrink-0">
                      <CardTile card={c}>
                        <span className="tile-badge right-1.5 top-1.5 flex items-center gap-1 !bg-accent !text-accent-ink">
                          <Tag size={9} aria-hidden /> échange
                        </span>
                      </CardTile>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {pendingColumn}
        </div>
      )}

      {/* Reçues */}
      {view === "incoming" &&
        (incoming.length === 0 ? (
          <Empty icon={<Check size={40} strokeWidth={1.3} aria-hidden />}>Aucune proposition reçue.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {incoming.map((t) => (
              <li key={t.id}>
                <TradeCard trade={t} incoming busy={busy} onAccept={() => run(() => respondTrade(t.id, true), "Échange effectué !")} onDecline={() => run(() => respondTrade(t.id, false), "Proposition refusée")} />
              </li>
            ))}
          </ul>
        ))}

      {/* Envoyées */}
      {view === "outgoing" &&
        (outgoing.length === 0 ? (
          <Empty icon={<ArrowLeftRight size={40} strokeWidth={1.3} aria-hidden />}>Aucune proposition en attente.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {outgoing.map((t) => (
              <li key={t.id}>
                <TradeCard trade={t} busy={busy} onCancel={() => run(() => cancelTrade(t.id), "Proposition annulée")} />
              </li>
            ))}
          </ul>
        ))}

      {/* Mes cartes : sélection multiple, action groupée */}
      {view === "mine" &&
        (myCards.length === 0 ? (
          <Empty icon={<Tag size={40} strokeWidth={1.3} aria-hidden />}>Ouvre des boosters : tes cartes apparaîtront ici, prêtes à mettre à échanger.</Empty>
        ) : (
          <>
            <p className="mb-4 text-[13px] text-muted">
              Coche des cartes, puis mets-les à échanger · <span className="num">{forTrade.size}</span> sur la place · les doubles sont marqués ×2
            </p>
            {mineFiltered.length === 0 ? (
              <p className="text-sm text-muted">Aucune carte ne correspond.</p>
            ) : (
              <CardGrid>
                {mineFiltered.map((c) => {
                  const on = forTrade.has(c.id);
                  const picked = sel.has(c.id);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => toggleSel(c.id)} aria-pressed={picked} aria-label={`Sélectionner ${c.name}`} className="group block w-full text-left">
                        <CardTile card={c} className={picked ? SELECTED_RING : ""}>
                          {on ? (
                            <span className="tile-badge left-1.5 top-1.5 flex items-center gap-1 !bg-accent !text-accent-ink">
                              <Tag size={10} aria-hidden /> À échanger
                            </span>
                          ) : (
                            c.double && <span className="tile-badge num left-1.5 top-1.5">×2</span>
                          )}
                          <TileCheck on={picked} />
                        </CardTile>
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
          </>
        ))}

      {/* Barre d'action de « Mes cartes » */}
      {view === "mine" && sel.size > 0 && (
        <FloatingBar>
          <button type="button" onClick={() => setSel(new Set())} aria-label="Tout désélectionner" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground">
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
              <ArrowLeftRight size={22} className="shrink-0 text-faint" aria-hidden />
              <div className="w-24">
                {offer ? (
                  <CardTile card={candidates.find((c) => c.id === offer)!} />
                ) : (
                  <div className="flex aspect-[63/88] items-center justify-center rounded-[4.5%/3.5%] border-2 border-dashed border-edge-strong text-center text-[11px] text-faint">Choisis</div>
                )}
                <p className="mt-1 text-center text-[11px] text-muted">Tu donnes</p>
              </div>
            </div>

            <p className="label-xs mb-2">
              Tes cartes {TIER_LABEL[target.card.tier].toLowerCase()} ({candidates.length}) · les doubles d’abord
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">Tu n&apos;as aucune carte de cette rareté à offrir.</p>
            ) : (
              <ul className="grid max-h-[38vh] grid-cols-4 gap-2.5 overflow-y-auto p-0.5 sm:grid-cols-5">
                {[...candidates].sort((a, b) => Number(b.double) - Number(a.double)).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOffer(c.id)} aria-pressed={offer === c.id} aria-label={c.name} className="block w-full">
                      <CardTile card={c} className={offer === c.id ? SELECTED_RING : ""}>
                        {c.double && <span className="tile-badge num left-1.5 top-1.5">×2</span>}
                        <TileCheck on={offer === c.id} />
                      </CardTile>
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
                <ArrowLeftRight size={15} aria-hidden />
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

/** Proposition : « tu donnes ⇄ tu reçois », avec qui, depuis quand, et les actions */
function TradeCard({ trade, incoming = false, busy, onAccept, onDecline, onCancel }: { trade: TradeView; incoming?: boolean; busy: boolean; onAccept?: () => void; onDecline?: () => void; onCancel?: () => void }) {
  return (
    <div className="panel flex flex-col gap-3 !p-3.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <User size={12} aria-hidden className="shrink-0 text-faint" />
          <span className="truncate">
            {incoming ? "Proposé par" : "Tu proposes à"} <span className="font-medium text-foreground">{trade.pseudo}</span> · {since(trade.createdAt)}
          </span>
        </span>
        {!incoming && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium">en attente</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0">
          <p className="label-xs !text-[10px] mb-1 text-muted">Tu donnes</p>
          <CardTile card={trade.mine} />
          <p className="mt-1 truncate text-xs font-medium">{trade.mine.name}</p>
        </div>
        <ArrowLeftRight size={18} className="text-faint" aria-hidden />
        <div className="min-w-0">
          <p className="label-xs !text-[10px] mb-1 text-muted">Tu reçois</p>
          <CardTile card={trade.theirs} />
          <p className="mt-1 truncate text-xs font-medium">{trade.theirs.name}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {incoming ? (
          <>
            <button type="button" disabled={busy} onClick={onAccept} className="btn btn-primary flex-1 !py-1.5 text-[13px]">
              <Check size={14} aria-hidden /> Accepter
            </button>
            <button type="button" disabled={busy} onClick={onDecline} className="btn btn-ghost flex-1 !py-1.5 text-[13px]">
              Refuser
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={onCancel} className="btn btn-ghost flex-1 !py-1.5 text-[13px]">
            <X size={14} aria-hidden /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 p-12 text-center text-faint">
      {icon}
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  );
}
