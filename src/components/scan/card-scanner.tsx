"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, ScanLine, Sparkles, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { formatEur } from "@/lib/domain";
import type { Pt } from "@/lib/scan/detect.mjs";
import { ScanEngine, type Quad } from "@/lib/scan/engine";
import { NeuralScanner } from "@/lib/scan/embed-engine";
import { NeuralIndex, type NeuralHit } from "@/lib/scan/embed-match";
import type { ScanCandidate, ScanResult } from "@/lib/scan/index";
import { ITEM_LANGUAGE } from "@/lib/scan/url";

/** Candidats de détection départagés par la reconnaissance quand le premier ne donne rien */
const MAX_QUADS = 3;
/** Détections consécutives de la même carte avant de l'envoyer à la reconnaissance (1 = dès qu'on la voit : le matcher refuse les images incertaines) */
const STABLE_HITS = 2;
/** Délai minimal entre deux reconnaissances (retente vite quand la 1re n'aboutit pas) */
const RECOG_EVERY_MS = 140;
/** Reconnaissance neurale locale : verrou immédiat, sans serveur, quand c'est très sûr et stable */
const NEURAL_MATCH = 0.78;
const NEURAL_MARGIN = 0.04;
const NEURAL_STABLE = 2;
/** Cadrages essayés (part rognée sur chaque bord) : robustesse au bord de carte */
const NEURAL_INSETS = [0, 0.05];
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
 * FIGE le cadre (fini le rectangle qui tremble/change de taille sans raison) ;
 * au-delà, le poids du lerp monte avec le déplacement réel (suit la main sans
 * traîner ni jitter) ; au-delà d'un gros saut, on colle direct (nouvelle scène).
 */
const SMOOTH_DEADBAND_FRAC = 0.008;
const SMOOTH_LERP_MIN = 0.22;
const SMOOTH_LERP_MAX = 0.85;
const SCENE_CHANGE_FRAC = 0.22;

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
/** Sans carte détectée depuis ce temps, on envoie le centre de l'image (carte plein écran), à cette cadence */
const FALLBACK_AFTER_MS = 2500;
const FALLBACK_EVERY_MS = 1200;
/** Durée d'affichage de la confirmation d'ajout */
const TOAST_MS = 1600;

type Phase = "scanning" | "found" | "choose";
type Track = { corners: Pt[]; hits: number };

/** Résultat de l'action principale : enchaîner sur la carte suivante, quitter, ou erreur à afficher */
export type ConfirmResult = { status: "continue" | "leave" } | { status: "error"; error: string };

/** Deux quadrilatères désignent-ils le même objet (coins à moins d'un quart de la diagonale) ? */
function overlaps(a: Pt[], b: Pt[]): boolean {
  const diag = Math.hypot(a[2][0] - a[0][0], a[2][1] - a[0][1]);
  let e = 0;
  for (let i = 0; i < 4; i++) e += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return e / 4 < 0.25 * diag;
}

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

/**
 * Scanner de carte plein écran, en continu et sans cadre à viser : la caméra
 * filme, un worker OpenCV cherche la carte au premier plan à chaque image
 * (d'abord autour de sa dernière position, pour la suivre), et le cadre
 * dessiné par-dessus la vidéo la suit en douceur. Dès que la carte est
 * stable, elle est redressée en perspective et envoyée à la reconnaissance,
 * en parallèle de la détection qui continue. Quand un cadre ou un écran
 * derrière la carte se fait passer pour elle, les candidats suivants sont
 * essayés : c'est la reconnaissance qui tranche. Dès qu'elle est sûre, la
 * carte est proposée ; s'il existe plusieurs versions (réimpressions), on
 * laisse choisir. Après l'action principale, on enchaîne sur la carte
 * suivante.
 */
