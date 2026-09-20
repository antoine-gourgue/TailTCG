// Worker d'embedding : MobileCLIP-S0 (ONNX) tourne hors du fil principal via
// onnxruntime-web (WASM). Reçoit une image RGBA 256×256 de la carte redressée
// et renvoie son embedding 512-d L2-normalisé, comparé ensuite à l'index.
import * as ort from "onnxruntime-web/wasm";

export type EmbedIn =
  | { type: "init"; modelUrl: string; wasmPath: string }
  | { type: "embed"; id: number; rgba: ArrayBuffer };
export type EmbedOut =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "embed"; id: number; vec: ArrayBuffer };

const ctx = self as unknown as {
  postMessage: (m: EmbedOut, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<EmbedIn>) => void) | null;
};
const EDGE = 256;
let session: ort.InferenceSession | null = null;

ctx.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      ort.env.wasm.wasmPaths = m.wasmPath;
      // Un seul thread : pas besoin d'isolation d'origine (COOP/COEP).
      ort.env.wasm.numThreads = 1;
      session = await ort.InferenceSession.create(m.modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      ctx.postMessage({ type: "ready" });
    } else if (m.type === "embed" && session) {
      // RGBA 256×256 -> CHW float32 [0,1] RGB (préproc identique à l'index)
      const rgba = new Uint8ClampedArray(m.rgba);
      const n = EDGE * EDGE;
      const chw = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        chw[i] = rgba[i * 4] / 255;
        chw[n + i] = rgba[i * 4 + 1] / 255;
        chw[2 * n + i] = rgba[i * 4 + 2] / 255;
      }
      const out = await session.run({ pixel_values: new ort.Tensor("float32", chw, [1, 3, EDGE, EDGE]) });
      const v = out.image_embeds.data as Float32Array;
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i] * v[i];
      s = 1 / (Math.sqrt(s) + 1e-9);
      const o = new Float32Array(v.length);
      for (let i = 0; i < v.length; i++) o[i] = v[i] * s;
      ctx.postMessage({ type: "embed", id: m.id, vec: o.buffer }, [o.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ type: "error", message: String(err) });
  }
};
