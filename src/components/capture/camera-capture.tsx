"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

/**
 * Caméra arrière du téléphone avec un cadre-guide au format carte (63/88).
 * `onCapture` reçoit un dataURL JPEG recadré sur le cadre.
 */
export function CameraCapture({
  onCapture,
}: {
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch {
        setError("Caméra inaccessible. Autorise l'accès dans ton navigateur.");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Le cadre-guide fait 80 % de la largeur, ratio 63/88
  const GUIDE_W = 0.8;
  const GUIDE_RATIO = 63 / 88;

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Le cadre à l'écran, ramené aux dimensions intrinsèques de la vidéo
    // (la vidéo est en object-cover : on calcule la zone réellement visible)
    const elW = video.clientWidth;
    const elH = video.clientHeight;
    const scale = Math.max(elW / vw, elH / vh); // cover
    const shownW = vw * scale;
    const shownH = vh * scale;
    const offX = (shownW - elW) / 2;
    const offY = (shownH - elH) / 2;

    const guideWpx = elW * GUIDE_W;
    const guideHpx = guideWpx / GUIDE_RATIO;
    const guideX = (elW - guideWpx) / 2;
    const guideY = (elH - guideHpx) / 2;

    // Vers coordonnées vidéo
    const sx = (guideX + offX) / scale;
    const sy = (guideY + offY) / scale;
    const sw = guideWpx / scale;
    const sh = guideHpx / scale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <RefreshCw size={32} className="text-faint" aria-hidden />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
      {/* Cadre-guide */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ width: `${GUIDE_W * 100}%`, aspectRatio: "63 / 88" }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-5">
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Prendre la photo"
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 backdrop-blur transition active:scale-95 disabled:opacity-40"
        >
          <Camera size={26} className="text-white" aria-hidden />
        </button>
      </div>
    </div>
  );
}
