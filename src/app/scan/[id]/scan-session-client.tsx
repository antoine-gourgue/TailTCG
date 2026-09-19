"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, ListPlus, Loader2, Plus, Smartphone, X } from "lucide-react";
import { CardGrid, TileCaption } from "@/components/card-grid-kit";
import { CardImage } from "@/components/card-image";
import { addCardUrl, isScanLang, ITEM_LANGUAGE } from "@/lib/scan/url";
import {
  addAllScans,
  finishScanSession,
  pollScanSession,
  removeScan,
  skipScan,
  type ScanRow,
  type ScanSessionStatus,
} from "@/app/scan/actions";

const POLL_MS = 2000;

function LangBadge({ lang }: { lang: string }) {
  if (!isScanLang(lang) || lang === "fr") return null;
  return (
    <span className="ml-1.5 rounded bg-raised px-1 py-0.5 text-[10px] font-semibold text-muted">
      {ITEM_LANGUAGE[lang]}
    </span>
  );
}

/**
 * Page de session : QR à flasher tant que la session est ouverte, cartes
 * reçues en direct (sondage), ajout une à une (fiche complète qui enchaîne)
 * ou en masse.
 */
export function ScanSessionClient({
  session,
  initialScans,
}: {
  session: { id: string; token: string; status: ScanSessionStatus; expired: boolean };
  initialScans: ScanRow[];
}) {
  const [scans, setScans] = useState(initialScans);
  const [status, setStatus] = useState<ScanSessionStatus>(session.expired ? "done" : session.status);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const open = status === "pending";

  // QR de la session
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      // En dev, l'origine est localhost (injoignable depuis le téléphone) :
      // NEXT_PUBLIC_CAPTURE_BASE_URL pointe vers l'URL réseau/HTTPS
      const base = process.env.NEXT_PUBLIC_CAPTURE_BASE_URL || window.location.origin;
      const QR = (await import("qrcode")).default;
      const url = await QR.toDataURL(`${base}/capture/${session.token}`, { margin: 1, width: 220 });
      if (alive) setQr(url);
    })();
    return () => {
      alive = false;
    };
  }, [open, session.token]);

  // Les cartes arrivent en direct
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      const r = await pollScanSession(session.id);
      if ("error" in r) return;
      setScans(r.scans);
      setStatus(r.status);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [open, session.id]);

  const pending = scans.filter((s) => s.status === "pending");
  const added = scans.filter((s) => s.status === "added").length;
  const first = pending[0];

  function addAll() {
    setError(null);
    startTransition(async () => {
      const r = await addAllScans(session.id);
      setScans(r.scans);
      if (r.error) setError(r.error);
    });
  }
  function skip(id: string) {
    setScans((prev) => prev.map((s) => (s.id === id ? { ...s, status: "skipped" } : s)));
    startTransition(async () => {
      const r = await skipScan(id);
      if (r.error) setError(r.error);
    });
  }
  function remove(id: string) {
    setScans((prev) => prev.filter((s) => s.id !== id));
    startTransition(async () => {
      const r = await removeScan(id);
      if (r.error) setError(r.error);
    });
  }
  function finish() {
    setStatus("done");
    startTransition(async () => {
      const r = await finishScanSession(session.id);
      if (r.error) setError(r.error);
    });
  }

  const subtitle = !open
    ? added > 0
      ? `Session terminée · ${added} carte${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}`
      : "Session terminée"
    : scans.length === 0
      ? "Flashe le QR avec ton téléphone et scanne tes cartes : elles apparaissent ici en direct."
      : `${scans.length} carte${scans.length > 1 ? "s" : ""} reçue${scans.length > 1 ? "s" : ""} · le téléphone peut continuer`;

  return (
    <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-xs flex items-center gap-1.5 text-muted">
            <Smartphone size={13} aria-hidden />
            Scan depuis le téléphone
          </p>
          <h1 className="display mt-1 text-3xl font-bold tracking-tight">Cartes scannées</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {pending.length > 0 && first && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={addCardUrl({ id: first.tcgdex_id, lang: first.lang, scan: first.id })}
              className="btn btn-ghost"
            >
              <Plus size={15} aria-hidden />
              Ajouter une à une
            </Link>
            <button type="button" onClick={addAll} disabled={busy} className="btn btn-primary">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ListPlus size={15} aria-hidden />}
              Tout ajouter ({pending.length})
            </button>
          </div>
        )}
      </div>
      {error && <p className="mb-4 text-sm text-loss">{error}</p>}

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Téléphone */}
        <aside className="w-full max-w-60 shrink-0 md:sticky md:top-20 md:self-start">
          <div className="panel p-4 text-center">
            {open ? (
              <>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code de la session" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                ) : (
                  <div className="mx-auto flex h-44 w-44 items-center justify-center">
                    <Loader2 size={22} className="animate-spin text-accent-strong" aria-hidden />
                  </div>
                )}
                <p className="mt-3 text-xs text-muted">
                  Flashe ce QR avec l&apos;appareil photo de ton téléphone, puis scanne tes cartes l&apos;une après
                  l&apos;autre.
                </p>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-faint">
                  {scans.length > 0 ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-gain" aria-hidden />
                      Téléphone connecté
                    </>
                  ) : (
                    <>
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                      En attente du téléphone…
                    </>
                  )}
                </p>
                <button type="button" onClick={finish} className="btn btn-ghost mt-4 w-full justify-center text-xs">
                  Terminer la session
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gain/15 text-gain">
                  <Check size={22} aria-hidden />
                </span>
                <p className="text-sm font-medium">Session terminée</p>
                <p className="text-xs text-muted">Le téléphone ne peut plus envoyer de cartes.</p>
                <Link href="/recherche" className="btn btn-ghost mt-2 text-xs">
                  Nouveau scan
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* Cartes reçues */}
        <section className="min-w-0 flex-1">
          {scans.length === 0 ? (
            <div className="panel flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Smartphone size={28} className="text-faint" aria-hidden />
              <p className="text-sm font-medium">Aucune carte pour l&apos;instant</p>
              <p className="max-w-sm text-sm text-muted">
                Sur le téléphone, chaque carte reconnue puis « Envoyer sur l&apos;ordinateur » apparaît ici.
              </p>
            </div>
          ) : (
            <CardGrid>
              {scans.map((s) => {
                const isPending = s.status === "pending";
                return (
                  <li key={s.id} className="group">
                    <div className="relative">
                      <div className={`card-tile aspect-[63/88] ${isPending ? "" : "opacity-60"}`}>
                        <CardImage base={s.image || null} alt={s.name} />
                      </div>
                      {s.status === "added" && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gain px-2 py-0.5 text-[11px] font-semibold text-black shadow">
                          <Check size={11} aria-hidden />
                          Ajoutée
                        </span>
                      )}
                      {s.status === "skipped" && (
                        <span className="absolute left-2 top-2 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted shadow">
                          Passée
                        </span>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => remove(s.id)}
                          aria-label="Retirer"
                          title="Retirer de la liste"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                    <TileCaption
                      name={s.name}
                      sub={
                        <>
                          {s.set_name} <span className="num">· n° {s.local_id}</span>
                          <LangBadge lang={s.lang} />
                        </>
                      }
                    />
                    {isPending ? (
                      <div className="mt-2 flex gap-1.5">
                        <Link
                          href={addCardUrl({ id: s.tcgdex_id, lang: s.lang, scan: s.id })}
                          className="btn btn-ghost flex-1 justify-center !px-3 !py-1.5 text-xs"
                        >
                          <Plus size={13} aria-hidden />
                          Ajouter
                        </Link>
                        <button
                          type="button"
                          onClick={() => skip(s.id)}
                          className="btn btn-ghost !px-3 !py-1.5 text-xs"
                          title="Ne pas ajouter cette carte"
                        >
                          Passer
                        </button>
                      </div>
                    ) : s.status === "added" && s.item_id ? (
                      <Link href={`/carte/${s.item_id}`} className="mt-2 inline-block text-xs text-accent-strong hover:underline">
                        Voir la fiche
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </CardGrid>
          )}
        </section>
      </div>
    </main>
  );
}
