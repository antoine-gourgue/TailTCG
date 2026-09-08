"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Plus, Check, ListChecks, X } from "lucide-react";
import { toggleWishlist } from "@/app/wishlist/actions";
import { bulkAddToCollection } from "@/app/items/actions";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { FloatingBar } from "@/components/floating-bar";

export type SetCard = {
  id: string;
  localId: string;
  name: string;
  image: string | null;
  rarity: string | null;
};

/** Ordre d'affichage des raretés (inconnues à la fin) */
const RARITY_ORDER = [
  "Commune",
  "Peu Commune",
  "Rare",
  "Rare Holo",
  "Rare Holo EX",
  "Rare Holo LV.X",
  "Rare Prime",
  "LÉGENDE",
  "Ultra Rare",
  "Magnifique rare",
  "Double rare",
  "Illustration rare",
  "Illustration spéciale rare",
  "Hyper rare",
  "Chromatique rare",
  "Chromatique ultra rare",
  "Rare Secrète",
  "Secrète",
  "Promo",
];

const RARITY_SYMBOLS: Record<string, string> = {
  Commune: "●",
  "Peu Commune": "◆",
  Rare: "★",
  "Rare Holo": "✦",
  "Rare Holo EX": "✦",
  "Rare Holo LV.X": "✦",
  "Rare Prime": "✹",
  LÉGENDE: "▞",
  "Ultra Rare": "✸",
  "Double rare": "★★",
  "Illustration rare": "✧",
  "Illustration spéciale rare": "✧✧",
  "Hyper rare": "🟊",
  "Rare Secrète": "✪",
  Secrète: "✪",
  Promo: "◈",
};

const UNKNOWN = "Autre";

function rarityRank(r: string): number {
  const i = RARITY_ORDER.indexOf(r);
  return i === -1 ? 999 : i;
}

