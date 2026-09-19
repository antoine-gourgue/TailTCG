"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import { CardImage } from "@/components/card-image";
import type { ScanCandidate, ScanResult } from "@/lib/scan/index";

/** Cadre-guide : 80 % de la largeur, format carte */
const GUIDE_W = 0.8;
const GUIDE_RATIO = 63 / 88;
/** Cadence d'analyse et taille de l'image envoyée (largeur px) */
const TICK_MS = 450;
const FRAME_W = 320;

type Phase = "scanning" | "locked" | "choose";

/**
 * Scanner de carte en continu : la caméra arrière filme, le cadre-guide est
 * analysé toutes les ~0,5 s par l'API de reconnaissance (empreintes contre
 * le catalogue). Une carte vue deux fois de suite est verrouillée et proposée
 * à l'ajout ; s'il y a plusieurs versions (réimpressions), on laisse choisir.
 */
export function CardScanner({
  token,
  onConfirm,
  confirmLabel = "Ajouter cette carte",
}: {
  /** Relais QR : jeton de la session (sinon l'utilisateur connecté fait foi) */
  token?: string;
  onConfirm: (card: ScanCandidate) => void | Promise<void>;
  confirmLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inflight = useRef(false);
  const lastId = useRef<string | null>(null);
  const lastAmbig = useRef<string>("");
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glimpse, setGlimpse] = useState<ScanCandidate | null>(null);
  const [locked, setLocked] = useState<ScanCandidate | null>(null);
  const [choices, setChoices] = useState<ScanCandidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Caméra arrière
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch {
        setError("Caméra inaccessible. Autorise l'accès dans ton navigateur.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** Recadre le cadre-guide depuis la vidéo (object-cover) en JPEG léger */
  function grabFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const elW = video.clientWidth;
    const elH = video.clientHeight;
    const scale = Math.max(elW / vw, elH / vh);
    const offX = (vw * scale - elW) / 2;
    const offY = (vh * scale - elH) / 2;
    const gW = elW * GUIDE_W;
    const gH = gW / GUIDE_RATIO;
    const sx = ((elW - gW) / 2 + offX) / scale;
    const sy = ((elH - gH) / 2 + offY) / scale;
    const sw = gW / scale;
    const sh = gH / scale;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    canvas.width = FRAME_W;
    canvas.height = Math.round(FRAME_W / GUIDE_RATIO);
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.72));
  }

  // Boucle d'analyse
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(async () => {
      if (phaseRef.current !== "scanning" || inflight.current) return;
      const blob = await grabFrame();
      if (!blob) return;
      inflight.current = true;
      try {
        const res = await fetch(`/api/scan/match${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok) return;
        const data: ScanResult = await res.json();
        setTicks((t) => t + 1);
        if (data.status === "match") {
          const top = data.candidates[0];
          setGlimpse(top);
          if (lastId.current === top.id) {
            // Stable sur deux analyses : on verrouille
            navigator.vibrate?.(30);
            setLocked(top);
            setPhase("locked");
          }
          lastId.current = top.id;
          lastAmbig.current = "";
        } else if (data.status === "ambiguous") {
          const key = data.candidates.map((c) => c.id).join("|");
          setGlimpse(data.candidates[0]);
          if (lastAmbig.current === key) {
            navigator.vibrate?.(20);
            setChoices(data.candidates);
            setPhase("choose");
          }
          lastAmbig.current = key;
          lastId.current = null;
        } else {
          lastId.current = null;
          lastAmbig.current = "";
          setGlimpse(null);
        }
      } catch {
        // réseau : on réessaie au tick suivant
      } finally {
        inflight.current = false;
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, token]);

  function rescan() {
    lastId.current = null;
    lastAmbig.current = "";
    setLocked(null);
    setChoices([]);
    setGlimpse(null);
    setPhase("scanning");
  }

  async function confirm(card: ScanCandidate) {
    setConfirming(true);
    try {
      await onConfirm(card);
    } finally {
      setConfirming(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <RefreshCw size={32} className="text-faint" aria-hidden />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />

        {/* Cadre-guide + ligne de scan */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`relative overflow-hidden rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-colors ${
              phase === "locked" ? "border-gain" : glimpse ? "border-accent" : "border-white/90"
            }`}
            style={{ width: `${GUIDE_W * 100}%`, aspectRatio: "63 / 88" }}
          >
            {phase === "scanning" && ready && (
              <span
                aria-hidden
                className="absolute inset-x-0 h-0.5 bg-accent/90 shadow-[0_0_12px_2px_rgba(240,72,62,.7)]"
                style={{ animation: "scan-beam 1.6s ease-in-out infinite" }}
              />
            )}
          </div>
        </div>

        {/* Bandeau d'état */}
        <div className="absolute inset-x-0 top-0 flex justify-center pt-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
            {phase === "scanning" ? (
              glimpse ? (
                <>
                  <Sparkles size={13} className="text-accent-strong" aria-hidden />
                  Ça ressemble à <span className="font-semibold">{glimpse.name}</span>… ne bouge plus
                </>
              ) : (
                <>
                  <ScanLine size={13} aria-hidden />
                  {ready ? "Cadre la carte dans le rectangle" : "Démarrage de la caméra…"}
                </>
              )
            ) : phase === "locked" ? (
              <>
                <Check size={13} className="text-gain" aria-hidden />
                Carte reconnue
              </>
            ) : (
              <>
                <Sparkles size={13} aria-hidden />
                Plusieurs versions : choisis la tienne
              </>
            )}
          </span>
        </div>
        {ticks > 8 && phase === "scanning" && !glimpse && (
          <p className="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
            Rapproche-toi, évite les reflets, garde la carte bien droite.
          </p>
        )}
      </div>

      {/* Carte verrouillée */}
      {phase === "locked" && locked && (
        <div className="panel flex items-center gap-4 p-4">
          <div className="card-tile w-20 shrink-0 aspect-[63/88]">
            <CardImage base={locked.image} alt={locked.name} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="display truncate text-lg font-semibold leading-tight">{locked.name}</p>
            <p className="mt-0.5 truncate text-sm text-muted">
              {locked.setName} <span className="num text-faint">· {locked.localId}</span>
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={rescan} className="btn btn-ghost !px-3" disabled={confirming}>
                <RotateCcw size={14} aria-hidden />
                Rescanner
              </button>
              <button
                type="button"
                onClick={() => confirm(locked)}
                disabled={confirming}
                className="btn btn-primary flex-1 justify-center"
              >
                <Check size={15} aria-hidden />
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Versions à départager */}
      {phase === "choose" && (
        <div className="panel flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">Même visuel dans plusieurs sets. Laquelle as-tu en main ?</p>
          <ul className="flex flex-col gap-2">
            {choices.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => confirm(c)}
                  disabled={confirming}
                  className="flex w-full items-center gap-3 rounded-xl border border-edge px-3 py-2 text-left transition hover:border-accent/60 hover:bg-raised"
                >
                  <div className="card-tile w-12 shrink-0 aspect-[63/88]">
                    <CardImage base={c.image} alt={c.name} />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.setName} <span className="num text-faint">· {c.localId}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={rescan} className="btn btn-ghost justify-center">
            <RotateCcw size={14} aria-hidden />
            Rescanner
          </button>
        </div>
      )}
    </div>
  );
}
