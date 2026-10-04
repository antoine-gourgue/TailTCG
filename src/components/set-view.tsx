"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, Check, CheckCheck, ChevronLeft, Layers, LayoutGrid, List, ListChecks, Plus, Star, X, Zap } from "lucide-react";
import { addManyToWishlist, toggleWishlist } from "@/app/recherchees/actions";
import { quickInfo, type QuickInfo } from "@/app/catalogue/actions";
import { bulkAddToCollection } from "@/app/items/actions";
import { saveBatchDraft } from "@/lib/batch-draft";
import { TileCheck } from "@/components/card-grid-kit";
import { CardImage } from "@/components/card-image";
import { cardmarketUrl, type CatalogLang } from "@/lib/tcgdex";
import { formatEur } from "@/lib/domain";
import { Toast } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { FloatingBar } from "@/components/floating-bar";
import { CardSpotlight } from "@/components/card-spotlight";
import { StatCard, StatStrip } from "@/components/stat-card";
import { PhoneCaptureButton } from "@/components/capture/phone-capture-button";
import { rarityLabel, rarityRank, raritySymbol } from "@/lib/rarity";
import { ITEM_LANGUAGE, isScanLang } from "@/lib/scan/url";

export type SetCard = {
  id: string;
  localId: string;
  name: string;
  image: string | null;
  rarity: string | null;
  /** Prix de référence Cardmarket (euros) — null si indisponible */
  price: number | null;
  /** idProduct Cardmarket, pour le lien produit — null si inconnu */
  cmId: number | null;
  /** Carte venue d'un autre catalogue (complément anglais) : sa fiche d'ajout s'ouvre dans cette langue */
  lang?: string;
};

export type SetInfo = {
  id: string;
  name: string;
  logo: string | null;
  symbol: string | null;
  serie: string | null;
  releaseDate: string | null;
  official: number | null;
  total: number;
  scansMissing: boolean;
};

type OwnFilter = "all" | "owned" | "missing";
type SortKey = "num" | "price" | "rarity";
const UNKNOWN = "Autre";
const STRIP = 8;
const CHEAP_BATCH = 50;

/**
 * Numéro de carte comparable : « 006 » → 6, « TG12 » → 12. Les numéros
 * imprimés d'un set fusionné (« 4/102 » de la Collection Classique dans le
 * 30ᵉ Anniversaire) passent après toutes les cartes du set lui-même, puis
 * se classent entre eux par numéro.
 */
function numKey(localId: string): [number, number, string] {
  const m = localId.match(/(\d+)/);
  return [localId.includes("/") ? 1 : 0, m ? Number(m[1]) : Number.MAX_SAFE_INTEGER, localId];
}

