"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { formatEur } from "@/lib/domain";
import type { Pt } from "@/lib/scan/detect.mjs";
import { CornerEngine } from "@/lib/scan/corners-engine";
import { NeuralScanner } from "@/lib/scan/embed-engine";
import { NeuralIndex, type NeuralHit } from "@/lib/scan/embed-match";
import type { ScanCandidate, ScanResult } from "@/lib/scan/index";
import { ITEM_LANGUAGE } from "@/lib/scan/url";
import { play } from "@/lib/sfx";

/** Cadence maximale des cartes redressées envoyées à la reconnaissance */
const RECOG_EVERY_MS = 300;
/** Cadence maximale des appels au serveur (pHash), quand le neural local n'a pas tranché */
const SERVER_EVERY_MS = 500;
/** Reconnaissance neurale locale : commit IMMÉDIAT quand une seule image domine très nettement */
const NEURAL_MATCH = 0.78;
const NEURAL_MARGIN = 0.04;
/** Sous ce cosinus, ce n'est pas une carte (visage, fenêtre, décor) : on n'appelle pas le serveur */
const NEURAL_FLOOR = 0.6;
/**
 * AGRÉGATION TEMPORELLE (reprise du scanner GoupixDex) : une carte holo sombre
 * en mouvement donne un embedding qui saute d'une image à l'autre — la vraie
 * carte revient en tête par intermittence, les faux sont tous différents. On
 * crédite le meilleur pari de chaque image nette : la vraie carte accumule un
 * score cohérent, les faux ne s'additionnent pas. Commit quand un candidat
 * dépasse un score ET domine le suivant.
 */