export function SetCardsGrid({
  cards,
  officialCount,
  langSuffix,
  setId,
  setName,
  wishedIds = [],
  ownedQty = {},
}: {
  cards: SetCard[];
  officialCount: number | null;
  langSuffix: string;
  setId: string;
  setName: string;
  wishedIds?: string[];
  /** Quantité possédée (active) par id TCGdex — pour la complétion */
  ownedQty?: Record<string, number>;
}) {
  const isOwned = (c: SetCard) => (ownedQty[c.id] ?? 0) > 0;
  const ownedCount = cards.reduce((n, c) => n + (isOwned(c) ? 1 : 0), 0);
  const total = officialCount ?? cards.length;
  const pct = total > 0 ? Math.round((100 * ownedCount) / total) : 0;
  const [ownFilter, setOwnFilter] = useState<"all" | "owned" | "missing">("all");
  const router = useRouter();
  const lang = langSuffix.includes("lang=ja") ? "JP" : "FR";
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);
  const [selected, setSelected] = useState<SetCard | null>(null);
  const [wished, setWished] = useState<Set<string>>(() => new Set(wishedIds));
  const [pendingWish, startWish] = useTransition();

  function toggleWish(card: SetCard) {
    startWish(async () => {
      const formData = new FormData();
      formData.set("tcgdex_id", card.id);
      formData.set("card_name", card.name);
      formData.set("set_id", setId);
      formData.set("set_name", setName);
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
  // Raretés présentes dans le set, ordonnées, avec compteur
  const rarities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const r = c.rarity ?? UNKNOWN;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => rarityRank(a[0]) - rarityRank(b[0])
    );
  }, [cards]);

  // Tout sélectionné par défaut
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(rarity: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  }

  const visible = cards.filter(
    (c) =>
      !hidden.has(c.rarity ?? UNKNOWN) &&
      (ownFilter === "all" || (ownFilter === "owned" ? isOwned(c) : !isOwned(c)))
  );

  const ownTabs = [
    { code: "all" as const, label: "Toutes", n: cards.length },
    { code: "owned" as const, label: "Possédées", n: ownedCount },
    { code: "missing" as const, label: "Manquantes", n: cards.length - ownedCount },
  ];

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
  async function addPicked() {
    const chosen = cards.filter((c) => picked.has(c.id));
    if (chosen.length === 0) return;
    setBusy(true);
    const res = await bulkAddToCollection(
      chosen.map((c) => ({
        tcgdex_id: c.id,
        card_name: c.name,
        set_id: setId,
        set_name: setName,
        local_id: c.localId,
        image_url: c.image ?? "",
      })),
      lang
    );
    setBusy(false);
    if (res.error) {
      setToast({ message: res.error, tone: "error" });
      return;
    }
    setToast({
      message: `${res.added} carte${res.added > 1 ? "s" : ""} ajoutée${
        res.added > 1 ? "s" : ""
      } — à compléter`,
    });
    exitSelect();
    router.refresh();
  }

  return (
    <div>
      {/* Complétion du set */}
      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">Complétion</span>
          <span className="num text-muted">
            {ownedCount} / {total}
            <span className="text-faint"> · {pct}%</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Filtre possession + ajout rapide */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-edge bg-surface p-0.5">
          {ownTabs.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setOwnFilter(t.code)}
              aria-pressed={ownFilter === t.code}
              className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                ownFilter === t.code
                  ? "bg-raised text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.label} <span className="num text-faint">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selecting && (
            <button
              type="button"
              onClick={selectMissingVisible}
              className="btn btn-ghost !px-2.5 text-[13px]"
            >
              Cocher les manquantes
            </button>
          )}
          <button
            type="button"
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            className="btn btn-ghost !px-2.5 text-[13px]"
          >
            <ListChecks size={14} aria-hidden />
            {selecting ? "Annuler" : "Ajout rapide"}
          </button>
        </div>
      </div>

      {/* Filtres de rareté, façon Pokécardex */}
      {rarities.length > 1 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {rarities.map(([rarity, count]) => {
            const active = !hidden.has(rarity);
            return (
              <button
                key={rarity}
                type="button"
                data-on={active}
                onClick={() => toggle(rarity)}
                title={`${rarity} · ${count} carte${count > 1 ? "s" : ""}`}
                aria-label={`${active ? "Masquer" : "Afficher"} : ${rarity}`}
                className={`seg flex h-10 min-w-10 items-center justify-center px-2 text-base ${
                  active ? "text-accent-strong" : "text-faint opacity-50"
                }`}
              >
                <span aria-hidden>{RARITY_SYMBOLS[rarity] ?? "✶"}</span>
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune carte pour ce filtre.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visible.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => (selecting ? togglePick(card.id) : setSelected(card))}
                className="group block w-full text-left"
              >
                <div
                  className={`card-tile aspect-[63/88] ${
                    isOwned(card) ? "" : "opacity-85"
                  } ${
                    selecting && picked.has(card.id)
                      ? "outline outline-2 outline-offset-2 outline-accent"
                      : ""
                  }`}
                >
                  <CardImage base={card.image} alt={card.name} />
                  {selecting && (
                    <span
                      className={`absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                        picked.has(card.id)
                          ? "border-transparent bg-accent text-accent-ink"
                          : "border-white/50 bg-black/40 text-transparent"
                      }`}
                      aria-hidden
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  )}
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
                </div>
                <div className="mt-2.5 px-0.5">
                  <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                    {card.name}
                  </p>
                  <p className="num mt-0.5 text-xs text-faint">
                    {card.localId}
                    {officialCount ? ` / ${officialCount}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aperçu de la carte */}
      <Sheet
        open={selected != null}
        onClose={() => setSelected(null)}
        label={selected?.name ?? "Carte"}
        size="xs"
      >
        {selected && (
          <div className="mx-auto w-full max-w-[260px] sm:max-w-none">
            <div className="card-tile relative aspect-[63/88]">
              <CardImage base={selected.image} alt={selected.name} quality="high" />
              <button
                type="button"
                onClick={() => toggleWish(selected)}
                disabled={pendingWish}
                title={
                  wished.has(selected.id)
                    ? "Retirer des recherchées"
                    : "Ajouter aux recherchées"
                }
                aria-label={
                  wished.has(selected.id)
                    ? "Retirer des recherchées"
                    : "Ajouter aux recherchées"
                }
                className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition ${
                  wished.has(selected.id)
                    ? "bg-accent text-accent-ink"
                    : "bg-black/60 text-white hover:bg-black/80"
                } ${pendingWish ? "opacity-60" : ""}`}
              >
                <Star
                  size={16}
                  fill={wished.has(selected.id) ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
            </div>

            <div className="mt-4 min-w-0">
              <p className="display truncate text-lg font-semibold leading-tight">
                {selected.name}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {setName}{" "}
                <span className="num text-faint">
                  · {selected.localId}
                  {officialCount ? ` / ${officialCount}` : ""}
                </span>
              </p>
              {selected.rarity && (
                <p className="mt-1.5 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                  {selected.rarity}
                </p>
              )}
            </div>

            <Link
              href={`/ajouter?card=${encodeURIComponent(selected.id)}${langSuffix}`}
              className="btn btn-primary mt-4 w-full"
            >
              <Plus size={15} aria-hidden />
              Ajouter à ma collection
            </Link>
          </div>
        )}
      </Sheet>

      {/* Barre d'ajout en masse */}
      {selecting && picked.size > 0 && (
        <FloatingBar>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            aria-label="Tout désélectionner"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
          >
            <X size={16} aria-hidden />
          </button>
          <span className="num shrink-0 whitespace-nowrap text-sm font-semibold">{picked.size}</span>
          <button
            type="button"
            onClick={addPicked}
            disabled={busy}
            className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px] disabled:opacity-40"
          >
            <Plus size={15} aria-hidden />
            {busy ? "Ajout…" : "Ajouter à ma collection"}
          </button>
        </FloatingBar>
      )}

      {toast && (
        <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
