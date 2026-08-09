"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Trash2,
  Loader2,
  Expand,
  Pencil,
} from "lucide-react";
import {
  uploadItemPhotos,
  deleteItemPhoto,
  updatePhotoLabel,
  type PhotoActionState,
} from "@/app/items/photo-actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";

export type GalleryPhoto = {
  id: string;
  url: string;
  label: string | null;
};

export function PhotoGallery({
  itemId,
  photos,
  className = "",
}: {
  itemId: string;
  photos: GalleryPhoto[];
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PhotoActionState>(null);
  const [compressing, setCompressing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);

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
        // Photos iPhone (.heic) : les navigateurs ne les décodent pas,
        // conversion en JPEG dans le navigateur avant compression
        let source = file;
        const isHeic =
          /\.hei[cf]$/i.test(file.name) ||
          file.type === "image/heic" ||
          file.type === "image/heif";
        if (isHeic) {
          const { heicTo } = await import("heic-to/next");
          const blob = await heicTo({
            blob: file,
            type: "image/jpeg",
            quality: 0.9,
          });
          source = new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
            type: "image/jpeg",
          });
        }
        const compressed = await imageCompression(source, {
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

  const close = useCallback(() => {
    setLightbox(null);
    setEditingLabel(false);
  }, []);

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
    <section className={`panel p-5 ${className}`}>
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="display text-base font-semibold">Mes photos</h2>
        {photos.length > 0 && (
          <span className="num text-sm text-faint">{photos.length}</span>
        )}
        {photos.length > 0 && (
          <span className="ml-auto text-xs text-faint">
            recto, verso, défauts…
          </span>
        )}
      </div>

      {photos.length === 0 && (
        <p className="mb-4 text-sm text-muted">
          Documente ton exemplaire : ajoute le recto, le verso et les éventuels
          défauts. Les photos sont privées et compressées automatiquement —
          depuis un téléphone, l&apos;appareil photo s&apos;ouvre directement.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {/* Tuile d'ajout */}
        <label
          className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-edge-strong text-muted transition hover:border-accent hover:bg-accent-soft/40 hover:text-accent ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {busy ? (
            <Loader2 size={26} className="animate-spin" aria-hidden />
          ) : (
            <ImagePlus size={26} aria-hidden />
          )}
          <span className="px-2 text-center text-sm font-medium">
            {compressing ? "Compression…" : pending ? "Envoi…" : "Ajouter des photos"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={busy}
          />
        </label>

        {photos.map((photo, i) => (
          <div key={photo.id} className="group relative">
            <button
              type="button"
              onClick={() => {
                setLightbox(i);
                setEditingLabel(false);
              }}
              className="relative block w-full overflow-hidden rounded-2xl border border-edge shadow-md transition hover:shadow-lg hover:ring-2 hover:ring-accent/40"
              aria-label="Agrandir la photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.label ?? "Photo perso"}
                loading="lazy"
                className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                <Expand size={22} className="text-white drop-shadow" aria-hidden />
              </span>
              {photo.label && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6 text-left text-xs font-medium text-white">
                  {photo.label}
                </span>
              )}
            </button>
            <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <ConfirmAction
                action={deleteItemPhoto}
                fields={{ photo_id: photo.id }}
                title="Supprimer cette photo ?"
                message="Elle sera retirée de la galerie et du stockage, sans retour possible."
                trigger={<Trash2 size={13} aria-hidden />}
                triggerAriaLabel="Supprimer la photo"
                triggerClassName="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur-sm transition hover:bg-loss"
              />
            </div>
          </div>
        ))}
      </div>

      {state && (
        <Toast
          message={state.message}
          tone={state.ok ? "success" : "error"}
          onDone={() => setState(null)}
        />
      )}

      {/* Lightbox */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightbox].url}
            alt={photos[lightbox].label ?? "Photo perso"}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {editingLabel ? (
              <form
                action={updatePhotoLabel}
                onSubmit={() => setEditingLabel(false)}
                className="flex items-center gap-1.5 rounded-full bg-black/70 py-1 pl-3 pr-1 backdrop-blur-sm"
              >
                <input type="hidden" name="photo_id" value={photos[lightbox].id} />
                <input
                  type="text"
                  name="label"
                  defaultValue={photos[lightbox].label ?? ""}
                  placeholder="recto, verso, coin abîmé…"
                  autoFocus
                  maxLength={60}
                  className="w-44 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white transition hover:bg-white/25"
                >
                  OK
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingLabel(true)}
                title="Étiqueter la photo"
                className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur-sm transition hover:bg-black/80"
              >
                {photos[lightbox].label ?? (
                  <span className="text-white/60">Ajouter une étiquette</span>
                )}
                <Pencil size={12} aria-hidden />
              </button>
            )}
            <span className="num rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {lightbox + 1} / {photos.length}
            </span>
          </div>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Photo précédente"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox - 1 + photos.length) % photos.length);
                }}
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Photo suivante"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox + 1) % photos.length);
                }}
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Fermer"
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
