// Détection du cadre d'une carte dans une photo fixe, avec le même worker
// OpenCV que le scan vidéo. Sert à la pré-gradation : le cadrage se propose
// tout seul, l'utilisateur ne fait qu'ajuster.
import { OPENCV_URL, DETECT_W } from "./engine";
import type { Pt } from "./detect.mjs";
import type { WorkerIn, WorkerOut } from "./detect.worker";

export type NormPt = { x: number; y: number };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let seq = 0;

function ensureWorker(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    if (typeof Worker === "undefined") return reject(new Error("worker"));
    let w: Worker;
    try {
      w = new Worker(new URL("./detect.worker.ts", import.meta.url));
    } catch {
      return reject(new Error("worker"));
    }
    worker = w;
    w.addEventListener("message", (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === "ready") resolve();
      else if (e.data.type === "error") reject(new Error("opencv"));
    });
    w.onerror = () => reject(new Error("worker"));
    const init: WorkerIn = { type: "init", url: OPENCV_URL };
    w.postMessage(init);
  });
  ready.catch(() => {
    ready = null;
    worker = null;
  });
  return ready;
}

/** Coins triés haut-gauche, haut-droit, bas-droit, bas-gauche (angle croissant autour du centre = sens horaire à l'écran) */
function order(corners: Pt[]): Pt[] {
  const cx = corners.reduce((a, p) => a + p[0], 0) / 4;
  const cy = corners.reduce((a, p) => a + p[1], 0) / 4;
  const byAngle = [...corners].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const tl = byAngle.reduce((best, p, i) => (p[0] + p[1] < byAngle[best][0] + byAngle[best][1] ? i : best), 0);
  return [...byAngle.slice(tl), ...byAngle.slice(0, tl)];
}

/**
 * Cherche la carte dans l'image ; renvoie ses coins normalisés (0–1) dans
 * le repère de l'image, ou null si rien de convaincant.
 */
export async function detectCardInImage(img: HTMLImageElement, timeoutMs = 6000): Promise<NormPt[] | null> {
  await ensureWorker();
  const w = worker;
  if (!w) return null;
  const width = DETECT_W;
  const height = Math.max(1, Math.round((img.naturalHeight * width) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const small = ctx.getImageData(0, 0, width, height);

  const id = ++seq;
  return new Promise<NormPt[] | null>((resolve) => {
    const timer = setTimeout(() => {
      w.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    function onMessage(e: MessageEvent<WorkerOut>) {
      const m = e.data;
      if (m.type !== "result" || m.id !== id) return;
      clearTimeout(timer);
      w!.removeEventListener("message", onMessage);
      const best = m.quads[0];
      if (!best || best.corners.length !== 4) return resolve(null);
      resolve(order(best.corners).map(([x, y]) => ({ x: Math.min(1, Math.max(0, x / width)), y: Math.min(1, Math.max(0, y / height)) })));
    }
    w.addEventListener("message", onMessage);
    const msg: WorkerIn = { type: "frame", id, small, k: 1 };
    w.postMessage(msg);
  });
}
