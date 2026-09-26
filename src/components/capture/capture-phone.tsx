"use client";

import { useState } from "react";
import { Check, Loader2, Send, Plus, X } from "lucide-react";
import { CameraCapture } from "@/components/capture/camera-capture";
import { CardScanner, type ConfirmResult } from "@/components/scan/card-scanner";
import { Logo } from "@/components/logo";
import type { ScanCandidate } from "@/lib/scan/index";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * Côté téléphone, après avoir flashé le QR du desktop :
 * - détection : scanner en continu ; chaque carte reconnue est envoyée à
 *   l'ordinateur et on enchaîne sur la suivante, jusqu'à « Terminer » ;
 * - photos : prises de vue rattachées à un exemplaire.
 */
export function CapturePhone({
  token,
  kind,
}: {
  token: string;
  kind: "detect" | "photos";
}) {
  const [shots, setShots] = useState<string[]>([]);
  const [phase, setPhase] = useState<"capture" | "sending" | "done">("capture");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);

  async function sendDetect(card: ScanCandidate): Promise<ConfirmResult> {
    const res = await fetch(`/api/capture/${token}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: card.id,
        lang: card.lang,
        name: card.name,
        setId: card.setId,
        setName: card.setName,
        localId: card.localId,
        image: card.image,
      }),
    });
    if (!res.ok) return { status: "error", error: "Envoi impossible (session expirée ?)" };
    setSent((n) => n + 1);
    return { status: "continue" };
  }

  async function finishDetect() {
    await fetch(`/api/capture/${token}/finish`, { method: "POST" }).catch(() => {});
    setPhase("done");
  }

  async function sendPhotos() {
    setPhase("sending");
    setError(null);
    const fd = new FormData();
    for (const [i, s] of shots.entries()) {
      fd.append("photos", new File([await dataUrlToBlob(s)], `photo-${i}.jpg`, { type: "image/jpeg" }));
    }
    const res = await fetch(`/api/capture/${token}/photos`, { method: "POST", body: fd });
    if (res.ok) setPhase("done");
    else {
      setError("Envoi impossible (session expirée ?)");
      setPhase("capture");
    }
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gain/15 text-gain">
          <Check size={30} aria-hidden />
        </span>
        <p className="display text-xl font-bold">C&apos;est envoyé !</p>
        <p className="max-w-xs text-sm text-muted">
          {kind === "detect"
            ? sent > 0
              ? `${sent} carte${sent > 1 ? "s" : ""} t'attend${sent > 1 ? "ent" : ""} sur ton ordinateur.`
              : "Retourne sur ton ordinateur."
            : "Retourne sur ton ordinateur : les photos apparaissent sur la fiche."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {kind === "detect" && (
        <CardScanner
          token={token}
          onConfirm={sendDetect}
          title="Scanner pour l'ordinateur"
          noun="envoyée"
          onFinish={finishDetect}
        />
      )}

      {kind === "photos" && phase === "capture" && (
        <CameraCapture onCapture={(dataUrl) => setShots((s) => [...s, dataUrl])} />
      )}

      {kind === "photos" && shots.length > 0 && phase !== "sending" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {shots.map((s, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s} alt="" className="aspect-[63/88] w-full rounded-lg border border-edge object-cover" />
                <button
                  type="button"
                  onClick={() => setShots((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Retirer"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow"
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-loss">{error}</p>}
          <button type="button" onClick={sendPhotos} className="btn btn-primary justify-center">
            <Send size={15} aria-hidden />
            Envoyer {shots.length} photo{shots.length > 1 ? "s" : ""}
          </button>
          <p className="text-center text-xs text-faint">
            <Plus size={11} className="inline" aria-hidden /> Prends d&apos;autres
            photos ci-dessus avant d&apos;envoyer.
          </p>
        </div>
      )}

      {phase === "sending" && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={28} className="animate-spin text-accent-strong" aria-hidden />
          <p className="text-sm text-muted">Envoi…</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-faint">
        <Logo variant="mark" size={16} /> TailTCG · capture mobile
      </div>
    </div>
  );
}
