// Coordinateur d'embedding côté fil principal : démarre le worker ONNX
// (embed.worker.ts), transforme une carte redressée (blob JPEG ou ImageData)
// en image RGBA 256×256, l'envoie au worker et récupère l'embedding.
export class NeuralScanner {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (v: Float32Array | null) => void>();
  private canvas: HTMLCanvasElement = document.createElement("canvas");
  ready = false;

  static supported(): boolean {
    return typeof Worker !== "undefined" && typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined";
  }

  init(modelUrl: string, wasmPath = "/ort/"): Promise<void> {
    return new Promise((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(new URL("./embed.worker.ts", import.meta.url));
      } catch {
        return reject(new Error("worker"));
      }
      this.worker = w;
      const timer = setTimeout(() => reject(new Error("timeout")), 30000);
      w.onmessage = (e: MessageEvent<{ type: string; id?: number; vec?: ArrayBuffer; message?: string }>) => {
        const m = e.data;
        if (m.type === "ready") {
          clearTimeout(timer);
          this.ready = true;
          resolve();
        } else if (m.type === "error") {
          clearTimeout(timer);
          reject(new Error(m.message ?? "embed"));
        } else if (m.type === "embed" && m.id != null) {
          const cb = this.pending.get(m.id);
          this.pending.delete(m.id);
          cb?.(m.vec ? new Float32Array(m.vec) : null);
        }
      };
      w.onerror = () => {
        clearTimeout(timer);
        reject(new Error("worker"));
      };
      w.postMessage({ type: "init", modelUrl, wasmPath });
    });
  }

  /**
   * Carte redressée (JPEG) → embeddings sous quelques cadrages (insets : part
   * rognée sur chaque bord). Plusieurs cadrages rendent la reconnaissance
   * robuste au bord de carte inclus ou non par le redressement.
   */
  async embedBlobVariants(blob: Blob, insets: number[] = [0]): Promise<Float32Array[]> {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return [];
    }
    const out: Float32Array[] = [];
    for (const inset of insets) {
      const rgba = this.drawInset(bmp, inset);
      if (!rgba) continue;
      const v = await this.embedRGBA(rgba);
      if (v) out.push(v);
    }
    bmp.close?.();
    return out;
  }

  /** Carte redressée (JPEG) → embedding 512-d (cadrage plein), ou null. */
  async embedBlob(blob: Blob): Promise<Float32Array | null> {
    const rgba = await this.toRGBA256FromBlob(blob);
    if (!rgba) return null;
    return this.embedRGBA(rgba);
  }

  private drawInset(bmp: ImageBitmap, inset: number): ArrayBuffer | null {
    const c = this.canvas;
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const sx = bmp.width * inset;
    const sy = bmp.height * inset;
    const sw = bmp.width * (1 - 2 * inset);
    const sh = bmp.height * (1 - 2 * inset);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, 256, 256);
    return ctx.getImageData(0, 0, 256, 256).data.buffer;
  }

  /** Carte redressée déjà en RGBA (n'importe quelle taille) → embedding. */
  async embedImageData(img: ImageData): Promise<Float32Array | null> {
    const rgba = this.resizeRGBA(img);
    if (!rgba) return null;
    return this.embedRGBA(rgba);
  }

  private async toRGBA256FromBlob(blob: Blob): Promise<ArrayBuffer | null> {
    try {
      const bmp = await createImageBitmap(blob);
      const c = this.canvas;
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, 256, 256);
      bmp.close?.();
      return ctx.getImageData(0, 0, 256, 256).data.buffer;
    } catch {
      return null;
    }
  }

  private resizeRGBA(img: ImageData): ArrayBuffer | null {
    const c = this.canvas;
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const tmp = new OffscreenCanvas(img.width, img.height);
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tmp, 0, 0, 256, 256);
    return ctx.getImageData(0, 0, 256, 256).data.buffer;
  }

  private embedRGBA(rgba: ArrayBuffer): Promise<Float32Array | null> {
    const w = this.worker;
    if (!w) return Promise.resolve(null);
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, 4000);
      this.pending.set(id, (v) => {
        window.clearTimeout(timer);
        resolve(v);
      });
      w.postMessage({ type: "embed", id, rgba }, [rgba]);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending.clear();
  }
}
