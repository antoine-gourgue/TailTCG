"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, ListPlus, Loader2, Plus, RotateCcw, ScanLine, SkipForward, Smartphone, Trash2, X, Zap } from "lucide-react";
import { SELECTED_RING, TileCaption } from "@/components/card-grid-kit";
import { CardImage } from "@/components/card-image";
import { CardSpotlight } from "@/components/card-spotlight";
import { Sheet } from "@/components/sheet";
import { formatEur } from "@/lib/domain";
import { addCardUrl, isScanLang, ITEM_LANGUAGE } from "@/lib/scan/url";
import { createCaptureSession } from "@/app/capture/actions";
import {
  addAllScans,
  addOneScan,
  finishScanSession,
  pollScanSession,
  removeScan,
  restoreScan,
  skipScan,
  type ScanDetails,
  type ScanRow,
  type ScanSessionStatus,
} from "@/app/scan/actions";

const POLL_MS = 2000;
const scanKey = (r: Pick<ScanRow, "lang" | "tcgdex_id">) => `${r.lang}/${r.tcgdex_id}`;

/** Le détail s'affiche en colonne à partir de lg, en feuille en dessous */
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getWide = () => window.matchMedia(WIDE_QUERY).matches;
const getWideOnServer = () => true;

function LangBadge({ lang, className = "" }: { lang: string; className?: string }) {
  if (!isScanLang(lang) || lang === "fr") return null;
  return (
    <span className={`rounded bg-raised px-1 py-0.5 text-[10px] font-semibold text-muted ${className}`}>
      {ITEM_LANGUAGE[lang]}
    </span>
  );
}

const STATUS_LABEL: Record<ScanRow["status"], string> = { pending: "En attente", added: "Ajoutée", skipped: "Passée" };

/**
 * Page de session (desktop) : QR à flasher tant que la session est ouverte,
 * cartes reçues en direct (sondage) avec leur cote, détail de la carte
 * choisie (rareté, Cardmarket, ajout rapide ou fiche complète), ajout en
 * masse, et nouveau scan qui rouvre une session d'un clic.
 */
