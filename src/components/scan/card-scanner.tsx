"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { detectCardQuad, warpCard, CARD_W, CARD_H, type Pt } from "@/lib/scan/detect.mjs";
import type { ScanCandidate, ScanResult } from "@/lib/scan/index";
import { ITEM_LANGUAGE } from "@/lib/scan/url";

/** OpenCV.js (détection de la carte), chargé une fois depuis le CDN et mis en cache par le navigateur */
const OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
/** Cadence d'analyse ; largeur de travail pour la détection ; largeur de capture pour le redressement */
const TICK_MS = 400;
const DETECT_W = 360;
const CAPTURE_W = 720;
/** Sans détection pendant ce nombre d'analyses, on envoie le centre de l'image (carte plein écran) */
const FALLBACK_AFTER = 5;

type Phase = "scanning" | "locked" | "choose";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

let cvLoader: Promise<CV> | null = null;
function loadOpenCV(): Promise<CV> {
  if (cvLoader) return cvLoader;
  cvLoader = new Promise<CV>((resolve, reject) => {
    const w = window as unknown as { cv?: CV };
    const ready = () => {
      const cv = w.cv;
      if (!cv) return reject(new Error("opencv"));
      // Module Emscripten : un « thenable » qui se résout sur lui-même, à ne
      // jamais await-er (boucle infinie) — on attend l'init par rappel puis on
      // retire `then` pour que la promesse puisse le livrer.
      const done = () => {
        delete cv.then;
        resolve(cv);
      };
      if (cv.Mat) done();
      else if (typeof cv.then === "function") cv.then(done);
      else cv.onRuntimeInitialized = done;
    };
    if (w.cv) return void ready();
    const s = document.createElement("script");
    s.src = OPENCV_URL;
    s.async = true;
    s.onload = () => void ready();
    s.onerror = () => reject(new Error("opencv"));
    document.head.appendChild(s);
  });
  cvLoader.catch(() => (cvLoader = null));
  return cvLoader;
}

/** Petit badge de langue, seulement quand la carte n'est pas française */
function LangBadge({ lang }: { lang: ScanCandidate["lang"] }) {
  if (lang === "fr") return null;
  return (
    <span className="ml-1.5 rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-muted">
      {ITEM_LANGUAGE[lang]}
    </span>
  );
}