function SetLogo({ set }: { set: SetInfo }) {
  const candidates = [set.logo && `${set.logo}.webp`, set.logo && `${set.logo}.png`, set.symbol && `${set.symbol}.webp`].filter((s): s is string => Boolean(s));
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) {
    return (
      <span className="flex h-16 w-24 items-center justify-center rounded-2xl bg-raised text-faint">
        <Layers size={26} strokeWidth={1.5} aria-hidden />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={candidates[idx]} alt="" className="h-16 max-w-[160px] object-contain" onError={() => setIdx((i) => i + 1)} />;
}

/**
 * Page d'une extension : en-tête compact, chiffres, les manquantes les moins
 * chères, puis la grille (ou la liste) filtrable et triable des cartes.
 */
export function SetView({
  set,
  cards,
  lang,
  wishedIds,
  ownedQty,
  mine,
  binderButton,
}: {
  set: SetInfo;
  cards: SetCard[];
  lang: CatalogLang;
  wishedIds: string[];
  /** Quantité possédée (active) par id TCGdex */
  ownedQty: Record<string, number>;
  /** Mes exemplaires de ce set : valeur estimée, prix payé, nombre */
  mine: { value: number; paid: number; count: number };
  binderButton: React.ReactNode;
}) {
  const router = useRouter();
  const langSuffix = lang === "ja" ? "&lang=ja" : "";
  const itemLang = lang === "ja" ? "JP" : "FR";
  const isOwned = (c: SetCard) => (ownedQty[c.id] ?? 0) > 0;

  const [q, setQ] = useState("");
  const [ownFilter, setOwnFilter] = useState<OwnFilter>("all");
  const [rarity, setRarity] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("num");
  const [sortAsc, setSortAsc] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const [selected, setSelected] = useState<SetCard | null>(null);
  const [info, setInfo] = useState<QuickInfo | "loading" | null>(null);
  const selectedRef = useRef<string | null>(null);
  function openCard(c: SetCard) {
    setSelected(c);
    setInfo("loading");
    selectedRef.current = c.id;
    quickInfo(c.id, lang)
      .then((i) => {
        if (selectedRef.current === c.id) setInfo(i);
      })
      .catch(() => {
        if (selectedRef.current === c.id) setInfo(null);
      });
  }
  async function addExpress(c: SetCard) {
    setBusy(true);
    const res = await bulkAddToCollection([{ tcgdex_id: c.id, card_name: c.name, set_id: set.id, set_name: set.name, local_id: c.localId, image_url: c.image ?? "" }], itemLang);
    setBusy(false);
    if (res.error) {
      setToast({ message: res.error, tone: "error" });
      return;
    }
    setToast({ message: `${c.name} ajoutée — état NM, à compléter` });
    setSelected(null);
    router.refresh();
  }
  const [wished, setWished] = useState<Set<string>>(() => new Set(wishedIds));
  const [pendingWish, startWish] = useTransition();

  /* ——— Chiffres du set ——— */
  const total = cards.length;
  const ownedCount = cards.reduce((n, c) => n + (isOwned(c) ? 1 : 0), 0);
  const pct = total > 0 ? Math.round((100 * ownedCount) / total) : 0;
  const priced = cards.filter((c) => c.price != null && c.price > 0);
  const setValue = priced.reduce((s, c) => s + c.price!, 0);
  const missing = cards.filter((c) => !isOwned(c));
  const missingPriced = missing.filter((c) => c.price != null && c.price > 0);
  const missingValue = missingPriced.reduce((s, c) => s + c.price!, 0);
  const cheapest = [...missingPriced].sort((a, b) => a.price! - b.price!);
  const dearest = priced.reduce<SetCard | null>((b, c) => (b == null || c.price! > b.price! ? c : b), null);
  const secretOwned = set.official ? cards.filter((c) => isOwned(c) && numKey(c.localId)[0] === 0 && numKey(c.localId)[1] > set.official!).length : 0;
  const pricesAvailable = priced.length > 0;

  /* ——— Raretés présentes, ordonnées, avec compteur ——— */
  const rarities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.rarity ?? UNKNOWN, (counts.get(c.rarity ?? UNKNOWN) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]));
  }, [cards]);

  /* ——— Cartes visibles ——— */
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = cards.filter(
      (c) =>
        (rarity === "all" || (c.rarity ?? UNKNOWN) === rarity) &&
        (ownFilter === "all" || (ownFilter === "owned" ? isOwned(c) : !isOwned(c))) &&
        (!needle || c.name.toLowerCase().includes(needle) || c.localId.toLowerCase().includes(needle))
    );
    const dir = sortAsc ? 1 : -1;
    const cmp: Record<SortKey, (a: SetCard, b: SetCard) => number> = {
      num: (a, b) => {
        const [ga, na, sa] = numKey(a.localId);
        const [gb, nb, sb] = numKey(b.localId);
        return ga - gb || na - nb || sa.localeCompare(sb);
      },
      // Sans cote : toujours en fin de liste, quel que soit le sens
      price: (a, b) => {
        if (a.price == null && b.price == null) return 0;
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return (a.price - b.price) * dir;
      },
      rarity: (a, b) => rarityRank(a.rarity ?? UNKNOWN) - rarityRank(b.rarity ?? UNKNOWN) || numKey(a.localId)[0] - numKey(b.localId)[0] || numKey(a.localId)[1] - numKey(b.localId)[1],
    };
    const sorted = [...list].sort(cmp[sortKey]);
    if (sortKey !== "price" && !sortAsc) sorted.reverse();
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, q, rarity, ownFilter, sortKey, sortAsc, ownedQty]);

  const ownTabs: { code: OwnFilter; label: string; n: number }[] = [
    { code: "all", label: "Toutes", n: total },
    { code: "owned", label: "Possédées", n: ownedCount },
    { code: "missing", label: "Manquantes", n: total - ownedCount },
  ];

  /* ——— Recherchées ——— */
  function toggleWish(card: SetCard) {
    startWish(async () => {
      const formData = new FormData();
      formData.set("tcgdex_id", card.id);
      formData.set("card_name", card.name);
      formData.set("set_id", set.id);
      formData.set("set_name", set.name);
      formData.set("local_id", card.localId);
      formData.set("image_url", card.image ?? "");
      const res = await toggleWishlist(null, formData);
      if (res) {
        setWished((prev) => {
          const next = new Set(prev);
          if (res.wished) next.add(card.id);
          else next.delete(card.id);
          return next;
        });
      }
    });
  }
  async function wishCheapest() {
    const batch = cheapest.slice(0, CHEAP_BATCH).filter((c) => !wished.has(c.id));
    if (batch.length === 0) {
      setToast({ message: "Elles sont déjà toutes dans tes recherchées." });
      return;
    }
    setBusy(true);
    const res = await addManyToWishlist(
      batch.map((c) => ({ tcgdex_id: c.id, card_name: c.name, set_id: set.id, set_name: set.name, local_id: c.localId, image_url: c.image ?? "" }))
    );
    setBusy(false);
    if (res.error) {
      setToast({ message: res.error, tone: "error" });
      return;
    }
    setWished((prev) => new Set([...prev, ...batch.map((c) => c.id)]));
    setToast({ message: `${res.added} carte${res.added > 1 ? "s" : ""} ajoutée${res.added > 1 ? "s" : ""} aux recherchées` });
  }
  function showCheapest() {
    setOwnFilter("missing");
    setRarity("all");
    setQ("");
    setSortKey("price");
    setSortAsc(true);
    document.getElementById("set-cards")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ——— Ajout rapide ——— */
  function togglePick(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectMissingVisible() {
    setPicked((p) => {
      const n = new Set(p);
      for (const c of visible) if (!isOwned(c)) n.add(c.id);
      return n;
    });
  }
  function exitSelect() {
    setSelecting(false);
    setPicked(new Set());
  }
  /** Sélection validée : direction la page d'ajout en lot (prix, valeur, état, quantité carte par carte) */
  function addPicked() {
    const chosen = cards.filter((c) => picked.has(c.id));
    if (chosen.length === 0) return;
    saveBatchDraft({
      language: itemLang,
      back: { href: `/extensions/${set.id}${lang === "ja" ? "?lang=ja" : ""}`, label: set.name },
      cards: chosen.map((c) => ({ tcgdex_id: c.id, card_name: c.name, set_id: set.id, set_name: set.name, local_id: c.localId, image_url: c.image ?? "", rarity: c.rarity, price: c.price })),
    });
    router.push("/ajouter/lot");
  }

  const addHref = (c: SetCard) => `/ajouter?card=${encodeURIComponent(c.id)}${c.lang ? `&lang=${c.lang}` : langSuffix}`;
  const numLabel = (c: SetCard) => `${c.localId}${set.official && !c.localId.includes("/") ? ` / ${set.official}` : ""}`;

  return (
    <div>
      <Link href={`/catalogue${lang === "ja" ? "?lang=ja" : ""}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ChevronLeft size={16} aria-hidden /> Catalogue
      </Link>

      {/* ——— En-tête ——— */}
      <div className="mb-5 flex flex-wrap items-center gap-4 lg:gap-6">
        <SetLogo set={set} />
        <div className="min-w-0 flex-1">
          {set.serie && <p className="label-xs text-muted">{set.serie}</p>}
          <h1 className="display text-[28px] font-bold tracking-tight sm:text-3xl">{set.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="num rounded-md bg-raised px-1.5 py-0.5 text-xs uppercase">{set.id}</span>
            <span className="num">
              {set.official ?? total} cartes{set.total > (set.official ?? 0) && set.official ? ` · ${set.total} avec les secrètes` : ""}
            </span>
            {set.releaseDate && <span>{set.releaseDate}</span>}
            {pricesAvailable ? (
              <span className="text-faint">cotes de cette nuit</span>
            ) : (
              <span className="rounded-md bg-raised px-1.5 py-0.5 text-xs text-faint" title="Aucune cote Cardmarket connue pour les cartes de ce set">
                Cote Cardmarket indisponible
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {selecting ? (
            <>
              <button type="button" onClick={selectMissingVisible} className="btn btn-ghost">
                <CheckCheck size={15} aria-hidden /> Cocher les manquantes
              </button>
              <button type="button" onClick={exitSelect} className="btn btn-ghost">
                <X size={15} aria-hidden /> Annuler
              </button>
            </>
          ) : (
            <>
              {binderButton}
              <PhoneCaptureButton kind="detect" label="Scanner" icon="scan" directHref="/scanner" className="btn btn-ghost" />
              <button type="button" onClick={() => setSelecting(true)} className="btn btn-primary shadow-lg shadow-accent/30">
                <ListChecks size={15} aria-hidden /> Ajout rapide
              </button>
            </>
          )}
        </div>
      </div>

      {set.scansMissing && (
        <p className="mb-5 rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-ring">
          TCGdex n&apos;a pas encore les scans de ce set — les cartes sont listées par nom et numéro, et restent ajoutables normalement.
        </p>
      )}

      {/* ——— Chiffres ——— */}
      <StatStrip cols={5}>
        <StatCard
          label="Complétion"
          value={
            <span>
              {ownedCount} <span className="text-base font-medium text-muted">/ {total}</span>
            </span>
          }
          sub={
            <span className="block">
              <span className="mt-1 mb-1 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(ownedCount > 0 ? 2 : 0, pct)}%` }} />
              </span>
              {pct} %{secretOwned > 0 && ` · ${secretOwned} secrète${secretOwned > 1 ? "s" : ""}`}
            </span>
          }
        />
        <StatCard label="Mes cartes du set" value={mine.count > 0 ? formatEur(mine.value) : "—"} sub={mine.count > 0 ? `${mine.count} carte${mine.count > 1 ? "s" : ""}${mine.paid > 0 ? ` · payé ${formatEur(mine.paid)}` : ""}` : "aucune pour l’instant"} />
        <StatCard label="Set complet · cote" value={pricesAvailable ? formatEur(setValue) : "—"} sub={pricesAvailable ? `${priced.length} carte${priced.length > 1 ? "s" : ""} cotée${priced.length > 1 ? "s" : ""}` : "cote indisponible"} />
        <StatCard label="Pour finir le set" value={pricesAvailable ? formatEur(missingValue) : "—"} sub={`${total - ownedCount} manquante${total - ownedCount > 1 ? "s" : ""}`} />
        <StatCard
          label="La plus chère"
          value={dearest ? <span className="text-base">{dearest.name}</span> : "—"}
          sub={dearest ? `${formatEur(dearest.price!)} · ${dearest.localId} · ${isOwned(dearest) ? "possédée ✓" : "manquante"}` : undefined}
        />
      </StatStrip>

      {/* ——— Pour compléter à moindre coût ——— */}
      {cheapest.length > 0 && (
        <section className="panel mt-4 !p-4 sm:!px-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="display text-[15px] font-semibold">Pour compléter à moindre coût</h2>
              <p className="text-xs text-muted">
                Les manquantes les moins chères · les {Math.min(CHEAP_BATCH, cheapest.length)} premières valent{" "}
                <span className="num text-foreground">{formatEur(cheapest.slice(0, CHEAP_BATCH).reduce((s, c) => s + c.price!, 0))}</span> en tout.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={showCheapest} className="btn btn-ghost !py-1.5 text-[13px]">
                Voir les {Math.min(CHEAP_BATCH, cheapest.length)}
              </button>
              <button type="button" onClick={wishCheapest} disabled={busy} className="btn btn-primary !py-1.5 text-[13px]">
                <Star size={13} aria-hidden /> Tout mettre en recherchées
              </button>
            </div>
          </div>
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            {cheapest.slice(0, STRIP).map((c) => (
              <button key={c.id} type="button" onClick={() => openCard(c)} className="group w-[104px] shrink-0 text-left">
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={c.image} alt={c.name} />
                  <span className="tile-badge num bottom-1 left-1 !px-1.5 !text-[10px]">{formatEur(c.price!)}</span>
                  {wished.has(c.id) && (
                    <span className="tile-badge right-1 top-1 flex items-center !bg-accent !text-accent-ink">
                      <Star size={10} fill="currentColor" aria-hidden />
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium group-hover:text-accent-strong">{c.name}</p>
                <p className="num text-[11px] text-faint">{numLabel(c)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ——— Barre d'outils collante ——— */}
      <div id="set-cards" className="sticky top-0 z-20 -mx-4 mt-6 mb-4 scroll-mt-2 bg-background/90 px-4 py-2.5 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou numéro dans ce set" aria-label="Chercher dans le set" className="pill-input basis-full sm:basis-auto sm:!w-60" />
          <div className="scrollbar-none -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:basis-auto sm:px-0">
            {ownTabs.map((t) => (
              <button key={t.code} type="button" data-on={ownFilter === t.code} onClick={() => setOwnFilter(t.code)} className={`seg shrink-0 px-3.5 py-1.5 text-[13px] ${ownFilter === t.code ? "font-medium text-accent-strong" : "text-muted"}`}>
                {t.label} <span className="num text-[11px] opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
          {rarities.length > 1 && (
            <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-on={rarity !== "all"} aria-label="Rareté" className="pill-select !w-auto text-[13px]">
              <option value="all">Toutes raretés · {total}</option>
              {rarities.map(([r, n]) => (
                <option key={r} value={r}>
                  {raritySymbol(r) ? `${raritySymbol(r)} ` : ""}
                  {r === UNKNOWN ? "Autre" : rarityLabel(r)} · {n}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Tri" className="pill-select !w-auto text-[13px]">
              <option value="num">Tri : numéro</option>
              <option value="price">Tri : cote</option>
              <option value="rarity">Tri : rareté</option>
            </select>
            <button type="button" onClick={() => setSortAsc((v) => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground" title={sortAsc ? "Croissant" : "Décroissant"} aria-label={sortAsc ? "Tri croissant" : "Tri décroissant"}>
              {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
            </button>
            <div className="flex overflow-hidden rounded-full bg-surface ring-1 ring-ring">
              <button type="button" onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label="Grille" className={`flex h-8 w-8 items-center justify-center ${view === "grid" ? "bg-raised text-foreground" : "text-muted"}`}>
                <LayoutGrid size={14} aria-hidden />
              </button>
              <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="Liste" className={`flex h-8 w-8 items-center justify-center ${view === "list" ? "bg-raised text-foreground" : "text-muted"}`}>
                <List size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte pour ce filtre.</p>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => (selecting ? togglePick(card.id) : openCard(card))} className="group block w-full text-left">
                <div className={`card-tile aspect-[63/88] ${selecting && picked.has(card.id) ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}>
                  <CardImage base={card.image} alt={card.name} />
                  {selecting && <TileCheck on={picked.has(card.id)} />}
                  {isOwned(card) && (
                    <span className="tile-badge num left-1.5 top-1.5 flex items-center gap-0.5 !bg-gain !text-black">
                      <Check size={11} strokeWidth={3} aria-hidden />
                      {ownedQty[card.id] > 1 ? `×${ownedQty[card.id]}` : ""}
                    </span>
                  )}
                  {wished.has(card.id) && (
                    <span className="tile-badge right-1.5 top-1.5 flex items-center !bg-accent !text-accent-ink">
                      <Star size={11} fill="currentColor" aria-hidden />
                    </span>
                  )}
                  {!selecting && card.price != null && (
                    <span className="tile-badge num bottom-1.5 left-1.5" title="Prix de référence Cardmarket">
                      {formatEur(card.price)}
                    </span>
                  )}
                  {!selecting && !isOwned(card) && (
                    <Link href={addHref(card)} onClick={(e) => e.stopPropagation()} aria-label={`Ajouter ${card.name}`} className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition hover:bg-accent hover:text-white">
                      <Plus size={15} strokeWidth={2.5} aria-hidden />
                    </Link>
                  )}
                </div>
                <div className="mt-2.5 px-0.5">
                  <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">{card.name}</p>
                  <p className="num mt-0.5 text-xs text-faint">
                    {numLabel(card)}
                    {raritySymbol(card.rarity) && <span className="ml-1.5 text-accent-strong">{raritySymbol(card.rarity)}</span>}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="panel divide-y divide-ring !p-0">
          {visible.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => (selecting ? togglePick(card.id) : openCard(card))} className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition hover:bg-raised/60 sm:px-4">
                {selecting && (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${picked.has(card.id) ? "border-transparent bg-accent text-accent-ink" : "border-edge-strong text-transparent"}`} aria-hidden>
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-raised">
                  <CardImage base={card.image} alt="" placeholder="compact" />
                </span>
                <span className="num w-16 shrink-0 text-xs text-faint">{card.localId}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{card.name}</span>
                <span className="hidden w-32 shrink-0 truncate text-xs text-muted sm:block">
                  {raritySymbol(card.rarity) && <span className="mr-1 text-accent-strong">{raritySymbol(card.rarity)}</span>}
                  {card.rarity ? rarityLabel(card.rarity) : ""}
                </span>
                <span className="num w-20 shrink-0 text-right text-sm font-semibold">{card.price != null ? formatEur(card.price) : <span className="font-normal text-faint">—</span>}</span>
                <span className="w-7 shrink-0 text-center">
                  {isOwned(card) ? (
                    <span className="num text-xs font-semibold text-gain">✓{ownedQty[card.id] > 1 ? `×${ownedQty[card.id]}` : ""}</span>
                  ) : wished.has(card.id) ? (
                    <Star size={13} className="inline text-accent" fill="currentColor" aria-hidden />
                  ) : (
                    <span className="text-faint">·</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Fiche express de la carte */}
      <Sheet open={selected != null} onClose={() => setSelected(null)} label={selected?.name ?? "Carte"} size="xl">
        {selected && (
          <CardSpotlight
            inDialog
            card={{
              name: selected.name,
              image: selected.image,
              setName: set.name,
              localId: selected.localId,
              total: set.official,
              rarity: selected.rarity,
              lang: selected.lang && isScanLang(selected.lang) && selected.lang !== "fr" ? ITEM_LANGUAGE[selected.lang] : lang === "ja" ? "JP" : null,
            }}
            price={selected.price}
            cmUrl={cardmarketUrl({ idProduct: selected.cmId, name: selected.name, localId: selected.localId })}
            info={info}
            owned={ownedQty[selected.id] ?? 0}
            setProgress={{ owned: ownedCount, total }}
            wish={{ on: wished.has(selected.id), pending: pendingWish, toggle: () => toggleWish(selected) }}
            actions={
              <Link href={addHref(selected)} className="btn btn-primary w-full !py-3 shadow-lg shadow-accent/30">
                <Plus size={16} aria-hidden />
                Ajouter à ma collection
              </Link>
            }
            secondary={
              <button type="button" onClick={() => addExpress(selected)} disabled={busy} className="btn btn-ghost flex-1" title="Un exemplaire en état NM, à compléter plus tard">
                <Zap size={15} aria-hidden />
                {busy ? "Ajout…" : "Ajout express"}
              </button>
            }
          />
        )}
      </Sheet>

      {/* Barre d'ajout en masse */}
      {selecting && picked.size > 0 && (
        <FloatingBar>
          <button type="button" onClick={() => setPicked(new Set())} aria-label="Tout désélectionner" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground">
            <X size={16} aria-hidden />
          </button>
          <span className="num shrink-0 whitespace-nowrap text-sm font-semibold">{picked.size}</span>
          <button type="button" onClick={selectMissingVisible} title="Cocher les manquantes" aria-label="Cocher les manquantes" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground">
            <CheckCheck size={17} aria-hidden />
          </button>
          <button type="button" onClick={addPicked} className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px]">
            <ArrowRight size={15} aria-hidden />
            Valider
          </button>
        </FloatingBar>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