export function ScanSessionClient({
  session,
  initialScans,
  initialDetails,
}: {
  session: { id: string; token: string; status: ScanSessionStatus; expired: boolean };
  initialScans: ScanRow[];
  initialDetails: ScanDetails;
}) {
  const router = useRouter();
  const [scans, setScans] = useState(initialScans);
  const [details, setDetails] = useState<ScanDetails>(initialDetails);
  const [status, setStatus] = useState<ScanSessionStatus>(session.expired ? "done" : session.status);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [starting, startNew] = useTransition();
  const knownIds = useRef(new Set(initialScans.map((s) => s.id)));
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideOnServer);
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

  // Les cartes arrivent en direct ; la dernière reçue est mise en avant
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      const r = await pollScanSession(session.id);
      if ("error" in r) return;
      setScans(r.scans);
      setDetails((d) => ({ ...d, ...r.details }));
      setStatus(r.status);
      const fresh = r.scans.filter((s) => !knownIds.current.has(s.id));
      if (fresh.length) {
        for (const s of fresh) knownIds.current.add(s.id);
        setSelectedId(fresh[fresh.length - 1].id);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [open, session.id]);

  const pending = scans.filter((s) => s.status === "pending");
  const added = scans.filter((s) => s.status === "added");
  const kept = scans.filter((s) => s.status !== "skipped");
  const total = kept.reduce((t, s) => t + (details[scanKey(s)]?.price ?? 0), 0);
  const priced = kept.filter((s) => details[scanKey(s)]?.price != null).length;
  const selected = scans.find((s) => s.id === selectedId) ?? null;
  const first = pending[0];
  // Dernières reçues en premier
  const ordered = [...scans].reverse();

  function addAll() {
    setError(null);
    startTransition(async () => {
      const r = await addAllScans(session.id);
      setScans(r.scans);
      if (r.error) setError(r.error);
    });
  }
  function addOne(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await addOneScan(id);
      if (r.error) setError(r.error);
      if (r.scan) setScans((prev) => prev.map((s) => (s.id === id ? r.scan! : s)));
    });
  }
  function skip(id: string) {
    setScans((prev) => prev.map((s) => (s.id === id ? { ...s, status: "skipped" } : s)));
    startTransition(async () => {
      const r = await skipScan(id);
      if (r.error) setError(r.error);
    });
  }
  function restore(id: string) {
    setScans((prev) => prev.map((s) => (s.id === id ? { ...s, status: "pending" } : s)));
    startTransition(async () => {
      const r = await restoreScan(id);
      if (r.error) setError(r.error);
    });
  }
  function remove(id: string) {
    setScans((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
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
  /** Ouvre directement une nouvelle session (en fermant celle-ci si elle est encore ouverte) */
  function newScan() {
    setError(null);
    startNew(async () => {
      if (open) await finishScanSession(session.id);
      const s = await createCaptureSession("detect");
      if ("error" in s) {
        setError(s.error);
        return;
      }
      router.push(`/scan/${s.id}`);
    });
  }

  const subtitle = !open
    ? added.length > 0
      ? `Session terminée · ${added.length} carte${added.length > 1 ? "s" : ""} ajoutée${added.length > 1 ? "s" : ""}`
      : "Session terminée"
    : scans.length === 0
      ? "Flashe le QR avec ton téléphone et scanne tes cartes : elles apparaissent ici en direct."
      : `${scans.length} carte${scans.length > 1 ? "s" : ""} reçue${scans.length > 1 ? "s" : ""} · le téléphone peut continuer`;

  const detail = selected ? details[scanKey(selected)] : undefined;

  /** Détail de la carte choisie : fiche express + actions selon son statut */
  const detailPanel = selected && (
    <CardSpotlight
      layout={wide ? "stack" : "auto"}
      inDialog={!wide}
      kicker={
        <>
          {selected.status === "added" ? (
            <Check size={12} className="text-gain" aria-hidden />
          ) : selected.status === "skipped" ? (
            <SkipForward size={12} aria-hidden />
          ) : (
            <Smartphone size={12} aria-hidden />
          )}
          {STATUS_LABEL[selected.status]}
        </>
      }
      card={{
        name: selected.name,
        image: selected.image || null,
        setName: selected.set_name,
        localId: selected.local_id,
        rarity: detail === undefined ? undefined : (detail.rarity ?? null),
        lang: isScanLang(selected.lang) && selected.lang !== "fr" ? ITEM_LANGUAGE[selected.lang] : null,
      }}
      price={detail === undefined ? "loading" : detail.price}
      cmUrl={detail?.cmUrl ?? null}
      actions={
        <>
        {selected.status === "pending" && (
          <>
            <button type="button" onClick={() => addOne(selected.id)} disabled={busy} className="btn btn-primary w-full justify-center">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Zap size={15} aria-hidden />}
              Ajouter à ma collection
            </button>
            <Link href={addCardUrl({ id: selected.tcgdex_id, lang: selected.lang, scan: selected.id })} className="btn btn-ghost w-full justify-center">
              <Plus size={15} aria-hidden />
              Ajouter avec les détails
            </Link>
            <p className="text-center text-[11px] text-faint">
              Ajout direct : quasi parfaite, quantité 1, à compléter plus tard.
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => skip(selected.id)} className="btn btn-ghost flex-1 justify-center text-xs">
                <SkipForward size={13} aria-hidden />
                Passer
              </button>
              <button type="button" onClick={() => remove(selected.id)} className="btn btn-ghost flex-1 justify-center text-xs">
                <Trash2 size={13} aria-hidden />
                Retirer
              </button>
            </div>
          </>
        )}
        {selected.status === "skipped" && (
          <>
            <button type="button" onClick={() => restore(selected.id)} className="btn btn-ghost w-full justify-center">
              <RotateCcw size={14} aria-hidden />
              Remettre en attente
            </button>
            <button type="button" onClick={() => remove(selected.id)} className="btn btn-ghost w-full justify-center text-xs">
              <Trash2 size={13} aria-hidden />
              Retirer
            </button>
          </>
        )}
        {selected.status === "added" && (
          selected.item_id ? (
            <Link href={`/carte/${selected.item_id}`} className="btn btn-primary w-full justify-center">
              Voir la fiche
            </Link>
          ) : (
            <p className="text-center text-xs text-muted">Ajoutée à ta collection.</p>
          )
        )}
        </>
      }
    />
  );

  return (
    <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-xs flex items-center gap-1.5 text-muted">
            <Smartphone size={13} aria-hidden />
            Scan depuis le téléphone
          </p>
          <h1 className="display mt-1 text-3xl font-bold tracking-tight">Cartes scannées</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pending.length > 0 && first && (
            <>
              <Link href={addCardUrl({ id: first.tcgdex_id, lang: first.lang, scan: first.id })} className="btn btn-ghost">
                <Plus size={15} aria-hidden />
                Une à une
              </Link>
              <button type="button" onClick={addAll} disabled={busy} className="btn btn-primary">
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ListPlus size={15} aria-hidden />}
                Tout ajouter ({pending.length})
              </button>
            </>
          )}
          {!open && (
            <button type="button" onClick={newScan} disabled={starting} className="btn btn-primary">
              {starting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ScanLine size={15} aria-hidden />}
              Nouveau scan
            </button>
          )}
        </div>
      </div>

      {/* Bilan de la session */}
      {scans.length > 0 && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Reçues", value: String(scans.length) },
            { label: "En attente", value: String(pending.length) },
            { label: "Ajoutées", value: String(added.length) },
            {
              label: priced < kept.length ? `Valeur estimée · ${priced}/${kept.length} cotées` : "Valeur estimée",
              value: priced > 0 ? formatEur(total) : "—",
            },
          ].map((s) => (
            <div key={s.label} className="panel px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-faint">{s.label}</dt>
              <dd className="num mt-0.5 text-xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
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
                <button type="button" onClick={newScan} disabled={starting} className="btn btn-primary mt-2 w-full justify-center text-sm">
                  {starting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScanLine size={14} aria-hidden />}
                  Nouveau scan
                </button>
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
                Sur le téléphone, chaque carte reconnue puis « Envoyer sur l&apos;ordinateur » apparaît ici, avec sa
                cote.
              </p>
            </div>
          ) : (
            <ul className="rise-in grid gap-x-4 gap-y-6 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {ordered.map((s) => {
                const isPending = s.status === "pending";
                const d = details[scanKey(s)];
                const isSelected = s.id === selectedId;
                return (
                  <li key={s.id} className="group">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected && !wide ? null : s.id)}
                        aria-pressed={isSelected}
                        aria-label={`${s.name}, ${STATUS_LABEL[s.status]}`}
                        className={`card-tile block w-full aspect-[63/88] text-left ${isPending ? "" : "opacity-60"} ${isSelected ? SELECTED_RING : ""}`}
                      >
                        <CardImage base={s.image || null} alt="" />
                      </button>
                      {s.status === "added" && (
                        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gain px-2 py-0.5 text-[11px] font-semibold text-black shadow">
                          <Check size={11} aria-hidden />
                          Ajoutée
                        </span>
                      )}
                      {s.status === "skipped" && (
                        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted shadow">
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
                          <LangBadge lang={s.lang} className="ml-1.5" />
                        </>
                      }
                    />
                    <p className="num mt-0.5 px-0.5 text-xs">
                      {d === undefined ? (
                        <span className="text-faint">…</span>
                      ) : d.price != null ? (
                        <span className="font-semibold">{formatEur(d.price)}</span>
                      ) : (
                        <span className="text-faint">Cote indisponible</span>
                      )}
                    </p>
                    {isPending && (
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => addOne(s.id)}
                          disabled={busy}
                          className="btn btn-ghost min-w-0 flex-1 justify-center !gap-1 !px-2 !py-1.5 text-[11px]"
                          title="Ajouter directement (à compléter plus tard)"
                        >
                          <Zap size={12} aria-hidden />
                          Ajouter
                        </button>
                        <button
                          type="button"
                          onClick={() => skip(s.id)}
                          className="btn btn-ghost !px-2 !py-1.5 text-[11px]"
                          title="Ne pas ajouter cette carte"
                          aria-label="Passer"
                        >
                          <SkipForward size={12} aria-hidden />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Détail de la carte choisie : colonne à partir de lg, feuille en dessous */}
        {wide ? (
          <aside className="hidden w-72 shrink-0 lg:block lg:sticky lg:top-20 lg:self-start">
            <div className="panel p-4">
              {selected ? (
                detailPanel
              ) : (
                <p className="py-10 text-center text-sm text-muted">
                  {scans.length ? "Choisis une carte pour voir sa cote et l'ajouter." : "Le détail de chaque carte s'affichera ici."}
                </p>
              )}
            </div>
          </aside>
        ) : (
          <Sheet open={selected !== null} onClose={() => setSelectedId(null)} label="Détail de la carte" size="xl">
            {detailPanel}
          </Sheet>
        )}
      </div>
    </main>
  );
}
