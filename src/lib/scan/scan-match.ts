// Identification locale d'une carte (reprise du scanner GoupixDex) : types
// partagés, coordinateurs des workers d'embedding et de pHash, et image d'une
// carte reconnue. Tout se joue sur l'appareil : aucune photo n'est envoyée.
import type { IdentifyIn, IdentifyOut } from "./identify.worker";
import type { PhashIn, PhashOut } from "./phash.worker";
import { cachedJson } from "./asset-cache";

/** Carte reconnue, prête à ajouter */
export type ScanMatchDecision = {
  tcgdexCardId: string;
  /** Langue retenue : la locale du print reconnu (ou celle de la session) */
  language: string;
  name: string;
  setId: string;
  localId: string;
};

/** Langue de la session de scan (`auto` = locale du meilleur print) */
export type ScanCardLanguage = "auto" | "ja" | "en" | "fr";

/** Résultat du matcher pHash (empreinte de l'illustration) : décision SÛRE ou refus */
export type ScanPhashResult = {
  status: "match" | "none";
  decision: ScanMatchDecision | null;
  /** Distance de Hamming normalisée du meilleur alignement (0 = identique) */
  score: number;
  rival?: number;
  topName?: string;
};

/** Résultat brut d'une tentative d'identification par embedding (décision + meilleur pari) */
export type ScanIdentifyResult = {
  /** Identification SÛRE (plancher + marge), ou null */
  decision: ScanMatchDecision | null;
  /** Meilleur pari résolu, committable après agrégation dans le temps */
  topCandidate: ScanMatchDecision | null;
  topCandidateSim: number;
  topCardId: string | null;
  topSim: number;
  topMargin: number;
  bestCropIndex: number;
};

export const EMPTY_IDENTIFY: ScanIdentifyResult = {
  decision: null,
  topCandidate: null,
  topCandidateSim: 0,
  topCardId: null,
  topSim: 0,
  topMargin: 0,
  bestCropIndex: 0,
};
export const EMPTY_PHASH: ScanPhashResult = { status: "none", decision: null, score: 1 };

