// Coordinateur, côté fil principal, du détecteur de coins (corners.worker.ts) :
// prélève l'image de la caméra réduite, l'envoie au worker, récupère les coins
// de la carte (pixels vidéo) et la carte redressée encodée en JPEG pour la
// reconnaissance. Garde-fous : aucune promesse ne reste en suspens si le
// worker cale.
import type { Pt } from "./detect.mjs";
import type { CornersIn, CornersOut } from "./corners.worker";

/** Modèle hébergé sur Supabase Storage (bucket public scan-assets), comme l'index neural */
export const CORNER_MODEL_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/scan-assets/card-corners.onnx`;
/** Grand côté de l'image analysée (plus = coins plus précis, ~2-10 ms quand même) */
const PROC_EDGE = 640;
/** Zone-guide (repli quand la détection est indisponible) : fraction de la hauteur vidéo */
const GUIDE_H_FRAC = 0.62;

export type CornerResult = {
  corners: Pt[] | null;
  presence: number;
  /** Carte redressée (JPEG), quand demandée et nette ; `guide` = zone centrale faute de coins */
  card: Blob | null;
  guide: boolean;
  ms: number;
};

export class CornerEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: Extract<CornersOut, { type: "result" }>) => void>();
  private frame = document.createElement("canvas");
  private cardCanvas = document.createElement("canvas");
  busy = false;

  static supported(): boolean {
    return typeof Worker !== "undefined" && typeof ImageData !== "undefined";
  }

  init(modelUrl = CORNER_MODEL_URL, wasmPath = "/ort/"): Promise<void> {
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
        for (const cb of this.pending.values()) cb({ type: "result", id: -1, corners: null, presence: 0, card: null, ms: 0 });
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

  /** Coins de la carte à l'image courante ; `crop` : renvoyer aussi la carte redressée (si nette) */
  async detect(video: HTMLVideoElement, opts: { crop?: boolean } = {}): Promise<CornerResult> {
    const w = this.worker;
    const f = this.grab(video);
    const none: CornerResult = { corners: null, presence: 0, card: null, guide: false, ms: 0 };
    if (!w || !f) return none;
    const id = ++this.seq;
    this.busy = true;
    const msg: CornersIn = { type: "detect", id, buf: f.buf, w: f.w, h: f.h, vw: video.videoWidth, vh: video.videoHeight, crop: !!opts.crop };
    const res = await new Promise<Extract<CornersOut, { type: "result" }>>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({ type: "result", id, corners: null, presence: 0, card: null, ms: 0 });
      }, 2000);
      this.pending.set(id, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });
      w.postMessage(msg, [f.buf]);
    });
    this.busy = false;
    let card: Blob | null = null;
    if (res.card) card = await this.encode(new ImageData(new Uint8ClampedArray(res.card.buf), res.card.w, res.card.h));
    return { corners: res.corners, presence: res.presence, card, guide: !!res.card?.guide, ms: res.ms };
  }

  /** Zone-guide centrale (format carte) en JPEG : repli quand le détecteur n'est pas disponible */
  async guideCrop(video: HTMLVideoElement): Promise<Blob | null> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const gh = vh * GUIDE_H_FRAC;
    const gw = gh * (63 / 88);
    const c = this.cardCanvas;
    c.width = 360;
    c.height = 504;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, (vw - gw) / 2, (vh - gh) / 2, gw, gh, 0, 0, 360, 504);
    return this.toBlob(c);
  }

  private async encode(img: ImageData): Promise<Blob | null> {
    const c = this.cardCanvas;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(img, 0, 0);
    return this.toBlob(c);
  }

  /** Canvas → JPEG, sans jamais rester en suspens */
  private toBlob(c: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 1000);
      c.toBlob(
        (b) => {
          window.clearTimeout(timer);
          resolve(b);
        },
        "image/jpeg",
        0.85,
      );
    });
  }
}
