"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ScanLine, Sparkles, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { CardScanner, type ConfirmResult } from "@/components/scan/card-scanner";
import { Logo } from "@/components/logo";
import { formatEur } from "@/lib/domain";
import { bulkAddToCollection } from "@/app/items/actions";
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

/**
 * Scan direct sur mobile, avec une page dédiée : la caméra s'ouvre et se
 * ferme à volonté (croix → retour à cette page, bouton → réouvrir). Chaque
 * carte reconnue s'ajoute d'un geste à la collection (« quasi parfaite »,
 * quantité 1, langue du visuel, à compléter) et s'empile ici avec sa cote ;
 * la fiche complète reste à un tap.
 */
export function ScanClient() {
  // La caméra s'ouvre tout de suite (scan rapide) ; la croix ramène à la liste
  const [scanning, setScanning] = useState(true);
  const [added, setAdded] = useState<Added[]>([]);
  const seq = useRef(0);

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
    const key = `${card.id}-${++seq.current}`;
    setAdded((prev) => [
      { key, id: card.id, lang: card.lang, name: card.name, setName: card.setName, localId: card.localId, image: card.image, itemId: res.items[0]?.id ?? null },
      ...prev,
    ]);
    return { status: "continue" };
  }

  // Cote Cardmarket de chaque carte ajoutée, une seule fois par carte
  const requested = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of added) {
      if (requested.current.has(a.key)) continue;
      requested.current.add(a.key);
      fetch(`/api/scan/price?id=${encodeURIComponent(a.id)}&lang=${a.lang}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { price: number | null; url: string | null } | null) => {
          setAdded((prev) => prev.map((x) => (x.key === a.key ? { ...x, price: d?.price ?? null, priceUrl: d?.url ?? null } : x)));
        })
        .catch(() => {});
    }
  }, [added]);

  if (scanning) {
    return (
      <CardScanner
        onConfirm={quickAdd}
        detailsHref={addCardUrl}
        onClose={() => setScanning(false)}
        title="Scanner"
        noun="ajoutée"
      />
    );
  }

  const total = added.reduce((t, a) => t + (a.price ?? 0), 0);
  const priced = added.filter((a) => a.price != null).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3 py-2">
        <Link href="/" aria-label="Retour à ma collection" className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-muted">
          <X size={18} aria-hidden />
        </Link>
        <p className="display text-base font-semibold">Scanner mes cartes</p>
        <span className="w-10" />
      </header>

      {added.length > 0 ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="panel px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-faint">Ajoutées</p>
              <p className="num mt-0.5 text-xl font-semibold">{added.length}</p>
            </div>
            <div className="panel px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-faint">
                Valeur{priced < added.length ? ` · ${priced}/${added.length}` : ""}
              </p>
              <p className="num mt-0.5 text-xl font-semibold">{priced > 0 ? formatEur(total) : "—"}</p>
            </div>
          </div>

          <ul className="mt-4 flex flex-col gap-2.5">
            {added.map((a) => (
              <li key={a.key} className="panel flex items-center gap-3 p-2.5">
                <div className="card-tile aspect-[63/88] w-12 shrink-0">
                  <CardImage base={a.image} alt={a.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center truncate text-sm font-medium">
                    {a.name}
                    <LangBadge lang={a.lang} />
                  </p>
                  <p className="truncate text-xs text-muted">
                    {a.setName} <span className="num text-faint">· n° {a.localId}</span>
                  </p>
                  <p className="num mt-0.5 text-xs">
                    {a.price === undefined || a.price === null ? (
                      a.price === undefined ? (
                        <span className="text-faint">…</span>
                      ) : (
                        <span className="text-faint">Cote indisponible</span>
                      )
                    ) : (
                      <span className="font-semibold">{formatEur(a.price)}</span>
                    )}
                  </p>
                </div>
                {a.itemId ? (
                  <Link href={`/carte/${a.itemId}`} aria-label="Voir la fiche" className="shrink-0 text-xs text-accent-strong">
                    Fiche
                  </Link>
                ) : (
                  <span className="shrink-0 text-gain">
                    <Check size={16} aria-hidden />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <ScanLine size={30} aria-hidden />
          </span>
          <p className="display text-lg font-bold">Scanne tes cartes</p>
          <p className="max-w-xs text-sm text-muted">
            Chaque carte reconnue s&apos;ajoute à ta collection. Ferme la caméra quand tu veux, rouvre-la pour continuer.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-gradient-to-t from-background via-background pt-3">
        <button type="button" onClick={() => setScanning(true)} className="btn btn-primary w-full justify-center !py-3 text-base">
          <Camera size={18} aria-hidden />
          {added.length > 0 ? "Scanner une autre carte" : "Ouvrir la caméra"}
        </button>
        {added.length > 0 && (
          <Link href="/" className="btn btn-ghost w-full justify-center">
            <Sparkles size={15} aria-hidden />
            Voir ma collection ({added.length})
          </Link>
        )}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-faint">
        <Logo variant="mark" size={14} /> TailTCG · scan mobile
      </p>
    </main>
  );
}
