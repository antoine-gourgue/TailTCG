"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  uploadItemPhotos,
  deleteItemPhoto,
  type PhotoActionState,
} from "@/app/items/photo-actions";

export type GalleryPhoto = {
  id: string;
  url: string;
  label: string | null;
};

export function PhotoGallery({
  itemId,
  photos,
}: {
  itemId: string;
  photos: GalleryPhoto[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PhotoActionState>(null);
  const [compressing, setCompressing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<number | null>(null);

  const busy = compressing || pending;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setState(null);
    setCompressing(true);

    try {
      // Compression côté navigateur : 1600 px, qualité 0,8, sortie WebP
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const batches: FormData[] = [];
      for (const file of Array.from(fileList).slice(0, 10)) {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1600,
          initialQuality: 0.8,
          fileType: "image/webp",
          maxSizeMB: 1.5,
          useWebWorker: true,
        });
        // Un envoi par photo pour rester sous les limites de taille de requête
        const formData = new FormData();
        formData.set("item_id", itemId);
        formData.append(
          "photos",
          new File([compressed], "photo.webp", { type: "image/webp" })
        );
        batches.push(formData);
      }

      setCompressing(false);
      startTransition(async () => {
        let sent = 0;
        for (const formData of batches) {
          const result = await uploadItemPhotos(null, formData);
          if (!result?.ok) {
            setState(result);
            return;
          }
          sent++;
        }
        setState({
          ok: true,
          message: `${sent} photo${sent > 1 ? "s" : ""} ajoutée${sent > 1 ? "s" : ""}.`,
        });
      });
    } catch {
      setCompressing(false);
      setState({ ok: false, message: "Compression impossible sur cette image." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const close = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight")
        setLightbox((i) => (i === null ? null : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setLightbox((i) =>
          i === null ? null : (i - 1 + photos.length) % photos.length
        );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos.length, close]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Mes photos
        </h2>
        <label
          className={`cursor-pointer rounded-lg border border-edge px-3 py-1.5 text-sm transition hover:border-neutral-500 ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {compressing
            ? "Compression…"
            : pending
              ? "Envoi…"
              : "+ Ajouter des photos"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={busy}
          />
        </label>
      </div>

      {state && (
        <p
          className={`mb-3 text-sm ${state.ok ? "text-emerald-400" : "text-red-400"}`}
        >
          {state.message}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune photo perso pour cet exemplaire (recto, verso, défauts…).
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {photos.map((photo, i) => (
            <li key={photo.id} className="group relative">
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block w-full overflow-hidden rounded-lg border border-edge"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.label ?? "Photo perso"}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition group-hover:scale-105"
                />
              </button>
              <form
                action={deleteItemPhoto}
                onSubmit={(e) => {
                  if (!window.confirm("Supprimer cette photo ?")) e.preventDefault();
                }}
                className="absolute right-1 top-1"
              >
                <input type="hidden" name="photo_id" value={photo.id} />
                <button
                  type="submit"
                  aria-label="Supprimer la photo"
                  className="rounded bg-black/70 px-1.5 py-0.5 text-xs text-red-300 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Lightbox */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightbox].url}
            alt={photos[lightbox].label ?? "Photo perso"}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Photo précédente"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox - 1 + photos.length) % photos.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Photo suivante"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox + 1) % photos.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl"
              >
                →
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Fermer"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-2 text-xl"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