/**
 * Scanner de carte en continu, sans cadre imposé : la caméra filme, OpenCV
 * trouve les quatre coins de la carte dans l'image (tracé en direct), la
 * redresse en perspective et l'envoie à l'API de reconnaissance. Une carte
 * vue deux fois de suite est verrouillée et proposée à l'ajout ; s'il y a
 * plusieurs versions (réimpressions), on laisse choisir.
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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<CV>(null);
  const captureCanvas = useRef<HTMLCanvasElement | null>(null);
  const detectCanvas = useRef<HTMLCanvasElement | null>(null);
  const cardCanvas = useRef<HTMLCanvasElement | null>(null);
  const inflight = useRef(false);
  const missCount = useRef(0);
  const lastId = useRef<string | null>(null);
  const lastAmbig = useRef<string>("");
  const failures = useRef(0);
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [camera, setCamera] = useState<"starting" | "ready" | "error">("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [seen, setSeen] = useState(false);
  const [glimpse, setGlimpse] = useState<ScanCandidate | null>(null);
  const [locked, setLocked] = useState<ScanCandidate | null>(null);
  const [choices, setChoices] = useState<ScanCandidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [ticks, setTicks] = useState(0);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Moteur de détection
  useEffect(() => {
    let alive = true;
    loadOpenCV()
      .then((cv) => {
        if (!alive) return;
        cvRef.current = cv;
        setEngine("ready");
      })
      .catch(() => alive && setEngine("error"));
    return () => {
      alive = false;
    };
  }, []);

  // Caméra arrière
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
          setCamera("ready");
        }
      } catch {
        setCamera("error");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** Dessine (ou efface) le contour détecté par-dessus la vidéo */
  function drawOverlay(corners: Pt[] | null, scale: number, tone: "seek" | "lock") {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;
    const elW = video.clientWidth;
    const elH = video.clientHeight;
    if (canvas.width !== elW || canvas.height !== elH) {
      canvas.width = elW;
      canvas.height = elH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, elW, elH);
    if (!corners) return;
    // image capturée (pleine) → affichage object-cover
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cover = Math.max(elW / vw, elH / vh);
    const offX = (vw * cover - elW) / 2;
    const offY = (vh * cover - elH) / 2;
    ctx.beginPath();
    corners.forEach(([x, y], i) => {
      const px = (x / scale) * cover - offX;
      const py = (y / scale) * cover - offY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = tone === "lock" ? "rgba(74,222,128,.95)" : "rgba(240,72,62,.9)";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.stroke();
  }

  /** La carte trouvée dans l'image courante, redressée en JPEG — ou le centre de l'image en repli */
  function grabCard(): Promise<{ blob: Blob | null; found: boolean }> {
    const video = videoRef.current;
    const cv = cvRef.current;
    if (!video || !video.videoWidth) return Promise.resolve({ blob: null, found: false });
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // capture pleine résolution utile + copie réduite pour la détection
    const cap = (captureCanvas.current ??= document.createElement("canvas"));
    const capScale = CAPTURE_W / vw;
    cap.width = CAPTURE_W;
    cap.height = Math.round(vh * capScale);
    const cctx = cap.getContext("2d");
    if (!cctx) return Promise.resolve({ blob: null, found: false });
    cctx.drawImage(video, 0, 0, cap.width, cap.height);

    let found = false;
    const out = (cardCanvas.current ??= document.createElement("canvas"));
    out.width = CARD_W;
    out.height = CARD_H;

    if (cv) {
      const det = (detectCanvas.current ??= document.createElement("canvas"));
      const detScale = DETECT_W / vw;
      det.width = DETECT_W;
      det.height = Math.round(vh * detScale);
      det.getContext("2d")?.drawImage(cap, 0, 0, det.width, det.height);
      let src: CV = null;
      let cardMat: CV = null;
      let full: CV = null;
      try {
        src = cv.imread(det);
        const quad = detectCardQuad(cv, src);
        if (quad) {
          found = true;
          drawOverlay(quad.corners, detScale, "seek");
          // coins vers la capture haute résolution, puis redressement
          const k = capScale / detScale;
          const corners = quad.corners.map(([x, y]) => [x * k, y * k] as Pt);
          full = cv.imread(cap);
          cardMat = warpCard(cv, full, corners);
          cv.imshow(out, cardMat);
        } else {
          drawOverlay(null, 1, "seek");
        }
      } catch {
        found = false;
      } finally {
        src?.delete();
        cardMat?.delete();
        full?.delete();
      }
    }

    if (!found) {
      // repli : la carte remplit peut-être déjà l'écran (ancien cadrage)
      missCount.current += 1;
      if (missCount.current < FALLBACK_AFTER) return Promise.resolve({ blob: null, found: false });
      const octx = out.getContext("2d");
      if (!octx) return Promise.resolve({ blob: null, found: false });
      const gW = cap.width * 0.8;
      const gH = gW / (CARD_W / CARD_H);
      octx.drawImage(cap, (cap.width - gW) / 2, (cap.height - gH) / 2, gW, gH, 0, 0, CARD_W, CARD_H);
    } else {
      missCount.current = 0;
    }
    return new Promise((res) => out.toBlob((blob) => res({ blob, found }), "image/jpeg", 0.8));
  }

  // Boucle d'analyse
  useEffect(() => {
    if (camera !== "ready" || engine === "loading") return;
    const id = window.setInterval(async () => {
      if (phaseRef.current !== "scanning" || inflight.current) return;
      inflight.current = true;
      try {
        const { blob, found } = await grabCard();
        setSeen(found);
        if (!blob) return;
        const res = await fetch(`/api/scan/match${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok) {
          // Trois échecs de suite : on le dit, plutôt que d'analyser dans le vide
          failures.current += 1;
          if (failures.current >= 3) setApiDown(true);
          return;
        }
        failures.current = 0;
        setApiDown(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, engine, token]);

  function rescan() {
    lastId.current = null;
    lastAmbig.current = "";
    missCount.current = 0;
    failures.current = 0;
    setApiDown(false);
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

  if (camera === "error") {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <RefreshCw size={32} className="text-faint" aria-hidden />
        <p className="text-sm text-muted">Caméra inaccessible. Autorise l&apos;accès dans ton navigateur.</p>
      </div>
    );
  }

  const status =
    phase === "locked" ? (
      <>
        <Check size={13} className="text-gain" aria-hidden />
        Carte reconnue
      </>
    ) : phase === "choose" ? (
      <>
        <Sparkles size={13} aria-hidden />
        Plusieurs versions : choisis la tienne
      </>
    ) : camera !== "ready" ? (
      <>
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Démarrage de la caméra…
      </>
    ) : engine === "loading" ? (
      <>
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Chargement de la détection (une seule fois)…
      </>
    ) : apiDown ? (
      <>
        <RefreshCw size={13} className="text-loss" aria-hidden />
        Reconnaissance indisponible, réessaie dans un instant
      </>
    ) : glimpse ? (
      <>
        <Sparkles size={13} className="text-accent-strong" aria-hidden />
        Ça ressemble à <span className="font-semibold">{glimpse.name}</span>… ne bouge plus
      </>
    ) : seen ? (
      <>
        <ScanLine size={13} aria-hidden />
        Carte repérée, analyse…
      </>
    ) : (
      <>
        <ScanLine size={13} aria-hidden />
        Montre la carte en entier
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

        {/* Bandeau d'état */}
        <div className="absolute inset-x-0 top-0 flex justify-center pt-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
            {status}
          </span>
        </div>
        {engine === "error" && phase === "scanning" && (
          <p className="absolute inset-x-0 bottom-3 px-4 text-center text-xs text-white/80">
            Détection indisponible : cadre la carte pour qu&apos;elle remplisse l&apos;écran.
          </p>
        )}
        {engine === "ready" && ticks > 8 && phase === "scanning" && !glimpse && (
          <p className="absolute inset-x-0 bottom-3 px-4 text-center text-xs text-white/80">
            Rapproche-toi, évite les reflets, montre les quatre coins.
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
            <p className="display truncate text-lg font-semibold leading-tight">
              {locked.name}
              <LangBadge lang={locked.lang} />
            </p>
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
                    <span className="block truncate text-sm font-medium">
                      {c.name}
                      <LangBadge lang={c.lang} />
                    </span>
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