export function CardScanner({
  token,
  onConfirm,
  confirmLabel = "Ajouter à ma collection",
  detailsHref,
  onClose,
  title = "Scanner",
  noun = "ajoutée",
  onFinish,
}: {
  /** Relais QR : jeton de la session (sinon l'utilisateur connecté fait foi) */
  token?: string;
  onConfirm: (card: ScanCandidate) => Promise<ConfirmResult>;
  confirmLabel?: string;
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
  const engineRef = useRef<ScanEngine | null>(null);
  /** Reconnaissance neurale locale (worker ONNX + index d'embeddings) */
  const neuralRef = useRef<NeuralScanner | null>(null);
  const neuralIndexRef = useRef<NeuralIndex | null>(null);
  const neuralReady = useRef(false);
  /** Verrou neural : mêmes id consécutifs avant de valider */
  const neuralStreak = useRef(0);
  const neuralLastId = useRef<string | null>(null);
  /** Débogage neural (dev, ?scandebug) : affiche le cosinus/marge en direct pour régler les seuils */
  const scanDebug = useRef(false);
  const [neuralDebug, setNeuralDebug] = useState<{ name: string; cos: number; margin: number; streak: number } | null>(null);
  /** Carte suivie (coins dans le repère vidéo) et nombre de détections consécutives */
  const track = useRef<Track | null>(null);
  /** Candidat à essayer quand la reconnaissance ne donne rien (on tourne parmi les candidats) */
  const altIndex = useRef(0);
  /** Dernière détection : cadre à afficher et instant */
  const target = useRef<{ corners: Pt[]; at: number } | null>(null);
  /** Cadre lissé effectivement dessiné */
  const shown = useRef<Pt[] | null>(null);
  const lastHitAt = useRef(0);
  const recogInflight = useRef(false);
  const lastRecogAt = useRef(0);
  const lastFallbackAt = useRef(0);
  const failures = useRef(0);
  const phaseRef = useRef<Phase>("scanning");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [camera, setCamera] = useState<"starting" | "ready" | "error">("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [seen, setSeen] = useState(false);
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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Débogage neural : ?scandebug affiche le cosinus/marge en direct (opt-in,
  // par le paramètre d'URL ; invisible pour qui ne l'ajoute pas). Utile pour
  // régler les seuils sur de vraies cartes, y compris sur le site déployé.
  useEffect(() => {
    scanDebug.current = new URLSearchParams(window.location.search).has("scandebug");
  }, []);

  // Moteur de détection (worker OpenCV)
  useEffect(() => {
    const eng = new ScanEngine();
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
  // par le serveur (pHash) ; une fois prêts, une carte très sûre se verrouille
  // instantanément côté client, sans aller-retour réseau.
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

  // Confirmation d'ajout éphémère
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** Dessine (ou efface) le contour de la carte par-dessus la vidéo : coins marqués, liseré fin */
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
    ctx.globalAlpha = alpha;
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
    ctx.globalAlpha = 1;
  }

  // Rendu du cadre à chaque rafraîchissement d'écran : il glisse vers la
  // dernière détection (lissage exponentiel) et s'efface en fondu quand la
  // carte a disparu depuis un moment.
  useEffect(() => {
    if (camera !== "ready") return;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = target.current;
      if (phaseRef.current !== "scanning" || !t) {
        if (shown.current) {
          shown.current = null;
          drawOverlay(null, "seek");
        }
        return;
      }
      const age = now - t.at;
      if (age > HOLD_MS + 250) {
        target.current = null;
        shown.current = null;
        drawOverlay(null, "seek");
        return;
      }
      const video = videoRef.current;
      const longEdge = video ? Math.max(video.videoWidth, video.videoHeight) || 1080 : 1080;
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

  /**
   * Reconnaissance neurale locale de la carte redressée : renvoie true si elle
   * verrouille (carte très sûre et stable sur plusieurs images), sans réseau.
   */
  async function recognizeNeural(blob: Blob): Promise<boolean> {
    const ns = neuralRef.current;
    const idx = neuralIndexRef.current;
    if (!neuralReady.current || !ns || !idx) return false;
    const vecs = await ns.embedBlobVariants(blob, NEURAL_INSETS);
    if (!vecs.length || phaseRef.current !== "scanning") return false;
    // Meilleur candidat parmi les cadrages essayés
    let top: NeuralHit | null = null;
    let margin = 0;
    for (const v of vecs) {
      const hits = idx.search(v, 2);
      if (hits[0] && (!top || hits[0].cos > top.cos)) {
        top = hits[0];
        margin = hits[0].cos - (hits[1]?.cos ?? 0);
      }
    }
    if (!top) return false;
    if (scanDebug.current)
      setNeuralDebug({ name: top.name, cos: Number(top.cos.toFixed(3)), margin: Number(margin.toFixed(3)), streak: neuralStreak.current });
    if (top.cos < NEURAL_MATCH || margin < NEURAL_MARGIN) {
      neuralStreak.current = 0;
      neuralLastId.current = null;
      return false;
    }
    neuralStreak.current = neuralLastId.current === top.id ? neuralStreak.current + 1 : 1;
    neuralLastId.current = top.id;
    if (neuralStreak.current < NEURAL_STABLE) return false;
    neuralStreak.current = 0;
    altIndex.current = 0;
    navigator.vibrate?.(30);
    setFound(neuralToCandidate(top));
    setTicks((t) => t + 1);
    setPhase("found");
    return true;
  }

  /** Envoie une carte redressée à la reconnaissance et applique le verdict */
  async function recognize(blob: Blob) {
    recogInflight.current = true;
    lastRecogAt.current = performance.now();
    // Voie rapide locale : si le neural est prêt et très sûr, on verrouille
    // sans serveur. Sinon on retombe sur le pHash serveur (comportement acquis).
    try {
      if (await recognizeNeural(blob)) {
        recogInflight.current = false;
        return;
      }
    } catch {
      // erreur neurale : on continue vers le serveur
    }
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
      if (phaseRef.current !== "scanning") return;
      if (data.status === "match") {
        // Une réponse sûre (score et marge sur le suivant vérifiés par l'API) suffit : on verrouille
        altIndex.current = 0;
        navigator.vibrate?.(30);
        setFound(data.candidates[0]);
        setPhase("found");
      } else if (data.status === "ambiguous") {
        altIndex.current = 0;
        navigator.vibrate?.(20);
        setChoices(data.candidates);
        setPhase("choose");
      } else {
        // Rien : ce candidat n'est pas une carte connue, au suivant
        track.current = null;
        altIndex.current += 1;
      }
    } catch {
      // réseau : on réessaie à la prochaine carte stable
    } finally {
      recogInflight.current = false;
    }
  }

  // Boucle de détection : une analyse par image de la caméra, dans le
  // worker ; le cadre suit la carte, la reconnaissance part en parallèle dès
  // que la carte est stable.
  useEffect(() => {
    if (camera !== "ready" || engine === "loading") return;
    let alive = true;
    (async () => {
      while (alive) {
        const video = videoRef.current;
        const eng = engineRef.current;
        if (!video || phaseRef.current !== "scanning") {
          await nextFrame(video);
          continue;
        }
        const now = performance.now();
        if (engine === "error" || !eng) {
          // Détection indisponible : le centre de l'image, à cadence lente
          if (!recogInflight.current && now - lastFallbackAt.current > FALLBACK_EVERY_MS && eng) {
            lastFallbackAt.current = now;
            const blob = await eng.centerCrop(video);
            if (blob) void recognize(blob);
          }
          await nextFrame(video);
          continue;
        }
        const prev = track.current;
        const wantCrop =
          !!prev && prev.hits >= STABLE_HITS - 1 && !recogInflight.current && now - lastRecogAt.current > RECOG_EVERY_MS;
        let res: Awaited<ReturnType<ScanEngine["detect"]>>;
        try {
          res = await eng.detect(video, { prev: prev?.corners ?? null, k: MAX_QUADS, crop: wantCrop });
        } catch {
          await nextFrame(video);
          continue;
        }
        if (!alive) break;
        const at = performance.now();
        if (process.env.NODE_ENV !== "production") {
          // Compteurs de mise au point (window.__scan) : images analysées, temps cumulé dans le worker, suivis, détections
          const w = window as unknown as { __scan?: { frames?: number; ms?: number; tracked?: number; hits?: number; last?: unknown } };
          const st = (w.__scan ??= {});
          st.frames = (st.frames ?? 0) + 1;
          st.ms = (st.ms ?? 0) + res.ms;
          st.tracked = (st.tracked ?? 0) + (res.tracked ? 1 : 0);
          st.hits = (st.hits ?? 0) + (res.quads.length ? 1 : 0);
          st.last = { quads: res.quads.length, tracked: res.tracked, ms: Math.round(res.ms), crop: !!res.card, at: Math.round(at) };
        }
        let next: Track | null = null;
        let chosen: Quad | undefined;
        if (res.quads.length) {
          const same = prev ? res.quads.find((q) => overlaps(q.corners, prev.corners)) : undefined;
          if (same) {
            chosen = same;
            next = { corners: same.corners, hits: prev!.hits + 1 };
          } else {
            chosen = res.quads[altIndex.current % res.quads.length];
            next = { corners: chosen.corners, hits: 1 };
          }
        }
        track.current = next;
        if (next) {
          // Le cadre n'apparaît qu'à la deuxième image d'affilée : un
          // rectangle vu une seule fois (reflet, bord de table) ne clignote pas
          if (next.hits >= 2 || target.current) target.current = { corners: next.corners, at };
          lastHitAt.current = at;
          setSeen(true);
        } else if (at - lastHitAt.current > HOLD_MS) {
          setSeen(false);
        }
        // Carte stable et redressée : reconnaissance en parallèle
        if (res.card && chosen === res.quads[0] && next && next.hits >= STABLE_HITS && !recogInflight.current) {
          void recognize(res.card);
        }
        // Rien depuis un moment : la carte remplit peut-être déjà l'écran
        if (!next && at - lastHitAt.current > FALLBACK_AFTER_MS && !recogInflight.current && at - lastFallbackAt.current > FALLBACK_EVERY_MS) {
          lastFallbackAt.current = at;
          const blob = await eng.centerCrop(video);
          if (blob) void recognize(blob);
        }
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
    track.current = null;
    target.current = null;
    shown.current = null;
    altIndex.current = 0;
    lastHitAt.current = performance.now();
    setApiDown(false);
    setFound(null);
    setChoices([]);
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
      : ticks > 8
        ? "Rapproche-toi, évite les reflets, montre les quatre coins."
        : null;

  /** Cote de la carte affichée (null tant qu'elle charge) */
  const price = found && priceOf?.id === found.id ? priceOf : null;

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

      {/* Confirmation d'ajout */}
      {toast && (
        <div className="rise-in pointer-events-none relative z-10 mt-4 flex justify-center px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-gain px-4 py-2 text-sm font-semibold text-black shadow-lg">
            <Check size={15} aria-hidden />
            {toast} {noun}
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

      {/* Un tap hors de la feuille la referme et relance le scan */}
      {phase !== "scanning" && (
        <button
          type="button"
          onClick={rescan}
          disabled={confirming}
          aria-label="Fermer et rescanner"
          className="absolute inset-0 z-10 cursor-default bg-transparent"
        />
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
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {!price ? (
                  <span className="inline-flex items-center gap-1.5 text-faint">
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    Cote Cardmarket…
                  </span>
                ) : price.value != null ? (
                  <>
                    <span className="text-muted">Cote Cardmarket</span>
                    <span className="num font-semibold">{formatEur(price.value)}</span>
                  </>
                ) : (
                  <span className="text-faint">Cote Cardmarket indisponible</span>
                )}
                {price?.url && (
                  <a
                    href={price.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent-strong underline-offset-4 hover:underline"
                  >
                    Voir <ExternalLink size={11} aria-hidden />
                  </a>
                )}
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

      {/* Débogage neural (dev, ?scandebug) : régler NEURAL_MATCH / NEURAL_MARGIN */}
      {neuralDebug && (
        <div className="pointer-events-none fixed left-2 top-2 z-[60] rounded bg-black/75 px-2 py-1.5 font-mono text-[11px] leading-tight text-green-400">
          <div className="font-bold">{neuralDebug.name}</div>
          <div>
            cos {neuralDebug.cos} · marge {neuralDebug.margin}
          </div>
          <div className="text-green-300/70">
            seuil {NEURAL_MATCH}/{NEURAL_MARGIN} · série {neuralDebug.streak}/{NEURAL_STABLE}
          </div>
        </div>
      )}
    </div>
  );
}
