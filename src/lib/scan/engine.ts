// Moteur de détection côté fil principal : pilote le worker OpenCV
// (detect.worker.ts), prend les images de la vidéo et rend les coins de la
// carte dans le repère de la vidéo, plus la carte redressée en JPEG quand on
// la demande pour la reconnaissance.
import type { Pt } from "./detect.mjs";
import type { WorkerIn, WorkerOut } from "./detect.worker";
import { CARD_W, CARD_H } from "./detect.mjs";

/** OpenCV.js, chargé une fois depuis le CDN et mis en cache par le navigateur */
export const OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
/** Largeur de travail pour la détection ; largeur de capture pour le redressement */
export const DETECT_W = 360;
export const CAPTURE_W = 720;

export type Quad = { corners: Pt[]; score: number };
export type DetectResult = {
  /** candidats, coins dans le repère de la vidéo (pixels) */
  quads: Quad[];
  /** carte redressée en JPEG, si demandée et trouvée */
  card: Blob | null;
  tracked: boolean;
  ms: number;
};

export class ScanEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: Extract<WorkerOut, { type: "result" }>) => void>();
  private small = document.createElement("canvas");
  private full = document.createElement("canvas");
  private card = document.createElement("canvas");
  /** rapport largeur de détection / largeur vidéo, fixé à la première image */
  private scale = 1;
  busy = false;

  static supported(): boolean {
    return typeof Worker !== "undefined" && typeof ImageData !== "undefined";
  }

  /** Démarre le worker et y charge OpenCV ; rejette si le navigateur ne peut pas (pas de worker) */
  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!ScanEngine.supported()) return reject(new Error("worker"));
      let w: Worker;
      try {
        w = new Worker(new URL("./detect.worker.ts", import.meta.url));
      } catch {
        return reject(new Error("worker"));
      }
      this.worker = w;
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === "ready") resolve();
        else if (m.type === "error") reject(new Error("opencv"));
        else if (m.type === "result") {
          const cb = this.pending.get(m.id);
          this.pending.delete(m.id);
          cb?.(m);
        }
      };
      w.onerror = () => {
        reject(new Error("worker"));
        for (const cb of this.pending.values()) cb({ type: "result", id: -1, quads: [], tracked: false, ms: 0 });
        this.pending.clear();
        this.busy = false;
      };
      const init: WorkerIn = { type: "init", url: OPENCV_URL };
      w.postMessage(init);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private grab(canvas: HTMLCanvasElement, video: HTMLVideoElement, width: number): ImageData | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = width;
    const h = Math.round((vh * width) / vw);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  /**
   * Analyse l'image courante de la vidéo. `prev` : coins (repère vidéo) de
   * la carte à l'image précédente, pour la chercher d'abord autour ; `crop` :
   * renvoyer aussi la carte redressée (candidat `cropIndex`) en JPEG.
   */
  async detect(
    video: HTMLVideoElement,
    opts: { prev?: Pt[] | null; k?: number; crop?: boolean; cropIndex?: number } = {},
  ): Promise<DetectResult> {
    const w = this.worker;
    const small = this.grab(this.small, video, DETECT_W);
    if (!w || !small) return { quads: [], card: null, tracked: false, ms: 0 };
    this.scale = DETECT_W / video.videoWidth;
    const full = opts.crop ? this.grab(this.full, video, CAPTURE_W) : null;
    const s = this.scale;
    const id = ++this.seq;
    this.busy = true;
    const msg: WorkerIn = {
      type: "frame",
      id,
      small,
      full: full ?? undefined,
      prev: opts.prev ? opts.prev.map(([x, y]) => [x * s, y * s] as Pt) : null,
      k: opts.k ?? 3,
      cropIndex: opts.cropIndex ?? 0,
    };
    const res = await new Promise<Extract<WorkerOut, { type: "result" }>>((resolve) => {
      this.pending.set(id, resolve);
      w.postMessage(msg, [small.data.buffer, ...(full ? [full.data.buffer] : [])]);
    });
    this.busy = false;
    const quads = res.quads.map((q) => ({ corners: q.corners.map(([x, y]) => [x / s, y / s] as Pt), score: q.score }));
    let card: Blob | null = null;
    if (res.card) card = await this.encode(res.card);
    return { quads, card, tracked: res.tracked, ms: res.ms };
  }

  /** Carte redressée RGBA → JPEG */
  private encode(rgba: ArrayBuffer): Promise<Blob | null> {
    const c = this.card;
    c.width = CARD_W;
    c.height = CARD_H;
    const ctx = c.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), CARD_W, CARD_H), 0, 0);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.8));
  }

  /** Le centre de l'image au format carte, en JPEG (repli quand rien n'est détecté : la carte remplit l'écran) */
  centerCrop(video: HTMLVideoElement): Promise<Blob | null> {
    const full = this.grab(this.full, video, CAPTURE_W);
    if (!full) return Promise.resolve(null);
    const c = this.card;
    c.width = CARD_W;
    c.height = CARD_H;
    const ctx = c.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    const gW = this.full.width * 0.8;
    const gH = gW / (CARD_W / CARD_H);
    ctx.drawImage(this.full, (this.full.width - gW) / 2, (this.full.height - gH) / 2, gW, gH, 0, 0, CARD_W, CARD_H);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.8));
  }
}
