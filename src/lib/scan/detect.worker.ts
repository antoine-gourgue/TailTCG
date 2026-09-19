// Worker de détection : OpenCV.js y tourne hors du fil principal, pour que la
// vidéo et le cadre restent fluides pendant l'analyse. Reçoit des images
// (ImageData) et renvoie les coins des cartes trouvées ; sur demande, la
// carte redressée (RGBA) pour la reconnaissance.
import { detectCardQuads, trackCardQuad, warpCard, CARD_W, CARD_H, type Pt } from "./detect.mjs";

export type WorkerIn =
  | { type: "init"; url: string }
  | {
      type: "frame";
      id: number;
      /** image d'analyse (petite) */
      small: ImageData;
      /** image de capture (plus grande), quand on veut la carte redressée */
      full?: ImageData;
      /** coins de la carte à l'image précédente, dans le repère de `small` : on cherche d'abord autour */
      prev?: Pt[] | null;
      /** nombre de candidats */
      k: number;
      /** index du candidat à redresser (quand `full` est fourni) */
      cropIndex?: number;
    };
export type WorkerOut =
  | { type: "ready" }
  | { type: "error" }
  | {
      type: "result";
      id: number;
      /** candidats, coins dans le repère de `small` */
      quads: { corners: Pt[]; score: number }[];
      /** carte redressée CARD_W×CARD_H RGBA, si demandée et trouvée */
      card?: ArrayBuffer;
      /** vrai si le candidat vient du suivi local (fenêtre autour de la position précédente) */
      tracked: boolean;
      ms: number;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;
const ctx = self as unknown as {
  postMessage: (m: WorkerOut, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
  importScripts?: (url: string) => void;
  cv?: CV;
};
let cv: CV = null;

async function loadOpenCV(url: string): Promise<CV> {
  if (typeof ctx.importScripts === "function") ctx.importScripts(url);
  else {
    const code = await (await fetch(url)).text();
    (0, eval)(code);
  }
  const mod = ctx.cv;
  if (!mod) throw new Error("opencv");
  // Module Emscripten : un « thenable » qui se résout sur lui-même, à ne
  // jamais await-er — on attend l'init par rappel puis on retire `then`.
  await new Promise<void>((resolve) => {
    const done = () => {
      delete mod.then;
      resolve();
    };
    if (mod.Mat) done();
    else if (typeof mod.then === "function") mod.then(done);
    else mod.onRuntimeInitialized = done;
  });
  return mod;
}

/** Deux quadrilatères désignent-ils le même objet (coins à moins d'un quart de la diagonale) ? */
function overlaps(a: Pt[], b: Pt[]): boolean {
  const diag = Math.hypot(a[2][0] - a[0][0], a[2][1] - a[0][1]);
  let e = 0;
  for (let i = 0; i < 4; i++) e += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return e / 4 < 0.25 * diag;
}

function handleFrame(m: Extract<WorkerIn, { type: "frame" }>) {
  const t0 = performance.now();
  const src = cv.matFromImageData(m.small);
  let quads: { corners: Pt[]; score: number }[] = [];
  let tracked = false;
  let card: ArrayBuffer | undefined;
  try {
    if (m.prev) {
      // suivi local d'abord : rapide et stable ; on exige d'y retrouver la même carte
      const local = trackCardQuad(cv, src, m.prev, m.k) as { corners: Pt[]; score: number }[];
      const same = local.find((q) => overlaps(q.corners, m.prev!));
      if (same) {
        quads = [same, ...local.filter((q) => q !== same)];
        tracked = true;
      }
    }
    if (!tracked) quads = detectCardQuads(cv, src, m.k) as { corners: Pt[]; score: number }[];
    const chosen = quads[m.cropIndex ?? 0];
    if (m.full && chosen) {
      const full = cv.matFromImageData(m.full);
      const s = m.full.width / m.small.width;
      const warped = warpCard(cv, full, chosen.corners.map(([x, y]) => [x * s, y * s] as Pt));
      // copie continue de CARD_W×CARD_H×4 octets, transférée au fil principal
      card = new Uint8ClampedArray(warped.data).buffer;
      warped.delete();
      full.delete();
    }
  } catch {
    quads = [];
  } finally {
    src.delete();
  }
  const out: WorkerOut = {
    type: "result",
    id: m.id,
    quads: quads.map((q) => ({ corners: q.corners, score: q.score })),
    card,
    tracked,
    ms: performance.now() - t0,
  };
  ctx.postMessage(out, card ? [card] : []);
}

ctx.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    try {
      cv = await loadOpenCV(m.url);
      ctx.postMessage({ type: "ready" });
    } catch {
      ctx.postMessage({ type: "error" });
    }
    return;
  }
  if (m.type === "frame") {
    if (!cv) {
      ctx.postMessage({ type: "result", id: m.id, quads: [], tracked: false, ms: 0 });
      return;
    }
    handleFrame(m);
  }
};

export { CARD_W, CARD_H };
