"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, RotateCw, SkipForward, X } from "lucide-react";
import { ScanEngine, type Quad } from "@/lib/scan/engine";
import type { Pt as EnginePt } from "@/lib/scan/detect.mjs";
import { loadImage, warpCardToCanvas, type Pt } from "@/lib/perspective";
import { analyzeRectified, canvasFromUrl, orientationOf, rotate180 } from "@/lib/grading-auto";

/* Réglages de la prise automatique */
const TICK_MS = 130;
/** immobilité requise avant la prise (ms) */
const STABLE_MS = 700;
/** déplacement toléré entre deux images, en fraction de la largeur vidéo */
const STABLE_MOVE = 0.012;
/** la carte doit occuper au moins cette part du petit côté de la vidéo */
const MIN_WIDTH = 0.28;
/** après une prise, il faut que la carte disparaisse ou bouge franchement avant la suivante */
const REARM_MOVE = 0.15;
const OUT_W = 900;
const OUT_H = Math.round((900 * 88) / 63);
/** le cadre détecté colle aux bords : on l'élargit pour garder les tranches et un peu de fond */
const QUAD_MARGIN = 0.035;
/** rapport long/court d'une carte (88/63) et tolérance pour retenir un candidat */
const CARD_RATIO = 88 / 63;

type Phase = "recto" | "verso" | "done";

