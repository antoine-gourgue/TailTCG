"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, ScanLine, Sparkles, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { detectCardQuads, warpCard, CARD_W, CARD_H, type Pt, type QuadCandidate } from "@/lib/scan/detect.mjs";
import type { ScanCandidate, ScanResult } from "@/lib/scan/index";
import { ITEM_LANGUAGE } from "@/lib/scan/url";

/** OpenCV.js (détection de la carte), chargé une fois depuis le CDN et mis en cache par le navigateur */
const OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
/** Cadence d'analyse ; largeur de travail pour la détection ; largeur de capture pour le redressement */
const TICK_MS = 350;
const DETECT_W = 360;
const CAPTURE_W = 720;
/** Candidats de détection départagés par la reconnaissance quand le premier ne donne rien */
const MAX_QUADS = 3;
/** Sans carte détectée pendant ce nombre d'analyses, on envoie le centre de l'image (carte plein écran) */
const FALLBACK_AFTER = 5;
/** Durée d'affichage de la confirmation d'ajout */
const TOAST_MS = 1600;

type Phase = "scanning" | "found" | "choose";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

/** Résultat de l'action principale : enchaîner sur la carte suivante, quitter, ou erreur à afficher */
export type ConfirmResult = { status: "continue" | "leave" } | { status: "error"; error: string };

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

/** Deux quadrilatères désignent-ils le même objet (coins à moins d'un quart de la diagonale) ? */
function overlaps(a: Pt[], b: Pt[]): boolean {
  const diag = Math.hypot(a[2][0] - a[0][0], a[2][1] - a[0][1]);
  let e = 0;
  for (let i = 0; i < 4; i++) e += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return e / 4 < 0.25 * diag;
}

/** Petit badge de langue, seulement quand la carte n'est pas française */
function LangBadge({ lang }: { lang: ScanCandidate["lang"] }) {
  if (lang === "fr") return null;
  return (
    <span className="ml-2 rounded-md bg-raised px-1.5 py-0.5 align-middle text-[11px] font-semibold text-muted">
      {ITEM_LANGUAGE[lang]}
    </span>
  );
}

/**
 * Scanner de carte plein écran, en continu et sans cadre : la caméra filme,
 * OpenCV trouve la carte au premier plan (contour tracé en direct), la
 * redresse en perspective et l'envoie à la reconnaissance. Quand un cadre ou
 * un écran derrière la carte se fait passer pour elle, les candidats suivants
 * sont essayés : c'est la reconnaissance qui tranche. Une carte vue deux fois
 * de suite est verrouillée et proposée ; s'il existe plusieurs versions
 * (réimpressions), on laisse choisir. Après l'action principale, on enchaîne
 * sur la carte suivante.
 */