/** Modèles et index hébergés sur Supabase Storage (bucket public scan-assets, cache long) */
const SCAN_ASSETS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/scan-assets`;
export const SCAN_ASSET_URLS = {
  corners: `${SCAN_ASSETS}/card-corners.onnx`,
  s0Model: `${SCAN_ASSETS}/mobileclip-s0-vision-fp16.onnx`,
  s0Bin: `${SCAN_ASSETS}/embed-v3.bin`,
  s0Json: `${SCAN_ASSETS}/embed-v3.json`,
  mnetModel: `${SCAN_ASSETS}/mobilenet-embed-int8.onnx`,
  mnetBin: `${SCAN_ASSETS}/embed-v2.bin`,
  mnetPca: `${SCAN_ASSETS}/embed-pca-v2.bin`,
  mnetJson: `${SCAN_ASSETS}/embed-v2.json`,
  phashBin: `${SCAN_ASSETS}/phash-v1.bin`,
  phashJson: `${SCAN_ASSETS}/phash-v1.json`,
  images: `${SCAN_ASSETS}/phash-images.json`,
};
const ORT_WASM_PATH = "/ort/";
const IDENTIFY_TIMEOUT_MS = 15_000;
const MATCH_TIMEOUT_MS = 8_000;

/** Worker d'identification par embedding (MobileCLIP-S0 + MobileNetV2), une instance par scanner */
export class ScanIdentifier {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: ScanIdentifyResult) => void>();
  ready = false;

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof Worker === "undefined") return reject(new Error("worker"));
      let w: Worker;
      try {
        w = new Worker(new URL("./identify.worker.ts", import.meta.url));
      } catch {
        return reject(new Error("worker"));
      }
      this.worker = w;
      w.onerror = () => reject(new Error("worker"));
      w.onmessage = (e: MessageEvent<IdentifyOut>) => {
        const m = e.data;
        if (m.type === "ready") {
          this.ready = true;
          resolve();
        } else if (m.type === "error") reject(new Error(m.message));
        else if (m.type === "result") {
          const cb = this.pending.get(m.seq);
          this.pending.delete(m.seq);
          cb?.(m.result);
        }
      };
      const init: IdentifyIn = {
        type: "init",
        wasmPath: ORT_WASM_PATH,
        s0ModelUrl: SCAN_ASSET_URLS.s0Model,
        s0BinUrl: SCAN_ASSET_URLS.s0Bin,
        s0JsonUrl: SCAN_ASSET_URLS.s0Json,
        mnetModelUrl: SCAN_ASSET_URLS.mnetModel,
        mnetBinUrl: SCAN_ASSET_URLS.mnetBin,
        mnetPcaUrl: SCAN_ASSET_URLS.mnetPca,
        mnetJsonUrl: SCAN_ASSET_URLS.mnetJson,
      };
      w.postMessage(init);
    });
  }

  /** Identifie une tentative (crops RGBA 256×256, TRANSFÉRÉS) */
  identify(bufs: ArrayBuffer[], language: ScanCardLanguage): Promise<ScanIdentifyResult> {
    const w = this.worker;
    if (!w || !this.ready || bufs.length === 0) return Promise.resolve(EMPTY_IDENTIFY);
    const seq = ++this.seq;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(seq);
        resolve(EMPTY_IDENTIFY);
      }, IDENTIFY_TIMEOUT_MS);
      this.pending.set(seq, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });
      const msg: IdentifyIn = { type: "identify", seq, bufs, language };
      w.postMessage(msg, bufs);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending.clear();
  }
}

/** Worker pHash (empreinte de l'illustration, 94k cartes) : instantané, refuse au lieu de deviner */
export class ScanPhash {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: ScanPhashResult) => void>();
  ready = false;

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof Worker === "undefined") return reject(new Error("worker"));
      let w: Worker;
      try {
        w = new Worker(new URL("./phash.worker.ts", import.meta.url));
      } catch {
        return reject(new Error("worker"));
      }
      this.worker = w;
      w.onerror = () => reject(new Error("worker"));
      w.onmessage = (e: MessageEvent<PhashOut>) => {
        const m = e.data;
        if (m.type === "ready") {
          this.ready = true;
          resolve();
        } else if (m.type === "error") reject(new Error(m.message));
        else if (m.type === "result") {
          const cb = this.pending.get(m.seq);
          this.pending.delete(m.seq);
          cb?.(m.result);
        }
      };
      const init: PhashIn = { type: "init", binUrl: SCAN_ASSET_URLS.phashBin, jsonUrl: SCAN_ASSET_URLS.phashJson };
      w.postMessage(init);
    });
  }

  /** Matche une carte REDRESSÉE (RGBA w×h, TRANSFÉRÉ) */
  match(buf: ArrayBuffer, w: number, h: number, language: ScanCardLanguage): Promise<ScanPhashResult> {
    const wk = this.worker;
    if (!wk || !this.ready) return Promise.resolve(EMPTY_PHASH);
    const seq = ++this.seq;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(seq);
        resolve(EMPTY_PHASH);
      }, MATCH_TIMEOUT_MS);
      this.pending.set(seq, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });
      const msg: PhashIn = { type: "match", seq, buf, w, h, language };
      wk.postMessage(msg, [buf]);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending.clear();
  }
}

/* ——— Image d'une carte reconnue, disponible tout de suite ——— */

/** Images stockées (id TCGdex → URL) : les JA récentes dont TCGdex n'a pas le visuel */
let storedImages: Record<string, string> = {};
let imagesPromise: Promise<void> | null = null;

export function loadStoredImages(): Promise<void> {
  if (!imagesPromise) {
    imagesPromise = cachedJson<Record<string, string>>(SCAN_ASSET_URLS.images)
      .then((m) => {
        storedImages = m;
      })
      .catch(() => {
        storedImages = {};
      });
  }
  return imagesPromise;
}

/** Série TCGdex déduite de l'id de set (me02 → me, swsh2 → swsh) */
function deriveSerie(setId: string): string {
  const m = setId.match(/^[A-Za-z]+/);
  return m ? m[0] : setId;
}

/**
 * Visuel d'une carte reconnue : URL stockée si TCGdex ne l'a pas (finale,
 * ex. Limitless), sinon BASE TCGdex sans extension — le format des items et
 * de `CardImage`, qui ajoute low.webp / high.png.
 */
export function cardImageBase(d: ScanMatchDecision): string {
  const stored = storedImages[d.tcgdexCardId];
  if (stored) return stored.replace(/\/(low\.webp|high\.png|high\.webp)$/, "");
  return `https://assets.tcgdex.net/${d.language}/${deriveSerie(d.setId)}/${d.setId}/${d.localId}`;
}
