"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Check, Loader2, ScanLine, Undo2, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { CardScanner, type ConfirmResult, type ScanReview } from "@/components/scan/card-scanner";
import { formatEur } from "@/lib/domain";
import { bulkAddToCollection } from "@/app/items/actions";
import { ownedCopies, undoScannedAdd } from "@/app/scan/actions";
import type { ScanCandidate } from "@/lib/scan/index";
import { addCardUrl, ITEM_LANGUAGE } from "@/lib/scan/url";

/** Carte ajoutée pendant cette session de scan */
type Added = {
  key: string;
  id: string;
  lang: ScanCandidate["lang"];
  name: string;
  setName: string;
  localId: string;
  image: string;
  itemId: string | null;
  /** undefined = cote en cours, null = indisponible */
  price?: number | null;
  priceUrl?: string | null;
  /** Cote TCGplayer japonaise (carte japonaise sans cote Cardmarket) */
  priceSource?: "cardmarket" | "tcgplayer";
};

/** Petit badge de langue, seulement quand la carte n'est pas française */
function LangBadge({ lang }: { lang: ScanCandidate["lang"] }) {
  if (lang === "fr") return null;
  return (
    <span className="ml-1.5 rounded bg-raised px-1 py-0.5 text-[10px] font-semibold text-muted">
      {ITEM_LANGUAGE[lang]}
    </span>
  );
}

/** Session de scan mémorisée le temps de l'onglet : survit à un aller-retour vers une fiche */
const STORE_KEY = "tailtcg-scan-session";
function loadStored(): Added[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Added[]) : [];
  } catch {
    return [];
  }
}
function saveStored(added: Added[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(added));
  } catch {}
}
function clearStored() {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {}
}
const noopSubscribe = () => () => {};

/**
 * Scan direct sur mobile, avec une page dédiée : la caméra s'ouvre et se
 * ferme à volonté (croix → retour à cette page, bouton → réouvrir). Chaque
 * carte reconnue s'affiche dans une fiche (cote, exemplaires déjà possédés) ;
 * un tap l'ajoute à la collection (« quasi parfaite », quantité 1, langue du
 * visuel, à compléter) et elle s'empile ici avec sa cote. Un ajout s'annule
 * depuis la fiche ou depuis la liste ; la fiche complète reste à un tap.
 */