export function CardScanner({
  token,
  onConfirm,
  confirmLabel = "Ajouter à ma collection",
  detailsHref,
  onClose,
  title = "Scanner",
}: {
  /** Relais QR : jeton de la session (sinon l'utilisateur connecté fait foi) */
  token?: string;
  onConfirm: (card: ScanCandidate) => Promise<ConfirmResult>;
  confirmLabel?: string;
  /** Lien « Modifier les détails » vers la fiche d'ajout complète */
  detailsHref?: (card: ScanCandidate) => string;
  onClose?: () => void;
  title?: string;
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
  const failures = useRef(0);
  /** Quadrilatère de la dernière carte reconnue : on le suit tant qu'il donne quelque chose */
  const track = useRef<Pt[] | null>(null);
  /** Candidat à essayer quand rien ne matche (on tourne parmi les candidats) */
  const altIndex = useRef(0);
  const lastSent = useRef<Pt[] | null>(null);
  const lastId = useRef<string | null>(null);
  const lastAmbig = useRef<string>("");
  const glimpseRef = useRef(false);
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [camera, setCamera] = useState<"starting" | "ready" | "error">("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [seen, setSeen] = useState(false);
  const [glimpse, setGlimpse] = useState<ScanCandidate | null>(null);
  const [found, setFound] = useState<ScanCandidate | null>(null);
  const [choices, setChoices] = useState<ScanCandidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [ticks, setTicks] = useState(0);
  const [apiDown, setApiDown] = useState(false);
  const [added, setAdded] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    glimpseRef.current = glimpse !== null;
  }, [glimpse]);

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

  // Confirmation d'ajout éphémère
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** Dessine (ou efface) le contour de la carte par-dessus la vidéo : coins marqués, liseré fin */
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
    const pts = corners.map(([x, y]) => [(x / scale) * cover - offX, (y / scale) * cover - offY] as Pt);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // liseré
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = tone === "lock" ? "rgba(74,222,128,.55)" : "rgba(255,255,255,.45)";
    ctx.stroke();
    // coins : un trait le long de chaque côté, sur 18 % de sa longueur
    ctx.lineWidth = 4;
    ctx.strokeStyle = tone === "lock" ? "rgba(74,222,128,.95)" : "rgba(255,255,255,.9)";
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
  }

  /** La carte trouvée dans l'image courante, redressée en JPEG — ou le centre de l'image en repli */
  function grabCard(): Promise<{ blob: Blob | null; found: boolean }> {
    const video = videoRef.current;
    const cv = cvRef.current;
    if (!video || !video.videoWidth) return Promise.resolve({ blob: null, found: false });
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cap = (captureCanvas.current ??= document.createElement("canvas"));
    const capScale = CAPTURE_W / vw;
    cap.width = CAPTURE_W;
    cap.height = Math.round(vh * capScale);
    const cctx = cap.getContext("2d");
    if (!cctx) return Promise.resolve({ blob: null, found: false });
    cctx.drawImage(video, 0, 0, cap.width, cap.height);

    let hit = false;
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
        const quads: QuadCandidate[] = detectCardQuads(cv, src, MAX_QUADS);
        let chosen: QuadCandidate | undefined;
        if (quads.length) {
          // On suit la carte déjà reconnue ; sinon on tourne parmi les candidats
          const tracked = track.current;
          chosen = tracked ? quads.find((q) => overlaps(q.corners, tracked)) : undefined;
          if (!chosen) {
            track.current = null;
            chosen = quads[altIndex.current % quads.length];
          }
        }
        if (chosen) {
          hit = true;
          lastSent.current = chosen.corners;
          drawOverlay(chosen.corners, detScale, glimpseRef.current ? "lock" : "seek");
          const k = capScale / detScale;
          const corners = chosen.corners.map(([x, y]) => [x * k, y * k] as Pt);
          full = cv.imread(cap);
          cardMat = warpCard(cv, full, corners);
          cv.imshow(out, cardMat);
        } else {
          lastSent.current = null;
          drawOverlay(null, 1, "seek");
        }
      } catch {
        hit = false;
      } finally {
        src?.delete();
        cardMat?.delete();
        full?.delete();
      }
    }

    if (!hit) {
      // repli : la carte remplit peut-être déjà l'écran
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
    return new Promise((res) => out.toBlob((blob) => res({ blob, found: hit }), "image/jpeg", 0.8));
  }

  // Boucle d'analyse
  useEffect(() => {
    if (camera !== "ready" || engine === "loading") return;
    const id = window.setInterval(async () => {
      if (phaseRef.current !== "scanning" || inflight.current) return;
      inflight.current = true;
      try {
        const { blob, found: hit } = await grabCard();
        setSeen(hit);
        if (!blob) return;
        const sent = lastSent.current;
        const res = await fetch(`/api/scan/match${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok) {
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
          track.current = sent;
          altIndex.current = 0;
          if (lastId.current === top.id) {
            // Stable sur deux analyses : on verrouille
            navigator.vibrate?.(30);
            setFound(top);
            setPhase("found");
          }
          lastId.current = top.id;
          lastAmbig.current = "";
        } else if (data.status === "ambiguous") {
          const key = data.candidates.map((c) => c.id).join("|");
          setGlimpse(data.candidates[0]);
          track.current = sent;
          altIndex.current = 0;
          if (lastAmbig.current === key) {
            navigator.vibrate?.(20);
            setChoices(data.candidates);
            setPhase("choose");
          }
          lastAmbig.current = key;
          lastId.current = null;
        } else {
          // Rien : ce candidat n'est pas une carte connue, au suivant
          track.current = null;
          altIndex.current += 1;
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
    track.current = null;
    altIndex.current = 0;
    setApiDown(false);
    setFound(null);
    setChoices([]);
    setGlimpse(null);
    setConfirmError(null);
    setPhase("scanning");
  }

  async function confirm(card: ScanCandidate) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const r = await onConfirm(card);
      if (r.status === "error") {
        setConfirmError(r.error);
        return;
      }
      if (r.status === "continue") {
        setAdded((n) => n + 1);
        setToast(card.name);
        rescan();
      }
    } catch {
      setConfirmError("Impossible pour le moment, réessaie.");
    } finally {
      setConfirming(false);
    }
  }

  const status =
    camera === "error" ? (
      <>
        <RefreshCw size={14} aria-hidden />
        Caméra inaccessible : autorise-la dans ton navigateur
      </>
    ) : camera !== "ready" ? (
      <>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Démarrage de la caméra…
      </>
    ) : engine === "loading" ? (
      <>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Préparation de la détection…
      </>
    ) : apiDown ? (
      <>
        <RefreshCw size={14} className="text-loss" aria-hidden />
        Reconnaissance indisponible, réessaie dans un instant
      </>
    ) : glimpse ? (
      <>
        <Sparkles size={14} className="text-gain" aria-hidden />
        On dirait <span className="font-semibold">{glimpse.name}</span>… ne bouge plus
      </>
    ) : seen ? (
      <>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Analyse…
      </>
    ) : (
      <>
        <ScanLine size={14} aria-hidden />
        Montre une carte
      </>
    );

  const hint =
    engine === "error"
      ? "Détection indisponible : remplis l'écran avec la carte."
      : ticks > 8 && !glimpse
        ? "Rapproche-toi, évite les reflets, montre les quatre coins."
        : null;

  const sheetStyle = { animation: "sheet-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) both" };
  const sheetClass =
    "absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-foreground shadow-[0_-12px_40px_rgba(0,0,0,.45)]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Barre haute */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <span className="w-10">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </span>
        <p className="display text-base font-semibold drop-shadow">{title}</p>
        <span className="flex min-w-10 justify-end">
          {added > 0 && (
            <span className="num whitespace-nowrap rounded-full bg-gain px-2.5 py-1 text-xs font-bold text-black shadow">
              {added} ajoutée{added > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </header>

      {/* Confirmation d'ajout */}
      {toast && (
        <div className="rise-in pointer-events-none relative z-10 mt-4 flex justify-center px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-gain px-4 py-2 text-sm font-semibold text-black shadow-lg">
            <Check size={15} aria-hidden />
            {toast} ajoutée
          </span>
        </div>
      )}

      {/* État, en bas de la vidéo */}
      {phase === "scanning" && (
        <div className="relative z-10 mt-auto mb-[max(1.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-6 text-center">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm backdrop-blur [&>svg]:shrink-0">
            {status}
          </span>
          {hint && <p className="text-xs text-white/75">{hint}</p>}
        </div>
      )}

      {/* Carte reconnue */}
      {phase === "found" && found && (
        <section className={sheetClass} style={sheetStyle}>
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-edge-strong" />
          <div className="flex gap-4">
            <div className="card-tile w-24 shrink-0 aspect-[63/88]">
              <CardImage key={`${found.id}-${found.lang}`} base={found.image} alt={found.name} />
            </div>
            <div className="min-w-0 flex-1 py-1">
              <p className="label-xs flex items-center gap-1.5 text-gain">
                <Check size={13} aria-hidden />
                Carte reconnue
              </p>
              <p className="display mt-1 text-xl font-bold leading-tight">
                {found.name}
                <LangBadge lang={found.lang} />
              </p>
              <p className="mt-1 text-sm text-muted">
                {found.setName} <span className="num text-faint">· n° {found.localId}</span>
              </p>
            </div>
          </div>
          {confirmError && <p className="mt-3 text-sm text-loss">{confirmError}</p>}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => confirm(found)}
              disabled={confirming}
              className="btn btn-primary w-full justify-center !py-3 text-base"
            >
              {confirming ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
              {confirmLabel}
            </button>
            {detailsHref && (
              <Link href={detailsHref(found)} className="btn btn-ghost w-full justify-center">
                Modifier les détails
              </Link>
            )}
            <button
              type="button"
              onClick={rescan}
              disabled={confirming}
              className="mx-auto mt-1 py-1 text-sm text-muted underline-offset-4 hover:underline"
            >
              Ce n&apos;est pas cette carte
            </button>
          </div>
        </section>
      )}

      {/* Versions à départager */}
      {phase === "choose" && (
        <section className={sheetClass} style={sheetStyle}>
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-edge-strong" />
          <p className="label-xs flex items-center gap-1.5 text-accent-strong">
            <Sparkles size={13} aria-hidden />
            Plusieurs versions
          </p>
          <p className="display mt-1 text-lg font-bold leading-tight">Laquelle as-tu en main ?</p>
          <p className="mt-1 text-sm text-muted">Même visuel dans plusieurs sets ou langues.</p>
          {confirmError && <p className="mt-3 text-sm text-loss">{confirmError}</p>}
          <ul className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1">
            {choices.map((c) => (
              <li key={`${c.id}-${c.lang}`} className="w-28 shrink-0">
                <button
                  type="button"
                  onClick={() => confirm(c)}
                  disabled={confirming}
                  className="group flex w-full flex-col gap-2 text-left"
                >
                  <div className="card-tile aspect-[63/88] w-full transition group-hover:ring-2 group-hover:ring-accent/60">
                    <CardImage key={`${c.id}-${c.lang}`} base={c.image} alt={c.name} />
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {c.setName}
                      <LangBadge lang={c.lang} />
                    </span>
                    <span className="num block text-[11px] text-faint">n° {c.localId}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={rescan} disabled={confirming} className="btn btn-ghost mt-3 w-full justify-center">
            <RefreshCw size={14} aria-hidden />
            Rescanner
          </button>
        </section>
      )}
    </div>
  );
}