const dist = (a: EnginePt, b: EnginePt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Le candidat le plus grand qui ressemble à une carte (proportions 63×88 à 15 % près) */
function pickCard(quads: Quad[]): Quad | null {
  let best: Quad | null = null;
  let bestArea = 0;
  for (const q of quads) {
    const c = q.corners;
    const top = dist(c[0], c[1]);
    const right = dist(c[1], c[2]);
    const ratio = Math.max(top, right) / Math.max(1, Math.min(top, right));
    if (Math.abs(ratio - CARD_RATIO) / CARD_RATIO > 0.15) continue;
    const area = top * right;
    if (area > bestArea) {
      bestArea = area;
      best = q;
    }
  }
  return best ?? quads[0] ?? null;
}

/**
 * Prise de vues plein écran pour la pré-gradation : la caméra détecte la carte
 * (même moteur que le scan), attend qu'elle soit immobile, la redresse en haute
 * résolution et enchaîne recto puis verso. Déclencheur manuel en secours.
 * Rend deux data URL WebP.
 */
export function GradeCapture({ onDone, onClose }: { onDone: (recto: string, verso: string | null) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ScanEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("recto");
  const [status, setStatus] = useState("Démarrage de la caméra…");
  const [recto, setRecto] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const shots = useRef<{ recto: string | null; verso: string | null }>({ recto: null, verso: null });
  const phaseRef = useRef<Phase>("recto");
  const capturing = useRef(false);
  const lastQuad = useRef<Quad | null>(null);
  const manual = useRef(false);

  /* Cadre dessiné sur la vidéo (repère object-cover, comme le scanner) */
  function draw(corners: EnginePt[] | null, holding: number) {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const elW = canvas.clientWidth;
    const elH = canvas.clientHeight;
    if (canvas.width !== elW || canvas.height !== elH) {
      canvas.width = elW;
      canvas.height = elH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, elW, elH);
    if (!corners || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cover = Math.max(elW / vw, elH / vh);
    const offX = (vw * cover - elW) / 2;
    const offY = (vh * cover - elH) / 2;
    const pts = corners.map(([x, y]) => [x * cover - offX, y * cover - offY] as EnginePt);
    const color = holding >= 1 ? "rgba(74,222,128,.95)" : "rgba(255,255,255,.9)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(240,72,62,${0.06 + holding * 0.1})`;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = holding >= 1 ? "rgba(74,222,128,.6)" : "rgba(255,255,255,.45)";
    ctx.stroke();
    // coins : un trait le long de chaque côté, sur 18 % de sa longueur
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 6;
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      for (const q of [pts[(i + 1) % 4], pts[(i + 3) % 4]]) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + (q[0] - p[0]) * 0.18, p[1] + (q[1] - p[1]) * 0.18);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    // jauge d'immobilité sous la carte
    if (holding > 0 && holding < 1) {
      const x0 = Math.min(pts[2][0], pts[3][0]);
      const x1 = Math.max(pts[2][0], pts[3][0]);
      const y = Math.max(pts[2][1], pts[3][1]) + 14;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(240,72,62,.95)";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + (x1 - x0) * holding, y);
      ctx.stroke();
    }
  }

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
      if (on) {
        setReady(true);
        setStatus("Pose le recto à plat, bien éclairé, sans reflet.");
      }
      loop();
    }

    function moved(a: Quad, b: Quad, vw: number): number {
      let e = 0;
      for (let i = 0; i < 4; i++) e += dist(a.corners[i], b.corners[i]);
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

    /** Sans détection : le centre de l'image au format carte (80 % de la hauteur) */
    function centerQuad(video: HTMLVideoElement): Quad {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      let h = vh * 0.8;
      let w = h / CARD_RATIO;
      if (w > vw * 0.9) {
        w = vw * 0.9;
        h = w * CARD_RATIO;
      }
      const x0 = (vw - w) / 2;
      const y0 = (vh - h) / 2;
      return { corners: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], score: 0 };
    }

    async function take(video: HTMLVideoElement, q: Quad) {
      capturing.current = true;
      try {
        const url = await shoot(video, q, phaseRef.current);
        if (phaseRef.current === "recto") {
          shots.current.recto = url;
          phaseRef.current = "verso";
          if (on) {
            setRecto(url);
            setPhase("verso");
            setStatus("Recto pris. Retourne la carte pour le verso.");
          }
        } else {
          shots.current.verso = url;
          phaseRef.current = "done";
          if (on) {
            setVerso(url);
            setPhase("done");
            setStatus("Recto et verso pris.");
          }
        }
        navigator.vibrate?.(30);
        armed = false;
        lastShotQuad = q;
        stableSince = performance.now();
      } finally {
        capturing.current = false;
      }
    }

    function loop() {
      timer = window.setTimeout(async () => {
        const video = videoRef.current;
        const engine = engineRef.current;
        if (!on || !video || !engine) return;
        if (manual.current && !capturing.current && phaseRef.current !== "done") {
          manual.current = false;
          await take(video, lastQuad.current ?? centerQuad(video));
        } else if (!engine.busy && !capturing.current && phaseRef.current !== "done") {
          const res = await engine.detect(video, { prev: prev?.corners ?? null, k: 3 });
          const vw = video.videoWidth || 1;
          const vh = video.videoHeight || 1;
          const q = pickCard(res.quads);
          const wide = q ? Math.min(dist(q.corners[0], q.corners[1]), dist(q.corners[1], q.corners[2])) / Math.min(vw, vh) : 0;
          if (q && wide >= MIN_WIDTH) {
            const now = performance.now();
            if (!prev || moved(prev, q, vw) > STABLE_MOVE) stableSince = now;
            prev = q;
            lastQuad.current = q;
            // réarmement : la carte a franchement bougé depuis la dernière prise (elle a été retournée)
            if (!armed && lastShotQuad && moved(lastShotQuad, q, vw) > REARM_MOVE) armed = true;
            const held = now - stableSince;
            const holding = armed ? Math.min(1, held / STABLE_MS) : 0;
            draw(q.corners, holding);
            if (on) setStatus(armed ? (held < STABLE_MS ? "Ne bouge plus…" : "Prise !") : "Retourne la carte, ou bouge-la pour reprendre.");
            if (armed && held >= STABLE_MS) await take(video, q);
          } else {
            if (prev) armed = true;
            prev = null;
            lastQuad.current = null;
            stableSince = performance.now();
            draw(null, 0);
            if (on) setStatus(phaseRef.current === "recto" ? "Cadre la carte entière, à plat." : "Retourne la carte, cadre le verso.");
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

  const faceLabel = phase === "recto" ? "Recto" : phase === "verso" ? "Verso" : "Terminé";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-label="Scanner la carte">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent" />

      {/* Barre haute */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
        >
          <X size={18} aria-hidden />
        </button>
        <p className="display text-base font-semibold drop-shadow">Pré-grader · {faceLabel}</p>
        <span className="w-10" />
      </header>

      {/* Bas : état, vignettes, actions */}
      <div className="relative z-10 mt-auto flex flex-col items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span className={`inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm backdrop-blur ${error ? "bg-loss/80" : "bg-black/55"}`}>
          {error ?? status}
        </span>

        {(recto || verso) && (
          <div className="flex items-end gap-3">
            {recto && <Thumb url={recto} label="Recto" onRotate={() => void rotate("recto")} />}
            {verso && <Thumb url={verso} label="Verso" onRotate={() => void rotate("verso")} />}
          </div>
        )}

        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex w-24 justify-start">
            {recto && (
              <button type="button" onClick={retake} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-xs backdrop-blur">
                <RotateCcw size={13} aria-hidden /> Reprendre
              </button>
            )}
          </span>
          {/* Déclencheur manuel : la prise auto ne part pas ? On prend ce que la caméra voit. */}
          {phase !== "done" ? (
            <button
              type="button"
              disabled={!ready || !!error}
              onClick={() => {
                manual.current = true;
              }}
              aria-label="Prendre la photo"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 backdrop-blur transition active:scale-95 disabled:opacity-40"
            >
              <Camera size={22} aria-hidden />
            </button>
          ) : (
            <span className="h-16" />
          )}
          <span className="flex w-24 justify-end">
            {phase === "verso" && recto && (
              <button type="button" onClick={finish} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-xs backdrop-blur">
                <SkipForward size={13} aria-hidden /> Sans verso
              </button>
            )}
            {phase === "done" && recto && (
              <button type="button" onClick={finish} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-lg">
                <Check size={15} aria-hidden /> Analyser
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Thumb({ url, label, onRotate }: { url: string; label: string; onRotate: () => void }) {
  return (
    <figure className="text-center">
      <span className="relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="h-24 w-auto rounded-lg border border-white/40 shadow-lg" />
        <button
          type="button"
          onClick={onRotate}
          aria-label={`Pivoter le ${label.toLowerCase()} de 180°`}
          title="Pivoter de 180°"
          className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur"
        >
          <RotateCw size={13} aria-hidden />
        </button>
      </span>
      <figcaption className="mt-1 text-[11px] text-white/80">{label}</figcaption>
    </figure>
  );
}