const AGG_MIN_SIM = 0.66;
const AGG_SCORE_BASE = 0.58;
const AGG_DECAY = 0.82;
const AGG_COMMIT_SCORE = 0.3;
const AGG_DOMINATION = 1.6;
/** Anti-doublon : la même carte revue dans ce délai ne s'ajoute pas deux fois */
const COMMIT_DEBOUNCE_MS = 3000;
/** Après un ajout : images vides consécutives et délai minimal avant d'accepter la carte suivante */
const CLEAR_TICKS_TO_REARM = 10;
const MIN_REARM_MS = 900;
/** Durée maximale du cooldown (un cadre resté collé au décor ne bloquerait jamais) */
const COOLDOWN_MAX_MS = 2500;
/** Images vides avant que le cadre disparaisse (≈ 150 ms) */
const MISS_LINGER_TICKS = 4;
/** Le cadre détecté est masqué ce temps après un verdict « pas une carte » */
const FRAME_HOLD_MS = 900;
/** Cadre orange tant que la carte n'est pas reconnue, vert dès qu'elle l'est */
const SEEK = { stroke: "#f97316", fill: "rgba(249,115,22,.10)" };
const LOCK = { stroke: "#34d399", fill: "rgba(16,185,129,.14)" };
/** Cadre-guide (format carte) affiché quand aucune carte n'est accrochée : fraction de la hauteur d'écran */
const GUIDE_H_FRAC = 0.5;
/** Cadrages essayés par le neural (part rognée sur chaque bord) : un seul = plus réactif */
const NEURAL_INSETS = [0];
/** Modèle + index hébergés sur Supabase Storage (bucket public scan-assets) */
const SCAN_ASSETS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/scan-assets`;
const NEURAL_MODEL_URL = `${SCAN_ASSETS}/mobileclip-s0.onnx`;
const NEURAL_INDEX_BIN = `${SCAN_ASSETS}/embed.bin`;
const NEURAL_INDEX_JSON = `${SCAN_ASSETS}/embed.json`;
/** Le cadre reste affiché ce temps après la dernière détection (une image ratée ne le fait pas clignoter) */
const HOLD_MS = 450;
/**
 * Lissage ADAPTATIF du cadre (coins en pixels vidéo) : sous le deadband, la
 * carte est immobile et ce que renvoie le détecteur n'est que du bruit → on
 * FIGE le cadre ; au-delà, le poids du lerp monte avec le déplacement réel ;
 * au-delà d'un gros saut, on colle direct (nouvelle scène).
 */
const SMOOTH_DEADBAND_FRAC = 0.008;
const SMOOTH_LERP_MIN = 0.22;
const SMOOTH_LERP_MAX = 0.85;
const SCENE_CHANGE_FRAC = 0.22;
/** Détection indisponible : la zone-guide part à la reconnaissance à cette cadence */
const FALLBACK_EVERY_MS = 1200;
/** Durées d'affichage : confirmation, erreur, bandeau de la carte ajoutée, flash vert */
const TOAST_MS = 1600;
const ERROR_MS = 2600;
const BANNER_MS = 8000;
const FLASH_MS = 420;

/** Déplacement moyen des coins entre deux quadrilatères (px) */
function cornerDrift(a: Pt[], b: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return s / 4;
}

/** Coins lissés à afficher : figés si immobile, lerp proportionnel au mouvement, collés sur un gros saut */
function smoothCorners(prev: Pt[] | null, next: Pt[], longEdge: number): Pt[] {
  if (!prev) return next.map((p) => [p[0], p[1]] as Pt);
  const drift = cornerDrift(prev, next);
  if (drift > longEdge * SCENE_CHANGE_FRAC) return next.map((p) => [p[0], p[1]] as Pt);
  if (drift < longEdge * SMOOTH_DEADBAND_FRAC) return prev;
  const span = longEdge * (SCENE_CHANGE_FRAC - SMOOTH_DEADBAND_FRAC);
  const ramp = Math.min(1, (drift - longEdge * SMOOTH_DEADBAND_FRAC) / span);
  const w = SMOOTH_LERP_MIN + (SMOOTH_LERP_MAX - SMOOTH_LERP_MIN) * ramp;
  return [0, 1, 2, 3].map(
    (i) => [prev[i][0] + (next[i][0] - prev[i][0]) * w, prev[i][1] + (next[i][1] - prev[i][1]) * w] as Pt,
  );
}

/** scanning : on cherche ; cooldown : carte ajoutée, on attend qu'elle sorte du champ ; choose : versions à départager */
type Phase = "scanning" | "cooldown" | "choose";

/** Résultat de l'action principale : enchaîner sur la carte suivante, quitter, ou erreur à afficher */
export type ConfirmResult = { status: "continue" | "leave" } | { status: "error"; error: string };

/**
 * Prochaine image de la vidéo (ou prochain rafraîchissement d'écran), au
 * plus tard dans 120 ms : si la vidéo cale, la boucle continue quand même.
 */
function nextFrame(video: HTMLVideoElement | null): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 120);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const v = video as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }) | null;
    if (v && typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(done);
    else requestAnimationFrame(done);
  });
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Horloge isolée (lint react-compiler : pas de Date.now() dans un composant) */
const nowMs = () => Date.now();

/**
 * Scanner de carte plein écran, mains libres (façon GoupixDex) : la caméra
 * filme, un réseau de coins (worker ONNX) cadre la carte à chaque image, le
 * cadre orange la suit. Dès qu'une image est nette, la carte redressée part
 * à la reconnaissance (neural local, sinon pHash serveur) ; quand elle est
 * sûre, la carte est AJOUTÉE aussitôt — bip, vibration, flash vert, bandeau —
 * puis le scanner attend qu'elle sorte du champ avant d'accepter la suivante.
 * S'il existe plusieurs versions (réimpressions), on laisse choisir.
 */
export function CardScanner({
  token,
  onConfirm,
  detailsHref,
  onClose,
  title = "Scanner",
  noun = "ajoutée",
  onFinish,
}: {
  /** Relais QR : jeton de la session (sinon l'utilisateur connecté fait foi) */
  token?: string;
  onConfirm: (card: ScanCandidate) => Promise<ConfirmResult>;
  /** Lien « Modifier les détails » vers la fiche d'ajout complète */
  detailsHref?: (card: ScanCandidate) => string;
  onClose?: () => void;
  title?: string;
  /** Mot de la confirmation et du compteur : « ajoutée » ou « envoyée » */
  noun?: string;
  /** Bouton « Terminer » en haut à droite (fin d'une série envoyée à l'ordinateur) */
  onFinish?: () => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<CornerEngine | null>(null);
  /** Reconnaissance neurale locale (worker ONNX + index d'embeddings) */
  const neuralRef = useRef<NeuralScanner | null>(null);
  const neuralIndexRef = useRef<NeuralIndex | null>(null);
  const neuralReady = useRef(false);
  /** Dernier instant où le neural a vu une carte (cos ≥ NEURAL_FLOOR) et dernier verdict « pas une carte » */
  const cardSeenAt = useRef(0);
  const notCardAt = useRef(0);
  /** Débogage neural (dev, ?scandebug) : affiche le cosinus/marge en direct pour régler les seuils */
  const scanDebug = useRef(false);
  const [neuralDebug, setNeuralDebug] = useState<{ name: string; cos: number; margin: number; lead: number } | null>(null);
  /** Dernière détection : cadre à afficher et instant */
  const target = useRef<{ corners: Pt[]; at: number } | null>(null);
  /** Cadre lissé effectivement dessiné */
  const shown = useRef<Pt[] | null>(null);
  const lastHitAt = useRef(0);
  const recogInflight = useRef(false);
  const lastRecogAt = useRef(0);
  const lastServerAt = useRef(0);
  const lastFallbackAt = useRef(0);
  const failures = useRef(0);
  /** Machine d'état mains libres : armé = prêt à ajouter ; après un ajout, on attend que la carte parte */
  const armed = useRef(true);
  const clearTicks = useRef(0);
  const missTicks = useRef(0);
  const lastCommitAt = useRef(0);
  const lastCommit = useRef<{ id: string; lang: string; at: number } | null>(null);
  /** Scores d'agrégation glissants par carte */
  const scores = useRef<Map<string, { card: ScanCandidate; score: number }>>(new Map());
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [camera, setCamera] = useState<"starting" | "ready" | "error">("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [seen, setSeen] = useState(false);
  /** Dernière carte reconnue (bandeau, cote) */
  const [found, setFound] = useState<ScanCandidate | null>(null);
  /** Cote Cardmarket de la dernière carte reconnue (`id` ≠ carte affichée = en cours de chargement) */
  const [priceOf, setPriceOf] = useState<{ id: string; value: number | null; url: string | null } | null>(null);
  const [choices, setChoices] = useState<ScanCandidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [ticks, setTicks] = useState(0);
  const [apiDown, setApiDown] = useState(false);
  const [added, setAdded] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<ScanCandidate | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Débogage neural : ?scandebug affiche le cosinus/marge en direct (opt-in)
  useEffect(() => {
    scanDebug.current = new URLSearchParams(window.location.search).has("scandebug");
  }, []);

  // Détecteur de coins (worker ONNX)
  useEffect(() => {
    const eng = new CornerEngine();
    engineRef.current = eng;
    let alive = true;
    eng
      .init()
      .then(() => alive && setEngine("ready"))
      .catch(() => alive && setEngine("error"));
    return () => {
      alive = false;
      eng.terminate();
      engineRef.current = null;
    };
  }, []);

  // Reconnaissance neurale locale : index d'embeddings + modèle ONNX, chargés
  // en tâche de fond. Tant qu'ils ne sont pas prêts, la reconnaissance passe
  // par le serveur (pHash).
  useEffect(() => {
    if (!NeuralScanner.supported()) return;
    let alive = true;
    let ns: NeuralScanner | null = null;
    (async () => {
      try {
        const idx = new NeuralIndex();
        await idx.load(NEURAL_INDEX_BIN, NEURAL_INDEX_JSON);
        if (!alive) return;
        neuralIndexRef.current = idx;
        ns = new NeuralScanner();
        await ns.init(NEURAL_MODEL_URL, "/ort/");
        if (!alive) {
          ns.terminate();
          return;
        }
        neuralRef.current = ns;
        neuralReady.current = true;
      } catch {
        neuralReady.current = false;
      }
    })();
    return () => {
      alive = false;
      neuralReady.current = false;
      ns?.terminate();
      neuralRef.current = null;
      neuralIndexRef.current = null;
    };
  }, []);

  // Caméra arrière (en développement, ?fakecam=<vidéo> rejoue une vidéo à la place)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fake = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search).get("fakecam") : null;
        if (fake && videoRef.current) {
          const v = videoRef.current;
          v.muted = true;
          v.src = fake;
          v.loop = true;
          await v.play().catch(() => {});
          setCamera("ready");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.muted = true;
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

  // Cote Cardmarket de la carte reconnue
  useEffect(() => {
    if (!found) return;
    let alive = true;
    const q = new URLSearchParams({ id: found.id, lang: found.lang });
    if (token) q.set("token", token);
    fetch(`/api/scan/price?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { price: number | null; url: string | null } | null) => {
        if (alive) setPriceOf({ id: found.id, value: data?.price ?? null, url: data?.url ?? null });
      })
      .catch(() => alive && setPriceOf({ id: found.id, value: null, url: null }));
    return () => {
      alive = false;
    };
  }, [found, token]);

  // Messages éphémères : confirmation, erreur, bandeau, flash
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!errorMsg) return;
    const id = window.setTimeout(() => setErrorMsg(null), ERROR_MS);
    return () => window.clearTimeout(id);
  }, [errorMsg]);
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => window.clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(false), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  /** Dessine (ou efface) le contour de la carte par-dessus la vidéo : voile, liseré et coins de la couleur d'état */
  function drawOverlay(corners: Pt[] | null, tone: "seek" | "lock", alpha = 1) {
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
    if (!corners || !video.videoWidth) return;
    // repère vidéo → affichage object-cover
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cover = Math.max(elW / vw, elH / vh);
    const offX = (vw * cover - elW) / 2;
    const offY = (vh * cover - elH) / 2;
    const pts = corners.map(([x, y]) => [x * cover - offX, y * cover - offY] as Pt);
    const c = tone === "lock" ? LOCK : SEEK;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.stroke;
    ctx.globalAlpha = alpha * 0.8;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    // coins : un trait le long de chaque côté, sur 18 % de sa longueur
    ctx.lineWidth = 5;
    ctx.strokeStyle = c.stroke;
    ctx.shadowColor = "rgba(0,0,0,.5)";
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
    ctx.globalAlpha = 1;
  }

  /** Cadre-guide au format carte, pointillé, quand aucune carte n'est accrochée */
  function drawGuide(tone: "seek" | "lock") {
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
    const c = tone === "lock" ? LOCK : SEEK;
    const h = elH * GUIDE_H_FRAC;
    const w = Math.min(h * (63 / 88), elW * 0.86);
    const x = (elW - w) / 2;
    const y = elH * 0.46 - h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.05);
    ctx.fillStyle = tone === "lock" ? c.fill : "rgba(249,115,22,.05)";
    ctx.fill();
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = c.stroke;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Rendu du cadre à chaque rafraîchissement d'écran : il glisse vers la
  // dernière détection (lissage) et s'efface en fondu quand la carte a disparu.
  useEffect(() => {
    if (camera !== "ready") return;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const longEdge = video ? Math.max(video.videoWidth, video.videoHeight) || 1080 : 1080;
      const t = target.current;
      const fresh = !!t && now - t.at <= HOLD_MS + 250;
      const ph = phaseRef.current;
      // Versions à départager : la détection est en pause, le dernier cadre reste figé en vert
      if (ph === "choose") {
        if (shown.current) drawOverlay(shown.current, "lock");
        else drawGuide("lock");
        return;
      }
      // Carte ajoutée : cadre vert, qui suit encore la carte tant qu'elle est là
      if (ph === "cooldown") {
        if (fresh && t) {
          shown.current = smoothCorners(shown.current, t.corners, longEdge);
          drawOverlay(shown.current, "lock");
        } else {
          shown.current = null;
          drawGuide("lock");
        }
        return;
      }
      // Le cadre s'affiche dès la détection (orange) ; il ne se masque que si
      // la reconnaissance vient de dire « ce n'est pas une carte »
      const notCard = neuralReady.current && notCardAt.current > cardSeenAt.current && now - notCardAt.current < FRAME_HOLD_MS;
      if (!fresh || !t || notCard) {
        if (t && !fresh) target.current = null;
        shown.current = null;
        drawGuide("seek");
        return;
      }
      const age = now - t.at;
      shown.current = smoothCorners(shown.current, t.corners, longEdge);
      const alpha = age <= HOLD_MS ? 1 : 1 - (age - HOLD_MS) / 250;
      drawOverlay(shown.current, "seek", alpha);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [camera]);

  /** Un résultat de l'index neural → candidat affichable (score : 0 = identique) */
  function neuralToCandidate(h: NeuralHit): ScanCandidate {
    return {
      id: h.id,
      lang: h.lang as ScanCandidate["lang"],
      name: h.name,
      setId: h.setId,
      setName: h.setName,
      localId: h.localId,
      image: h.image,
      score: 1 - h.cos,
    };
  }

  /** Prêt à ajouter la carte suivante */
  function rearm() {
    armed.current = true;
    clearTicks.current = 0;
    scores.current.clear();
    if (phaseRef.current === "cooldown") setPhase("scanning");
  }

  /** Carte ajoutée : on attend qu'elle quitte le champ avant la suivante */
  function enterCooldown() {
    armed.current = false;
    clearTicks.current = 0;
    lastCommitAt.current = performance.now();
    setChoices([]);
    setPhase("cooldown");
  }

  /** Retour signalé à l'écran : bip, vibration, flash vert, bandeau */
  function celebrate(card: ScanCandidate) {
    play("pop");
    navigator.vibrate?.(60);
    setFlash(true);
    setFound(card);
    setBanner(card);
    setConfirmError(null);
  }

  /**
   * Carte sûre : ajoutée aussitôt (mains libres), sans confirmation. La même
   * carte revue dans les 3 s ne s'ajoute pas deux fois.
   */
  function commit(card: ScanCandidate) {
    const now = nowMs();
    const last = lastCommit.current;
    if (last && last.id === card.id && last.lang === card.lang && now - last.at < COMMIT_DEBOUNCE_MS) {
      last.at = now;
      enterCooldown();
      return;
    }
    lastCommit.current = { id: card.id, lang: card.lang, at: now };
    scores.current.clear();
    enterCooldown();
    celebrate(card);
    void onConfirm(card)
      .then((r) => {
        if (r.status === "error") {
          setErrorMsg(r.error);
          setBanner(null);
        } else if (r.status === "continue") {
          setAdded((n) => n + 1);
          setToast(card.name);
        }
      })
      .catch(() => setErrorMsg("Impossible pour le moment, réessaie."));
  }

  /**
   * Reconnaissance neurale locale de la carte redressée. Renvoie :
   * - "commit"   : carte sûre (image dominante, ou agrégation) → ajoutée ;
   * - "skip"     : pas armé, ou pas une carte (cosinus sous NEURAL_FLOOR) → pas de pHash ;
   * - "fallback" : neural pas prêt, ou carte incertaine → laisser le pHash serveur.
   */
  async function recognizeNeural(blob: Blob): Promise<"commit" | "skip" | "fallback"> {
    const ns = neuralRef.current;
    const idx = neuralIndexRef.current;
    if (!neuralReady.current || !ns || !idx) return "fallback";
    const vecs = await ns.embedBlobVariants(blob, NEURAL_INSETS);
    if (!vecs.length) return "fallback";
    if (!armed.current || phaseRef.current !== "scanning") return "skip";
    let top: NeuralHit | null = null;
    let margin = 0;
    for (const v of vecs) {
      const hits = idx.search(v, 2);
      if (hits[0] && (!top || hits[0].cos > top.cos)) {
        top = hits[0];
        margin = hits[0].cos - (hits[1]?.cos ?? 0);
      }
    }
    if (!top) return "fallback";
    if (top.cos >= NEURAL_FLOOR) cardSeenAt.current = performance.now();
    else notCardAt.current = performance.now();
    // Chemin rapide : une image très sûre et dominante commit sans attendre
    if (top.cos >= NEURAL_MATCH && margin >= NEURAL_MARGIN) {
      commit(neuralToCandidate(top));
      return "commit";
    }
    // Agrégation : décroître tous les scores, puis créditer le meilleur pari
    for (const [k, v] of scores.current) {
      v.score *= AGG_DECAY;
      if (v.score < 0.05) scores.current.delete(k);
    }
    if (top.cos >= AGG_MIN_SIM) {
      const key = `${top.lang}/${top.id}`;
      const e = scores.current.get(key) ?? { card: neuralToCandidate(top), score: 0 };
      e.card = neuralToCandidate(top);
      e.score += top.cos - AGG_SCORE_BASE;
      scores.current.set(key, e);
    }
    let leader: { card: ScanCandidate; score: number } | null = null;
    let runnerUp = 0;
    for (const v of scores.current.values()) {
      if (!leader || v.score > leader.score) {
        runnerUp = leader ? leader.score : runnerUp;
        leader = v;
      } else if (v.score > runnerUp) runnerUp = v.score;
    }
    if (scanDebug.current)
      setNeuralDebug({ name: top.name, cos: Number(top.cos.toFixed(3)), margin: Number(margin.toFixed(3)), lead: Number((leader?.score ?? 0).toFixed(2)) });
    if (leader && leader.score >= AGG_COMMIT_SCORE && leader.score >= runnerUp * AGG_DOMINATION) {
      commit(leader.card);
      return "commit";
    }
    return top.cos < NEURAL_FLOOR ? "skip" : "fallback";
  }

  /** Envoie une carte redressée à la reconnaissance : neural local d'abord, serveur (pHash) s'il n'a pas tranché */
  async function recognize(blob: Blob) {
    recogInflight.current = true;
    lastRecogAt.current = performance.now();
    let verdict: "commit" | "skip" | "fallback" = "fallback";
    try {
      verdict = await recognizeNeural(blob);
    } catch {
      verdict = "fallback";
    }
    const now = performance.now();
    if (verdict !== "fallback" || !armed.current || now - lastServerAt.current < SERVER_EVERY_MS) {
      recogInflight.current = false;
      return;
    }
    lastServerAt.current = now;
    try {
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
      if (!armed.current || phaseRef.current !== "scanning") return;
      if (data.status === "match") {
        commit(data.candidates[0]);
      } else if (data.status === "ambiguous") {
        navigator.vibrate?.(20);
        setChoices(data.candidates);
        setPhase("choose");
      }
    } catch {
      // réseau : on réessaie à la prochaine image nette
    } finally {
      recogInflight.current = false;
    }
  }

  // Boucle de détection : une analyse par image de la caméra, dans le
  // worker ; le cadre suit la carte, la reconnaissance part en parallèle dès
  // qu'une image est nette. Après un ajout, on attend que la carte sorte du
  // champ (images vides consécutives) avant d'accepter la suivante.
  useEffect(() => {
    if (camera !== "ready" || engine === "loading") return;
    let alive = true;
    (async () => {
      while (alive) {
        const video = videoRef.current;
        const eng = engineRef.current;
        if (!video || phaseRef.current === "choose") {
          await nextFrame(video);
          continue;
        }
        const now = performance.now();
        if (engine === "error" || !eng) {
          // Détection indisponible : la zone-guide, à cadence lente
          if (eng && armed.current && !recogInflight.current && now - lastFallbackAt.current > FALLBACK_EVERY_MS) {
            lastFallbackAt.current = now;
            const blob = await eng.guideCrop(video);
            if (blob) void recognize(blob);
          }
          await nextFrame(video);
          continue;
        }
        const wantCrop =
          armed.current && phaseRef.current === "scanning" && !recogInflight.current && now - lastRecogAt.current > RECOG_EVERY_MS;
        let res: Awaited<ReturnType<CornerEngine["detect"]>>;
        try {
          res = await eng.detect(video, { crop: wantCrop });
        } catch {
          await nextFrame(video);
          continue;
        }
        if (!alive) break;
        const at = performance.now();
        if (process.env.NODE_ENV !== "production") {
          // Compteurs de mise au point (window.__scan)
          const w = window as unknown as { __scan?: { frames?: number; ms?: number; hits?: number; last?: unknown } };
          const st = (w.__scan ??= {});
          st.frames = (st.frames ?? 0) + 1;
          st.ms = (st.ms ?? 0) + res.ms;
          st.hits = (st.hits ?? 0) + (res.corners ? 1 : 0);
          st.last = { presence: Number(res.presence.toFixed(2)), ms: Math.round(res.ms), crop: !!res.card, guide: res.guide, at: Math.round(at) };
        }
        if (res.corners) {
          missTicks.current = 0;
          clearTicks.current = 0;
          target.current = { corners: res.corners, at };
          lastHitAt.current = at;
          setSeen(true);
        } else {
          missTicks.current += 1;
          // Réarmement : absence soutenue de carte après un délai minimal
          if (!armed.current && at - lastCommitAt.current >= MIN_REARM_MS) {
            clearTicks.current += 1;
            if (clearTicks.current >= CLEAR_TICKS_TO_REARM) rearm();
          }
          if (missTicks.current >= MISS_LINGER_TICKS && target.current) {
            target.current = null;
            setSeen(false);
          }
        }
        // Réarmement garanti : un cadre resté collé au décor ne bloque jamais
        if (!armed.current && at - lastCommitAt.current >= COOLDOWN_MAX_MS) rearm();
        if (res.card && armed.current && !recogInflight.current) void recognize(res.card);
        await nextFrame(video);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, engine, token]);

  function rescan() {
    failures.current = 0;
    target.current = null;
    shown.current = null;
    scores.current.clear();
    armed.current = true;
    clearTicks.current = 0;
    lastHitAt.current = performance.now();
    setApiDown(false);
    setChoices([]);
    setConfirmError(null);
    setPhase("scanning");
  }

  /** Version choisie à la main (réimpressions) */
  async function confirm(card: ScanCandidate) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const r = await onConfirm(card);
      if (r.status === "error") {
        setConfirmError(r.error);
        return;
      }
      lastCommit.current = { id: card.id, lang: card.lang, at: nowMs() };
      scores.current.clear();
      enterCooldown();
      celebrate(card);
      if (r.status === "continue") {
        setAdded((n) => n + 1);
        setToast(card.name);
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
    ) : phase === "cooldown" ? (
      <>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
        {capitalize(noun)} · retire la carte pour la suivante
      </>
    ) : seen ? (
      <>
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-orange-400" aria-hidden />
        Carte repérée, ne bouge plus
      </>
    ) : (
      <>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/50" aria-hidden />
        Place une carte dans le cadre
      </>
    );

  const hint =
    engine === "error"
      ? "Détection indisponible : remplis le cadre avec la carte."
      : ticks > 8 && phase === "scanning"
        ? "Rapproche-toi, évite les reflets, montre les quatre coins."
        : null;

  /** Cote de la carte du bandeau (null tant qu'elle charge) */
  const price = banner && priceOf?.id === banner.id ? priceOf : null;

  const sheetStyle = { animation: "sheet-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) both" };
  const sheetClass =
    "absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-foreground shadow-[0_-12px_40px_rgba(0,0,0,.45)]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      {flash && <div className="fade-out pointer-events-none absolute inset-0 z-10 bg-emerald-500/30" aria-hidden />}
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
          {onFinish ? (
            <button
              type="button"
              onClick={() => void onFinish()}
              className="btn !px-3.5 !py-2 bg-white text-sm font-semibold text-black shadow"
            >
              Terminer
              {added > 0 && (
                <span className="num rounded-full bg-black/10 px-1.5 text-xs">{added}</span>
              )}
            </button>
          ) : (
            added > 0 && (
              <span className="num whitespace-nowrap rounded-full bg-gain px-2.5 py-1 text-xs font-bold text-black shadow">
                {added} {noun}
                {added > 1 ? "s" : ""}
              </span>
            )
          )}
        </span>
      </header>

      {/* Confirmation d'ajout / erreur */}
      {toast && (
        <div className="rise-in pointer-events-none relative z-10 mt-4 flex justify-center px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-gain px-4 py-2 text-sm font-semibold text-black shadow-lg">
            <Check size={15} aria-hidden />
            {toast} {noun}
          </span>
        </div>
      )}
      {errorMsg && (
        <div className="rise-in pointer-events-none relative z-10 mt-4 flex justify-center px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-loss px-4 py-2 text-sm font-semibold text-white shadow-lg">
            <X size={15} aria-hidden />
            {errorMsg}
          </span>
        </div>
      )}

      {/* Bandeau de la carte ajoutée : visuel, nom, cote, fiche complète */}
      {banner && phase !== "choose" && (
        <div className="rise-in absolute inset-x-3 bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] z-20 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/70 p-3 shadow-2xl backdrop-blur-md">
          <div className="card-tile w-14 shrink-0 aspect-[63/88]">
            <CardImage key={`${banner.id}-${banner.lang}`} base={banner.image} alt={banner.name} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label-xs flex items-center gap-1.5 text-emerald-300">
              <Check size={12} aria-hidden />
              {capitalize(noun)}
            </p>
            <p className="display mt-0.5 truncate text-base font-bold leading-tight">
              {banner.name}
              <LangBadge lang={banner.lang} />
            </p>
            <p className="truncate text-xs text-white/70">
              {banner.setName} <span className="num">· n° {banner.localId}</span>
              {price?.value != null && <span className="num ml-2 font-semibold text-emerald-300">{formatEur(price.value)}</span>}
            </p>
            {detailsHref && (
              <Link href={detailsHref(banner)} className="mt-1 inline-flex items-center gap-1 text-xs text-white/85 underline-offset-4 hover:underline">
                Modifier les détails <ExternalLink size={11} aria-hidden />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Masquer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      )}

      {/* État, en bas de la vidéo */}
      {phase !== "choose" && (
        <div className="relative z-10 mt-auto mb-[max(1.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-6 text-center">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm backdrop-blur [&>svg]:shrink-0">
            {status}
          </span>
          {hint && <p className="text-xs text-white/75">{hint}</p>}
        </div>
      )}

      {/* Un tap hors de la feuille la referme et relance le scan */}
      {phase === "choose" && (
        <button
          type="button"
          onClick={rescan}
          disabled={confirming}
          aria-label="Fermer et rescanner"
          className="absolute inset-0 z-10 cursor-default bg-transparent"
        />
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

      {/* Débogage neural (dev, ?scandebug) : régler NEURAL_MATCH / NEURAL_MARGIN / agrégation */}
      {neuralDebug && (
        <div className="pointer-events-none fixed left-2 top-2 z-[60] rounded bg-black/75 px-2 py-1.5 font-mono text-[11px] leading-tight text-green-400">
          <div className="font-bold">{neuralDebug.name}</div>
          <div>
            cos {neuralDebug.cos} · marge {neuralDebug.margin} · agrég. {neuralDebug.lead}
          </div>
          <div className="text-green-300/70">
            seuils {NEURAL_MATCH}/{NEURAL_MARGIN} · commit agrég. {AGG_COMMIT_SCORE}
          </div>
        </div>
      )}
    </div>
  );
}
