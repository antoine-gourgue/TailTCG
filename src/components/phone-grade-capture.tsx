"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { createCaptureSession } from "@/app/capture/actions";
import { Sheet } from "@/components/sheet";

/**
 * Desktop : QR code à flasher ; le téléphone prend recto/verso (calques
 * redressés) et l'ordinateur récupère les images dès qu'elles sont déposées.
 */
export function PhoneGradeCapture({ onDone, onClose }: { onDone: (recto: string, verso: string | null) => void; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    (async () => {
      const session = await createCaptureSession("grade");
      if ("error" in session) {
        setError(session.error);
        return;
      }
      const base = process.env.NEXT_PUBLIC_CAPTURE_BASE_URL || window.location.origin;
      const QR = (await import("qrcode")).default;
      setQr(await QR.toDataURL(`${base}/capture/${session.token}`, { margin: 1, width: 240 }));
      while (!stop.current) {
        await new Promise((r) => setTimeout(r, 1500));
        if (stop.current) break;
        try {
          const res = await fetch(`/api/capture/${session.token}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = (await res.json()) as { status: string; result?: { rectoUrl?: string | null; versoUrl?: string | null } };
          if (data.status === "done" && data.result?.rectoUrl) {
            stop.current = true;
            onDone(data.result.rectoUrl, data.result.versoUrl ?? null);
            break;
          }
        } catch {}
      }
    })();
    return () => {
      stop.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet
      open
      onClose={onClose}
      label="Scanner avec ton téléphone"
      z="z-[70]"
      title="Scanner avec ton téléphone"
      description={<>Flashe ce QR code avec l&apos;appareil photo de ton téléphone : il prend le recto puis le verso, l&apos;analyse se fait ici.</>}
    >
      <div className="text-center">
        {error ? (
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
            <Smartphone size={24} className="animate-pulse text-accent-strong" aria-hidden />
          </div>
        )}
      </div>
    </Sheet>
  );
}
