"use client";

import { useState } from "react";
import { Check, Loader2, ScanLine, Send, Plus, X } from "lucide-react";
import { CameraCapture } from "@/components/capture/camera-capture";
import { Logo } from "@/components/logo";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Charge un dataURL en image */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/** Recadre une bande (fractions de l'image) et renvoie un canvas agrandi */
function cropBand(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const sw = img.naturalWidth * w;
  const sh = img.naturalHeight * h;
  const zoom = 2; // agrandir aide l'OCR
  c.width = sw * zoom;
  c.height = sh * zoom;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(
    img,
    img.naturalWidth * x,
    img.naturalHeight * y,
    sw,
    sh,
    0,
    0,
    c.width,
    c.height
  );
  return c;
}

/**
 * OCR ciblé : le nom en haut de la carte, le numéro (« 88/95 ») en bas.
 * Beaucoup plus fiable que d'OCR toute la carte (qui lit le texte d'attaque).
 */
async function ocrCard(dataUrl: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const img = await loadImg(dataUrl);

  // Nom : bande du haut (hors bordure)
  const nameCanvas = cropBand(img, 0.06, 0.03, 0.88, 0.12);
  // Numéro : bande du bas
  const numCanvas = cropBand(img, 0.04, 0.9, 0.92, 0.09);

  const nameWorker = await createWorker("eng");
  const { data: nameData } = await nameWorker.recognize(nameCanvas);
  await nameWorker.terminate();

  const numWorker = await createWorker("eng");
  await numWorker.setParameters({ tessedit_char_whitelist: "0123456789/ " });
  const { data: numData } = await numWorker.recognize(numCanvas);
  await numWorker.terminate();

  const nameLine = (nameData.text ?? "")
    .split("\n")
    .map((l) => l.replace(/[^a-zA-Zà-ÿ' -]/g, "").trim())
    .filter((l) => l.replace(/[^a-zà-ÿ]/gi, "").length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  const numMatch = (numData.text ?? "").match(/(\d{1,3})\s*\/\s*(\d{1,3})/);

  return [
    (nameLine ?? "").slice(0, 40).trim(),
    numMatch ? numMatch[1] : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function CapturePhone({
  token,
  kind,
}: {
  token: string;
  kind: "detect" | "photos";
}) {
  const [shots, setShots] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"capture" | "review" | "sending" | "done">("capture");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCapture(dataUrl: string) {
    if (kind === "detect") {
      setShots([dataUrl]);
      setPhase("review");
      setOcrBusy(true);
      try {
        setQuery(await ocrCard(dataUrl));
      } catch {
        setQuery("");
      }
      setOcrBusy(false);
    } else {
      setShots((s) => [...s, dataUrl]);
    }
  }

  async function sendDetect() {
    setPhase("sending");
    setError(null);
    const res = await fetch(`/api/capture/${token}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (res.ok) setPhase("done");
    else {
      setError("Envoi impossible (session expirée ?)");
      setPhase("review");
    }
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
            ? "Retourne sur ton ordinateur : la carte s'ouvre automatiquement."
            : "Retourne sur ton ordinateur : les photos apparaissent sur la fiche."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {phase === "capture" && <CameraCapture onCapture={onCapture} />}

      {phase === "review" && kind === "detect" && (
        <div className="flex flex-col gap-4">
          {shots[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shots[0]} alt="Carte" className="mx-auto max-h-64 rounded-xl border border-edge" />
          )}
          <div>
            <p className="label-xs mb-1.5 flex items-center gap-2">
              <ScanLine size={13} aria-hidden />
              Carte détectée {ocrBusy && <Loader2 size={12} className="animate-spin" aria-hidden />}
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom et/ou numéro…"
              className="field"
            />
            <p className="mt-1.5 text-xs text-faint">
              Vérifie ou corrige, puis envoie — la recherche se lancera sur
              l&apos;ordinateur.
            </p>
          </div>
          {error && <p className="text-xs text-loss">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhase("capture")} className="btn btn-ghost">
              Reprendre
            </button>
            <button type="button" onClick={sendDetect} disabled={!query.trim()} className="btn btn-primary flex-1 justify-center disabled:opacity-50">
              <Send size={15} aria-hidden />
              Envoyer
            </button>
          </div>
        </div>
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
