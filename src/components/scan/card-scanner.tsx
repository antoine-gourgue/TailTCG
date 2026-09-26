"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { formatEur } from "@/lib/domain";
import type { Pt } from "@/lib/scan/detect.mjs";
import { CornerEngine, type CardCrop } from "@/lib/scan/corners-engine";
import {
  cardImageBase,
  loadStoredImages,
  SCAN_ASSET_URLS,
  ScanIdentifier,
  ScanPhash,
  type ScanCardLanguage,
  type ScanIdentifyResult,
  type ScanMatchDecision,
} from "@/lib/scan/scan-match";
import type { ScanCandidate } from "@/lib/scan/index";
import type { ScanCardInfo } from "@/app/api/scan/card/route";
import { ITEM_LANGUAGE, isScanLang } from "@/lib/scan/url";
import { play } from "@/lib/sfx";

/** Langue de session : locale du print reconnu */
const SESSION_LANGUAGE: ScanCardLanguage = "auto";
/** En cooldown : similarité à partir de laquelle « la carte ajoutée est encore là » */
const STILL_SAME_CARD_MIN_SIM = 0.5;
/**
 * AGRÉGATION TEMPORELLE (scanner GoupixDex) : une carte holo sombre en
 * mouvement donne un embedding qui saute d'une image à l'autre — la vraie
 * carte revient en tête par intermittence, les faux sont tous différents. On
 * crédite le meilleur pari de chaque image nette : la vraie carte accumule un
 * score cohérent, les faux ne s'additionnent pas. Commit quand un candidat
 * dépasse un score ET domine le suivant.
 */
const AGG_MIN_SIM = 0.6;
const AGG_SCORE_BASE = 0.52;
const AGG_DECAY = 0.82;
const AGG_COMMIT_SCORE = 0.42;
const AGG_DOMINATION = 1.6;
/** Commit IMMÉDIAT quand une seule image domine très nettement */
const FAST_COMMIT_MIN_SIM = 0.72;
const FAST_COMMIT_MIN_MARGIN = 0.06;
/** Anti-doublon : la même carte revue dans ce délai ne s'ajoute pas deux fois */
const INSTANT_COMMIT_DEBOUNCE_MS = 3000;
/** Après un ajout : images vides consécutives et délai minimal avant d'accepter la carte suivante */
const CLEAR_TICKS_TO_REARM = 10;
const MIN_REARM_MS = 900;
/** Durée maximale du cooldown (un cadre resté collé au décor ne bloquerait jamais) */
const COOLDOWN_MAX_MS = 2500;
/** Images vides avant que le cadre disparaisse (≈ 150 ms) */
const MISS_LINGER_TICKS = 4;
/** Cadre orange tant que la carte n'est pas reconnue, vert dès qu'elle l'est */
const SEEK = { stroke: "#f97316", fill: "rgba(249,115,22,.10)" };
const LOCK = { stroke: "#34d399", fill: "rgba(16,185,129,.14)" };
/** Cadre-guide (format carte) affiché quand aucune carte n'est accrochée : fraction de la hauteur d'écran */
const GUIDE_H_FRAC = 0.5;
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
/** Détection indisponible : la zone-guide part à la pHash à cette cadence */
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

/** Carte reconnue → candidat affichable tout de suite (le nom du set arrive ensuite) */
function candidateOf(d: ScanMatchDecision): ScanCandidate {
  return {
    id: d.tcgdexCardId,
    lang: isScanLang(d.language) ? d.language : "fr",
    name: d.name,
    setId: d.setId,
    setName: d.setId,
    localId: d.localId,
    image: cardImageBase(d),
    score: 0,
  };
}

