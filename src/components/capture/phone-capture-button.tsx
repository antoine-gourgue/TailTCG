"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Check, Loader2 } from "lucide-react";
import { createCaptureSession } from "@/app/capture/actions";
import { Sheet } from "@/components/sheet";

/**
 * Bouton desktop « avec ton téléphone ».
 * - Scan : ouvre une session et va sur sa page (QR à flasher, cartes reçues
 *   en direct, ajout une à une ou en masse). Sur écran tactile, on scanne
 *   directement.
 * - Photos : QR dans une feuille, puis attente (sondage) des photos.
 */
export function PhoneCaptureButton({
  kind,
  itemId,
  label,
  className = "btn btn-ghost",
  directHref,
}: {
  kind: "detect" | "photos";
  itemId?: string;
  label: string;
  className?: string;
  /** Sur écran tactile (téléphone), on scanne directement à cette adresse plutôt que via le QR */
  directHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [starting, startTransition] = useTransition();
  const stop = useRef(false);

  // Photos : session + QR + sondage jusqu'à réception
  useEffect(() => {
    if (!open || kind !== "photos") return;
    stop.current = false;

    (async () => {
      const session = await createCaptureSession(kind, itemId);
      if ("error" in session) {
        setError(session.error);
        return;
      }
      const token = session.token;
      // En dev, window.location.origin = localhost (injoignable depuis le
      // téléphone). NEXT_PUBLIC_CAPTURE_BASE_URL permet de pointer vers
      // l'URL réseau/HTTPS ; en prod, l'origine suffit.
      const base = process.env.NEXT_PUBLIC_CAPTURE_BASE_URL || window.location.origin;
      const url = `${base}/capture/${token}`;
      const QR = (await import("qrcode")).default;
      setQr(await QR.toDataURL(url, { margin: 1, width: 240 }));

      while (!stop.current) {
        await new Promise((r) => setTimeout(r, 1500));
        if (stop.current) break;
        try {
          const res = await fetch(`/api/capture/${token}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === "done") {
            setDone(true);
            setTimeout(() => {
              setOpen(false);
              router.refresh();
            }, 700);
            break;
          }
        } catch {}
      }
    })();

    return () => {
      stop.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function start() {
    if (directHref && window.matchMedia("(pointer: coarse)").matches) {
      router.push(directHref);
      return;
    }
    if (kind === "detect") {
      setError(null);
      startTransition(async () => {
        const session = await createCaptureSession("detect");
        if ("error" in session) {
          setError(session.error);
          setOpen(true);
          return;
        }
        router.push(`/scan/${session.id}`);
      });
      return;
    }
    setQr(null);
    setError(null);
    setDone(false);
    setOpen(true);
  }

  return (
    <>
      <button type="button" onClick={start} disabled={starting} className={className}>
        {starting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Smartphone size={15} aria-hidden />}
        {label}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={kind === "detect" ? "Scanner avec ton téléphone" : "Photographier avec ton téléphone"}
        description={
          kind === "detect" ? null : (
            <>Flashe ce QR code avec l&apos;appareil photo de ton téléphone, puis prends les photos.</>
          )
        }
      >
        <div className="text-center">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gain/15 text-gain">
                <Check size={26} aria-hidden />
              </span>
              <p className="text-sm text-muted">Reçu !</p>
            </div>
          ) : error ? (
            <p className="py-8 text-sm text-loss">{error}</p>
          ) : qr ? (
            <div className="flex flex-col items-center gap-4 pt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code" className="h-56 w-56 rounded-xl bg-white p-2" />
              <p className="flex items-center gap-2 text-xs text-faint">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                En attente du téléphone…
              </p>
            </div>
          ) : (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent-strong" aria-hidden />
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
