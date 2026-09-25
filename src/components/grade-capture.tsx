"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, SkipForward } from "lucide-react";
import { ScanEngine, type Quad } from "@/lib/scan/engine";
import { loadImage, warpCardToCanvas, type Pt } from "@/lib/perspective";
import { analyzeRectified, canvasFromUrl, orientationOf, rotate180 } from "@/lib/grading-auto";
import { Sheet } from "@/components/sheet";

/* Réglages de la prise automatique */
const TICK_MS = 130;
/** immobilité requise avant la prise (ms) */
const STABLE_MS = 750;
/** déplacement toléré entre deux images, en fraction de la largeur vidéo */
const STABLE_MOVE = 0.012;
/** la carte doit occuper au moins cette part de la largeur vidéo */
const MIN_WIDTH = 0.3;
/** après une prise, il faut que la carte disparaisse ou bouge franchement avant la suivante */
const REARM_MOVE = 0.15;
const OUT_W = 900;
const OUT_H = Math.round((900 * 88) / 63);
/** le cadre détecté colle aux bords : on l'élargit pour garder les tranches et un peu de fond */
const QUAD_MARGIN = 0.035;

type Phase = "recto" | "verso" | "done";

/**
 * Prise de vues pour la pré-gradation : la caméra détecte la carte (même
 * moteur que le scan), attend qu'elle soit immobile, la redresse en haute
 * résolution et enchaîne recto puis verso. Rend deux data URL WebP.
 */