export function ScanClient() {
  // Session restaurée (aller-retour vers une fiche) : on montre alors la liste,
  // sinon la caméra s'ouvre tout de suite pour scanner vite.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [added, setAdded] = useState<Added[]>(loadStored);
  const [scanning, setScanning] = useState<boolean>(() => loadStored().length === 0);
  const seq = useRef(0);

  // Mémorise la session à chaque changement (survit à une navigation vers une fiche)
  useEffect(() => {
    if (mounted) saveStored(added);
  }, [added, mounted]);

  async function quickAdd(card: ScanCandidate): Promise<ConfirmResult> {
    const res = await bulkAddToCollection(
      [
        {
          tcgdex_id: card.id,
          card_name: card.name,
          set_id: card.setId,
          set_name: card.setName,
          local_id: card.localId,
          image_url: card.image,
        },
      ],
      ITEM_LANGUAGE[card.lang],
    );
    if (res.error) return { status: "error", error: res.error };
    const key = `${card.id}-${++seq.current}-${crypto.randomUUID().slice(0, 8)}`;
    const itemId = res.items[0]?.id ?? null;
    setAdded((prev) => [
      { key, id: card.id, lang: card.lang, name: card.name, setName: card.setName, localId: card.localId, image: card.image, itemId },
      ...prev,
    ]);
    return { status: "continue", key: itemId ? key : undefined };
  }

  // Annule un ajout de la session : l'exemplaire part à la corbeille, la carte quitte la liste
  const [undoing, setUndoing] = useState<string | null>(null);
  async function undo(key: string): Promise<boolean> {
    const entry = added.find((a) => a.key === key);
    if (!entry?.itemId) return false;
    setUndoing(key);
    const res = await undoScannedAdd(entry.itemId).catch(() => ({ error: "Annulation impossible." }));
    setUndoing(null);
    if (res.error) return false;
    setAdded((prev) => prev.filter((a) => a.key !== key));
    return true;
  }
  const review: ScanReview = { owned: (card) => ownedCopies(card.id), undo };

  // Cote Cardmarket de chaque carte ajoutée, une seule fois par carte
  const requested = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of added) {
      if (requested.current.has(a.key) || a.price !== undefined) continue;
      requested.current.add(a.key);
      fetch(`/api/scan/price?id=${encodeURIComponent(a.id)}&lang=${a.lang}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { price: number | null; url: string | null; source?: "cardmarket" | "tcgplayer" } | null) => {
          setAdded((prev) =>
            prev.map((x) => (x.key === a.key ? { ...x, price: d?.price ?? null, priceUrl: d?.url ?? null, priceSource: d?.source ?? "cardmarket" } : x)),
          );
        })
        .catch(() => {});
    }
  }, [added]);

  // Avant le montage client : chargeur neutre (le même côté serveur et à
  // l'hydratation), pour choisir caméra ou liste sans décalage d'hydratation.
  if (!mounted) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent-strong" aria-hidden />
      </main>
    );
  }

  if (scanning) {
    return (
      <CardScanner
        onConfirm={quickAdd}
        review={review}
        detailsHref={addCardUrl}
        onClose={() => setScanning(false)}
        title="Scanner"
        noun="ajoutée"
      />
    );
  }

  const total = added.reduce((t, a) => t + (a.price ?? 0), 0);
  const priced = added.filter((a) => a.price != null).length;
  const empty = added.length === 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* En-tête collant, verre dépoli */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge/70 bg-background/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <Link
          href="/collection"
          onClick={clearStored}
          aria-label="Fermer"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-muted transition active:scale-95"
        >
          <X size={18} aria-hidden />
        </Link>
        <p className="display text-[15px] font-semibold">Scanner mes cartes</p>
        <span className="flex h-9 min-w-9 items-center justify-center">
          {!empty && (
            <span className="num rounded-full bg-gain/15 px-2.5 py-1 text-xs font-bold text-gain">{added.length}</span>
          )}
        </span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-40 pt-4">
        {empty ? (
          <div className="flex flex-col items-center gap-4 px-4 pt-16 text-center">
            <span className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <ScanLine size={34} aria-hidden />
              </span>
            </span>
            <p className="display text-xl font-bold">Scanne tes cartes</p>
            <p className="max-w-[16rem] text-sm leading-relaxed text-muted">
              Chaque carte reconnue s&apos;affiche avec sa cote : un tap l&apos;ajoute à ta collection. Ferme la caméra
              quand tu veux, rouvre-la pour continuer.
            </p>
          </div>
        ) : (
          <>
            {/* Résumé */}
            <div className="rise-in overflow-hidden rounded-3xl border border-edge bg-gradient-to-br from-accent-soft/70 to-surface p-5 shadow-[var(--shadow-panel)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="label-xs text-accent-strong">Cette session</p>
                  <p className="display mt-1 text-3xl font-bold leading-none">
                    {added.length}
                    <span className="ml-1.5 text-base font-semibold text-muted">
                      carte{added.length > 1 ? "s" : ""}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="label-xs text-muted">{added.some((a) => a.priceSource === "tcgplayer") ? "Valeur à la cote" : "Valeur Cardmarket"}</p>
                  <p className="num mt-1 text-2xl font-bold leading-none">{priced > 0 ? formatEur(total) : "—"}</p>
                  {priced > 0 && priced < added.length && (
                    <p className="mt-1 text-[11px] text-faint">{priced}/{added.length} cotées</p>
                  )}
                </div>
              </div>
            </div>

            {/* Grille des cartes scannées */}
            <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5">
              {added.map((a) => {
                const tile = (
                  <>
                    <div className="relative">
                      <div className="card-tile aspect-[63/88] w-full">
                        <CardImage base={a.image} alt={a.name} />
                      </div>
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gain text-black shadow">
                        <Check size={12} strokeWidth={3} aria-hidden />
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-center truncate px-0.5 text-xs font-medium leading-tight">
                      <span className="truncate">{a.name}</span>
                      <LangBadge lang={a.lang} />
                    </p>
                    <p className="num px-0.5 text-[11px] leading-tight">
                      {a.price === undefined ? (
                        <span className="text-faint">…</span>
                      ) : a.price === null ? (
                        <span className="text-faint">n° {a.localId}</span>
                      ) : (
                        <span className="font-semibold text-accent-strong" title={a.priceSource === "tcgplayer" ? "Cote TCGplayer japonaise, convertie" : undefined}>
                          {a.priceSource === "tcgplayer" && "≈ "}
                          {formatEur(a.price)}
                        </span>
                      )}
                    </p>
                  </>
                );
                return (
                  <li key={a.key} className="rise-in relative">
                    {a.itemId ? (
                      <Link href={`/carte/${a.itemId}?from=scan`} className="block active:opacity-80">
                        {tile}
                      </Link>
                    ) : (
                      <div>{tile}</div>
                    )}
                    {/* Annuler l'ajout : hors du lien, posé sur la vignette */}
                    {a.itemId && (
                      <button
                        type="button"
                        onClick={() => void undo(a.key)}
                        disabled={undoing != null}
                        aria-label={`Annuler l'ajout de ${a.name}`}
                        title="Annuler l'ajout"
                        className="absolute left-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
                      >
                        {undoing === a.key ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Undo2 size={14} aria-hidden />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      {/* Barre d'action collante */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-edge/70 bg-background/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="btn btn-primary w-full justify-center !py-3.5 text-base shadow-lg"
          >
            <Camera size={19} aria-hidden />
            {empty ? "Ouvrir la caméra" : "Scanner une autre carte"}
          </button>
          {!empty && (
            <Link href="/cartes" onClick={clearStored} className="flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-muted">
              Terminer · voir mes cartes
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
