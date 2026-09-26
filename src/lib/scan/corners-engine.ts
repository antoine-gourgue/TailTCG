// Coordinateur, côté fil principal, du détecteur de coins (corners.worker.ts) :
// prélève l'image de la caméra réduite, l'envoie au worker, récupère les coins
// (pixels vidéo), les crops d'identification et la carte redressée (RGBA,
// transférés). Garde-fous : aucune promesse ne reste en suspens si le worker cale.
import type { Pt } from "./detect.mjs";
import type { CornersIn, CornersOut } from "./corners.worker";

/** Grand côté de l'image analysée (plus = coins plus précis, ~2-10 ms quand même) */
const PROC_EDGE = 640;
/** Zone-guide (repli quand la détection est indisponible) : fraction de la hauteur vidéo */
const GUIDE_H_FRAC = 0.62;

export type CardCrop = { buf: ArrayBuffer; w: number; h: number };
export type CornerResult = {
  corners: Pt[] | null;
  presence: number;
  /** Crops d'identification RGBA 256×256 (image nette seulement) */
  idcrops: ArrayBuffer[] | null;
  /** Carte redressée RGBA (pHash) ; `guide` = zone centrale faute de coins */
  card: CardCrop | null;
  guide: boolean;
  ms: number;
};
const NONE: CornerResult = { corners: null, presence: 0, idcrops: null, card: null, guide: false, ms: 0 };

export class CornerEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: Extract<CornersOut, { type: "result" }>) => void>();
  private frame = document.createElement("canvas");
  private guideCanvas = document.createElement("canvas");
  busy = false;

  static supported(): boolean {
    return typeof Worker !== "undefined" && typeof ImageData !== "undefined";
  }

  init(modelUrl: string, wasmPath = "/ort/"): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!CornerEngine.supported()) return reject(new Error("worker"));
      let w: Worker;
      try {
        w = new Worker(new URL("./corners.worker.ts", import.meta.url));
      } catch {
        return reject(new Error("worker"));
      }
      this.worker = w;
      const timer = window.setTimeout(() => reject(new Error("timeout")), 90_000);
      w.onmessage = (e: MessageEvent<CornersOut>) => {
        const m = e.data;
        if (m.type === "ready") {
          window.clearTimeout(timer);
          resolve();
        } else if (m.type === "error") {
          window.clearTimeout(timer);
          reject(new Error(m.message));
        } else if (m.type === "result") {
          const cb = this.pending.get(m.id);
          this.pending.delete(m.id);
          cb?.(m);
        }
      };
      w.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("worker"));
        for (const cb of this.pending.values()) cb({ type: "result", id: -1, corners: null, presence: 0, idcrops: null, card: null, ms: 0 });
        this.pending.clear();
        this.busy = false;
      };
      const init: CornersIn = { type: "init", modelUrl, wasmPath };
      w.postMessage(init);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  /** Image courante réduite (grand côté PROC_EDGE), buffer transférable */
  private grab(video: HTMLVideoElement): { buf: ArrayBuffer; w: number; h: number } | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return null;
    const s = Math.min(1, PROC_EDGE / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * s));
    const h = Math.max(1, Math.round(vh * s));
    const c = this.frame;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return { buf: ctx.getImageData(0, 0, w, h).data.buffer as ArrayBuffer, w, h };
  }

  /** Coins de la carte à l'image courante ; `crop` : produire aussi les crops d'identification et la carte redressée */
  async detect(video: HTMLVideoElement, opts: { crop?: boolean } = {}): Promise<CornerResult> {
    const w = this.worker;
    const f = this.grab(video);
    if (!w || !f) return NONE;
    const id = ++this.seq;
    this.busy = true;
    const msg: CornersIn = { type: "detect", id, buf: f.buf, w: f.w, h: f.h, vw: video.videoWidth, vh: video.videoHeight, crop: !!opts.crop };
    const res = await new Promise<Extract<CornersOut, { type: "result" }>>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({ type: "result", id, corners: null, presence: 0, idcrops: null, card: null, ms: 0 });
      }, 2000);
      this.pending.set(id, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });
      w.postMessage(msg, [f.buf]);
    });
    this.busy = false;
    return {
      corners: res.corners,
      presence: res.presence,
      idcrops: res.idcrops,
      card: res.card ? { buf: res.card.buf, w: res.card.w, h: res.card.h } : null,
      guide: !!res.card?.guide,
      ms: res.ms,
    };
  }

  /** Zone-guide centrale (format carte) en RGBA 180×252 : repli quand le détecteur n'est pas disponible */
  guideCrop(video: HTMLVideoElement): CardCrop | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const gh = vh * GUIDE_H_FRAC;
    const gw = gh * (63 / 88);
    const c = this.guideCanvas;
    c.width = 180;
    c.height = 252;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, (vw - gw) / 2, (vh - gh) / 2, gw, gh, 0, 0, 180, 252);
    return { buf: ctx.getImageData(0, 0, 180, 252).data.buffer as ArrayBuffer, w: 180, h: 252 };
  }
}