export function GradeCapture({ onDone, onClose }: { onDone: (recto: string, verso: string | null) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ScanEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("recto");
  const [status, setStatus] = useState("Démarrage de la caméra…");
  const [quad, setQuad] = useState<Pt[] | null>(null);
  const [holding, setHolding] = useState(0);
  const [recto, setRecto] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shots = useRef<{ recto: string | null; verso: string | null }>({ recto: null, verso: null });
  const phaseRef = useRef<Phase>("recto");
  const capturing = useRef(false);

  useEffect(() => {
    let on = true;
    let timer = 0;
    let stream: MediaStream | null = null;
    let prev: Quad | null = null;
    let stableSince = 0;
    let armed = true;
    let lastShotQuad: Quad | null = null;

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
      } catch {
        if (on) setError("Caméra indisponible. Autorise l'accès à l'appareil photo, ou pars des photos de la galerie.");
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const engine = new ScanEngine();
      engineRef.current = engine;
      try {
        await engine.init();
      } catch {
        if (on) setError("Le moteur de détection n'a pas pu se charger.");
        return;
      }
      if (on) setStatus("Pose le recto à plat, bien éclairé, sans reflet.");
      loop();
    }

    function moved(a: Quad, b: Quad, vw: number): number {
      let e = 0;
      for (let i = 0; i < 4; i++) e += Math.hypot(a.corners[i][0] - b.corners[i][0], a.corners[i][1] - b.corners[i][1]);
      return e / 4 / vw;
    }

    async function shoot(video: HTMLVideoElement, q: Quad, face: Phase): Promise<string> {
      // image pleine résolution → calque 900×1257 en WebP
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")!.drawImage(video, 0, 0);
      const img = await loadImage(frame.toDataURL("image/jpeg", 0.95));
      const out = document.createElement("canvas");
      out.width = OUT_W;
      out.height = OUT_H;
      // cadre élargi autour de son centre : les vraies tranches restent dans le calque
      const cx = q.corners.reduce((a, p) => a + p[0], 0) / 4;
      const cy = q.corners.reduce((a, p) => a + p[1], 0) / 4;
      const norm = q.corners.map(([x, y]) => ({
        x: (cx + (x - cx) * (1 + QUAD_MARGIN)) / video.videoWidth,
        y: (cy + (y - cy) * (1 + QUAD_MARGIN)) / video.videoHeight,
      })) as [Pt, Pt, Pt, Pt];
      warpCardToCanvas(img, norm, out, { grid: 20 });
      let url = out.toDataURL("image/webp", 0.9);
      // recto d'une carte classique tenu à l'envers (illustration en bas) → on retourne ;
      // sur une full art on ne tranche pas, le bouton « Pivoter » reste là
      if (face === "recto") {
        const small = await canvasFromUrl(url, 300);
        if (analyzeRectified(small)?.guides && orientationOf(small) === "upside-down") url = await rotate180(url);
      }
      return url;
    }

    function loop() {
      timer = window.setTimeout(async () => {
        const video = videoRef.current;
        const engine = engineRef.current;
        if (!on || !video || !engine) return;
        if (!engine.busy && !capturing.current && phaseRef.current !== "done") {
          const res = await engine.detect(video, { prev: prev?.corners ?? null, k: 1 });
          const vw = video.videoWidth || 1;
          const q = res.quads[0] ?? null;
          const wide = q ? Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]) / vw : 0;
          if (q && wide >= MIN_WIDTH) {
            const now = performance.now();
            if (!prev || moved(prev, q, vw) > STABLE_MOVE) stableSince = now;
            prev = q;
            if (on) setQuad(q.corners.map(([x, y]) => ({ x: x / vw, y: y / (video.videoHeight || 1) })));
            // réarmement : la carte a franchement bougé depuis la dernière prise (elle a été retournée)
            if (!armed && lastShotQuad && moved(lastShotQuad, q, vw) > REARM_MOVE) armed = true;
            const held = now - stableSince;
            if (on) setHolding(armed ? Math.min(1, held / STABLE_MS) : 0);
            if (armed && held >= STABLE_MS) {
              capturing.current = true;
              try {
                const url = await shoot(video, q, phaseRef.current);
                if (phaseRef.current === "recto") {
                  shots.current.recto = url;
                  if (on) {
                    setRecto(url);
                    setPhase("verso");
                    setStatus("Recto pris. Retourne la carte pour le verso.");
                  }
                  phaseRef.current = "verso";
                } else {
                  shots.current.verso = url;
                  if (on) {
                    setVerso(url);
                    setPhase("done");
                    setStatus("Recto et verso pris.");
                  }
                  phaseRef.current = "done";
                }
                armed = false;
                lastShotQuad = q;
                stableSince = performance.now();
              } finally {
                capturing.current = false;
              }
            }
          } else {
            if (prev) armed = true;
            prev = null;
            stableSince = performance.now();
            if (on) {
              setQuad(null);
              setHolding(0);
            }
          }
        }
        if (on) loop();
      }, TICK_MS);
    }

    void start();
    return () => {
      on = false;
      window.clearTimeout(timer);
      engineRef.current?.terminate();
      engineRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function finish() {
    if (shots.current.recto) onDone(shots.current.recto, shots.current.verso);
  }

  async function rotate(face: "recto" | "verso") {
    const cur = shots.current[face];
    if (!cur) return;
    const next = await rotate180(cur);
    shots.current[face] = next;
    (face === "recto" ? setRecto : setVerso)(next);
  }

  function retake() {
    shots.current = { recto: null, verso: null };
    setRecto(null);
    setVerso(null);
    setPhase("recto");
    phaseRef.current = "recto";
    setStatus("Pose le recto à plat, bien éclairé, sans reflet.");
  }

  return (
    <Sheet
      open
      onClose={onClose}
      label="Scanner la carte"
      size="xl"
      flush
      z="z-[70]"
      header={
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Camera size={16} className="shrink-0 text-accent-strong" aria-hidden />
          <p className="display text-base font-semibold">Scanner la carte</p>
          <p className="ml-auto text-xs text-faint">{phase === "recto" ? "Recto" : phase === "verso" ? "Verso" : "Terminé"}</p>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="relative overflow-hidden rounded-2xl border border-edge bg-black">
          <video ref={videoRef} playsInline muted className="max-h-[52vh] w-full object-contain" />
          {quad && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="var(--accent)"
                fillOpacity={0.08 + holding * 0.12}
                stroke={holding >= 1 ? "var(--gain)" : "var(--accent)"}
                strokeWidth={0.7}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {/* Jauge d'immobilité : se remplit tant que la carte ne bouge pas */}
          {quad && phase !== "done" && (
            <div className="absolute inset-x-4 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${holding * 100}%` }} />
            </div>
          )}
        </div>
        <p className={`text-center text-sm ${error ? "text-loss" : "text-muted"}`}>{error ?? status}</p>

        {(recto || verso) && (
          <div className="flex justify-center gap-3">
            {recto && <Thumb url={recto} label="Recto" onRotate={() => void rotate("recto")} />}
            {verso && <Thumb url={verso} label="Verso" onRotate={() => void rotate("verso")} />}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-center gap-2">
          {recto && (
            <button type="button" onClick={retake} className="btn btn-ghost">
              <RotateCcw size={14} aria-hidden /> Reprendre
            </button>
          )}
          {phase === "verso" && (
            <button type="button" onClick={finish} className="btn btn-ghost">
              <SkipForward size={14} aria-hidden /> Sans verso
            </button>
          )}
          {(phase === "done" || phase === "verso") && recto && (
            <button type="button" onClick={finish} className="btn btn-primary">
              <Check size={14} aria-hidden /> Analyser
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Thumb({ url, label, onRotate }: { url: string; label: string; onRotate: () => void }) {
  return (
    <figure className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-28 w-auto rounded-lg border border-edge-strong shadow" />
      <figcaption className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted">
        {label}
        <button type="button" onClick={onRotate} className="rounded px-1 text-accent-strong underline-offset-2 hover:underline" title="Pivoter de 180°">
          Pivoter
        </button>
      </figcaption>
    </figure>
  );
}
