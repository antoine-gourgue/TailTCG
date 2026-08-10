"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, X, Check, Loader2 } from "lucide-react";
import { createCaptureSession } from "@/app/capture/actions";

/**
 * Bouton desktop : ouvre une session de capture, affiche un QR à flasher,
 * et attend (polling) le résultat du téléphone.
 */
export function PhoneCaptureButton({
  kind,
  itemId,
  label,
  className = "btn btn-ghost",
  onDetect,
}: {
  kind: "detect" | "photos";
  itemId?: string;
  label: string;
  className?: string;
  /** Détection : reçoit la requête lue sur le téléphone (sinon navigue) */
  onDetect?: (query: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    if (!open) return;
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
      const base =
        process.env.NEXT_PUBLIC_CAPTURE_BASE_URL || window.location.origin;
      const url = `${base}/capture/${token}`;
      const QR = (await import("qrcode")).default;
      setQr(await QR.toDataURL(url, { margin: 1, width: 240 }));

      // Polling de l'état
      while (!stop.current) {
        await new Promise((r) => setTimeout(r, 1500));
        if (stop.current) break;
        try {
          const res = await fetch(`/api/capture/${token}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === "done") {
            setDone(true);
            if (kind === "detect") {
              const q = String(data.result?.query ?? "");
              setTimeout(() => {
                setOpen(false);
                if (onDetect) onDetect(q);
                else router.push(`/recherche?q=${encodeURIComponent(q)}`);
              }, 700);
            } else {
              setTimeout(() => {
                setOpen(false);
                router.refresh();
              }, 700);
            }
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQr(null);
          setError(null);
          setDone(false);
          setOpen(true);
        }}
        className={className}
      >
        <Smartphone size={15} aria-hidden />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="panel rise-in relative w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>

            <p className="display text-base font-semibold">
              {kind === "detect" ? "Scanner avec ton téléphone" : "Photographier avec ton téléphone"}
            </p>
            <p className="mx-auto mt-1 mb-5 max-w-xs text-sm text-muted">
              Flashe ce QR code avec l&apos;appareil photo de ton téléphone, puis
              {kind === "detect" ? " scanne la carte." : " prends les photos."}
            </p>

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
              <div className="flex flex-col items-center gap-4">
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
        </div>
      )}
    </>
  );
}