/**
 * Scanner de carte plein écran, mains libres (mécanique du scanner GoupixDex) :
 * un réseau de coins (worker ONNX) cadre la carte à chaque image, le cadre
 * orange la suit. De chaque image nette partent DEUX identifications sur
 * l'appareil, en parallèle — pHash de l'illustration (instantanée, refuse au
 * lieu de deviner) et embedding neural (robuste aux holos, agrégé dans le
 * temps). Une carte sûre est AJOUTÉE aussitôt — bip, vibration, flash vert,
 * bandeau — puis le scanner attend qu'elle sorte du champ avant la suivante.
 * Aucune photo n'est envoyée au serveur.
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
  /** Identification sur l'appareil : embedding (worker ONNX) et pHash (worker) */
  const identifierRef = useRef<ScanIdentifier | null>(null);
  const phashRef = useRef<ScanPhash | null>(null);
  const identifyInflight = useRef(false);
  const phashInflight = useRef(false);
  /** Débogage (dev, ?scandebug) : similarités en direct pour régler les seuils */
  const scanDebug = useRef(false);
  const [debug, setDebug] = useState<{ name: string; sim: number; margin: number; lead: number; phash: number } | null>(null);
  /** Dernière détection : cadre à afficher et instant */
  const target = useRef<{ corners: Pt[]; at: number } | null>(null);
  /** Cadre lissé effectivement dessiné */
  const shown = useRef<Pt[] | null>(null);
  const lastFallbackAt = useRef(0);
  /** Machine d'état mains libres : armé = prêt à ajouter ; après un ajout, on attend que la carte parte */
  const armed = useRef(true);
  const clearTicks = useRef(0);
  const missTicks = useRef(0);
  const lastCommitAt = useRef(0);
  /** Dernier ajout — anti-doublon tant que la même carte reste devant la caméra */
  const lastCommit = useRef<{ cardId: string; at: number } | null>(null);
  /** Scores d'agrégation glissants par carte */
  const scores = useRef<Map<string, { decision: ScanMatchDecision; score: number }>>(new Map());
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [camera, setCamera] = useState<"starting" | "ready" | "error">("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [matchers, setMatchers] = useState<"loading" | "ready" | "error">("loading");
  const [seen, setSeen] = useState(false);
  /** Dernière carte reconnue (bandeau, cote) */
  const [found, setFound] = useState<ScanCandidate | null>(null);
  /** Cote Cardmarket de la dernière carte reconnue (`id` ≠ carte affichée = en cours de chargement) */
  const [priceOf, setPriceOf] = useState<{ id: string; value: number | null; url: string | null } | null>(null);
  const [choices, setChoices] = useState<ScanCandidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<ScanCandidate | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    scanDebug.current = new URLSearchParams(window.location.search).has("scandebug");
  }, []);

  // Détecteur de coins (worker ONNX)
  useEffect(() => {
    const eng = new CornerEngine();
    engineRef.current = eng;
    let alive = true;
    eng
      .init(SCAN_ASSET_URLS.corners)
      .then(() => alive && setEngine("ready"))
      .catch(() => alive && setEngine("error"));
    return () => {
      alive = false;
      eng.terminate();
      engineRef.current = null;
    };
  }, []);

  // Identification sur l'appareil : pHash (léger, prêt vite) et embedding
  // (modèles + index, en tâche de fond). Chacun sert dès qu'il est prêt.
  useEffect(() => {
    let alive = true;
    const ph = new ScanPhash();
    const id = new ScanIdentifier();
    phashRef.current = ph;
    identifierRef.current = id;
    void loadStoredImages();
    const okPh = ph.init().then(() => true).catch(() => false);
    const okId = id.init().then(() => true).catch(() => false);
    void Promise.all([okPh, okId]).then(([a, b]) => {
      if (alive) setMatchers(a || b ? "ready" : "error");
    });
    return () => {
      alive = false;
      ph.terminate();
      id.terminate();
      phashRef.current = null;
      identifierRef.current = null;
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

  // Rendu du cadre à chaque rafraîchissement d'écran
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
      if (ph === "choose") {
        if (shown.current) drawOverlay(shown.current, "lock");
        else drawGuide("lock");
        return;
      }
      const tone = ph === "cooldown" ? "lock" : "seek";
      if (!fresh || !t) {
        if (t && !fresh) target.current = null;
        shown.current = null;
        drawGuide(tone);
        return;
      }
      const age = now - t.at;
      shown.current = smoothCorners(shown.current, t.corners, longEdge);
      const alpha = age <= HOLD_MS ? 1 : 1 - (age - HOLD_MS) / 250;
      drawOverlay(shown.current, tone, alpha);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [camera]);

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

  /** Nom du set et visuel de référence de la carte reconnue (l'ajout n'attend que ça) */
  async function resolveCard(c: ScanCandidate): Promise<ScanCandidate> {
    try {
      const q = new URLSearchParams({ id: c.id, lang: c.lang });
      if (token) q.set("token", token);
      const r = await fetch(`/api/scan/card?${q}`);
      if (!r.ok) return c;
      const info: ScanCardInfo = await r.json();
      return { ...c, name: info.name || c.name, setId: info.setId || c.setId, setName: info.setName || c.setName, localId: info.localId || c.localId, image: info.image ?? c.image };
    } catch {
      return c;
    }
  }

  /** Ajout effectif (mains libres ou version choisie) : confirmation en arrière-plan */
  function addCard(card: ScanCandidate) {
    void resolveCard(card)
      .then(async (full) => {
        setBanner((b) => (b && b.id === full.id ? full : b));
        const r = await onConfirm(full);
        if (r.status === "error") {
          setErrorMsg(r.error);
          setBanner(null);
        } else if (r.status === "continue") {
          setAdded((n) => n + 1);
          setToast(full.name);
        }
      })
      .catch(() => setErrorMsg("Impossible pour le moment, réessaie."));
  }

  /**
   * Carte identifiée (pHash OU embedding) : bip + flash + vibration, ajout en
   * arrière-plan, anti-doublon glissant (revoir la carte repousse la fenêtre
   * de re-commit au lieu d'ajouter deux fois).
   */
  function commitDecision(d: ScanMatchDecision) {
    scores.current.clear();
    const now = nowMs();
    const last = lastCommit.current;
    if (last && last.cardId === d.tcgdexCardId && now - last.at < INSTANT_COMMIT_DEBOUNCE_MS) {
      last.at = now;
      enterCooldown();
      return;
    }
    lastCommit.current = { cardId: d.tcgdexCardId, at: now };
    enterCooldown();
    const card = candidateOf(d);
    celebrate(card);
    addCard(card);
  }

  /** Crops d'identification d'une image nette → embedding, décision rapide ou agrégée */
  async function onIdentifyCrops(bufs: ArrayBuffer[]) {
    const idf = identifierRef.current;
    if (identifyInflight.current || !idf?.ready) return;
    identifyInflight.current = true;
    let result: ScanIdentifyResult;
    try {
      result = await idf.identify(bufs, SESSION_LANGUAGE);
    } catch {
      identifyInflight.current = false;
      return;
    }
    identifyInflight.current = false;
    if (phaseRef.current === "choose") return;
    // Cooldown : revoir la carte ajoutée repousse simplement la fenêtre anti-doublon
    if (!armed.current) {
      const last = lastCommit.current;
      if (last && result.topCardId === last.cardId && result.topSim >= STILL_SAME_CARD_MIN_SIM) last.at = nowMs();
      return;
    }
    const fastCommit = result.decision !== null && result.topSim >= FAST_COMMIT_MIN_SIM && result.topMargin >= FAST_COMMIT_MIN_MARGIN;
    for (const [k, v] of scores.current) {
      v.score *= AGG_DECAY;
      if (v.score < 0.05) scores.current.delete(k);
    }
    if (result.topCandidate && result.topCandidateSim >= AGG_MIN_SIM) {
      const key = result.topCandidate.tcgdexCardId;
      const e = scores.current.get(key) ?? { decision: result.topCandidate, score: 0 };
      e.decision = result.topCandidate;
      e.score += result.topCandidateSim - AGG_SCORE_BASE;
      scores.current.set(key, e);
    }
    let leader: { decision: ScanMatchDecision; score: number } | null = null;
    let runnerUp = 0;
    for (const v of scores.current.values()) {
      if (!leader || v.score > leader.score) {
        runnerUp = leader ? leader.score : runnerUp;
        leader = v;
      } else if (v.score > runnerUp) runnerUp = v.score;
    }
    if (scanDebug.current) {
      setDebug((d) => ({
        name: result.topCandidate?.name ?? "—",
        sim: Number(result.topSim.toFixed(3)),
        margin: Number(result.topMargin.toFixed(3)),
        lead: Number((leader?.score ?? 0).toFixed(2)),
        phash: d?.phash ?? 1,
      }));
    }
    const aggregated = leader && leader.score >= AGG_COMMIT_SCORE && leader.score >= runnerUp * AGG_DOMINATION ? leader.decision : null;
    const decision = fastCommit ? result.decision : aggregated;
    if (decision) commitDecision(decision);
  }

  /** Carte redressée → pHash : un match sûr commit instantanément (court-circuite l'embedding) */
  async function onCardCrop(card: CardCrop) {
    const ph = phashRef.current;
    if (phashInflight.current || !ph?.ready || !armed.current || phaseRef.current !== "scanning") return;
    phashInflight.current = true;
    try {
      const r = await ph.match(card.buf, card.w, card.h, SESSION_LANGUAGE);
      if (scanDebug.current) setDebug((d) => ({ name: d?.name ?? r.topName ?? "—", sim: d?.sim ?? 0, margin: d?.margin ?? 0, lead: d?.lead ?? 0, phash: Number(r.score.toFixed(3)) }));
      if (r.status === "match" && r.decision && armed.current && phaseRef.current === "scanning") commitDecision(r.decision);
    } catch {
      /* tentative suivante */
    } finally {
      phashInflight.current = false;
    }
  }

  // Boucle de détection : une analyse par image de la caméra, dans le
  // worker ; le cadre suit la carte, les identifications partent des images
  // nettes. Après un ajout, on attend que la carte sorte du champ (images
  // vides consécutives) avant d'accepter la suivante.
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
          // Détection indisponible : la zone-guide part à la pHash, à cadence lente
          if (eng && armed.current && now - lastFallbackAt.current > FALLBACK_EVERY_MS) {
            lastFallbackAt.current = now;
            const crop = eng.guideCrop(video);
            if (crop) void onCardCrop(crop);
          }
          await nextFrame(video);
          continue;
        }
        let res: Awaited<ReturnType<CornerEngine["detect"]>>;
        try {
          res = await eng.detect(video, { crop: true });
        } catch {
          await nextFrame(video);
          continue;
        }
        if (!alive) break;
        const at = performance.now();
        if (process.env.NODE_ENV !== "production") {
          const w = window as unknown as { __scan?: { frames?: number; ms?: number; hits?: number; crops?: number; last?: unknown } };
          const st = (w.__scan ??= {});
          st.frames = (st.frames ?? 0) + 1;
          st.ms = (st.ms ?? 0) + res.ms;
          st.hits = (st.hits ?? 0) + (res.corners ? 1 : 0);
          st.crops = (st.crops ?? 0) + (res.idcrops ? 1 : 0);
          st.last = { presence: Number(res.presence.toFixed(2)), ms: Math.round(res.ms), idcrops: res.idcrops?.length ?? 0, card: !!res.card, guide: res.guide, at: Math.round(at) };
        }
        if (res.corners) {
          missTicks.current = 0;
          clearTicks.current = 0;
          target.current = { corners: res.corners, at };
          setSeen(true);
        } else {
          missTicks.current += 1;
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
        // Les deux identifications, en parallèle (l'embedding continue en cooldown pour l'anti-doublon)
        if (res.idcrops) void onIdentifyCrops(res.idcrops);
        if (res.card && armed.current) void onCardCrop(res.card);
        await nextFrame(video);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, engine]);

  function rescan() {
    target.current = null;
    shown.current = null;
    scores.current.clear();
    armed.current = true;
    clearTicks.current = 0;
    setChoices([]);
    setConfirmError(null);
    setPhase("scanning");
  }

  /** Version choisie à la main (réimpressions) */
  async function confirm(card: ScanCandidate) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const full = await resolveCard(card);
      const r = await onConfirm(full);
      if (r.status === "error") {
        setConfirmError(r.error);
        return;
      }
      lastCommit.current = { cardId: card.id, at: nowMs() };
      scores.current.clear();
      enterCooldown();
      celebrate(full);
      if (r.status === "continue") {
        setAdded((n) => n + 1);
        setToast(full.name);
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
    ) : matchers === "error" ? (
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
        {matchers === "loading" ? "Carte repérée · reconnaissance en préparation…" : "Carte repérée, ne bouge plus"}
      </>
    ) : (
      <>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/50" aria-hidden />
        Place une carte dans le cadre
      </>
    );

  const hint = engine === "error" ? "Détection indisponible : remplis le cadre avec la carte." : null;

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
              {added > 0 && <span className="num rounded-full bg-black/10 px-1.5 text-xs">{added}</span>}
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
            <CardImage key={`${banner.id}-${banner.lang}-${banner.image}`} base={banner.image} alt={banner.name} />
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
        <button type="button" onClick={rescan} disabled={confirming} aria-label="Fermer et rescanner" className="absolute inset-0 z-10 cursor-default bg-transparent" />
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
                <button type="button" onClick={() => confirm(c)} disabled={confirming} className="group flex w-full flex-col gap-2 text-left">
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

      {/* Débogage (dev, ?scandebug) : similarités des deux matchers en direct */}
      {debug && (
        <div className="pointer-events-none fixed left-2 top-2 z-[60] rounded bg-black/75 px-2 py-1.5 font-mono text-[11px] leading-tight text-green-400">
          <div className="font-bold">{debug.name}</div>
          <div>
            S0 {debug.sim} · marge {debug.margin} · agrég. {debug.lead}
          </div>
          <div className="text-green-300/70">pHash {debug.phash} (match ≤ 0,28)</div>
        </div>
      )}
    </div>
  );
}
