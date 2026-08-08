"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import {
  createCustomCard,
  type CustomCardState,
} from "@/app/ajouter/manuel/actions";

export function CustomCardForm() {
  const [state, formAction, pending] = useActionState<CustomCardState, FormData>(
    createCustomCard,
    null
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  async function handlePhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    setCompressing(true);
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        initialQuality: 0.8,
        fileType: "image/webp",
        maxSizeMB: 1.5,
        useWebWorker: true,
      });
      const out = new File([compressed], "carte.webp", { type: "image/webp" });
      const dt = new DataTransfer();
      dt.items.add(out);
      if (inputRef.current) inputRef.current.files = dt.files;
      setPreview(URL.createObjectURL(out));
    } finally {
      setCompressing(false);
    }
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <section className="panel p-5">
        <div className="mb-4 flex items-baseline gap-2.5">
          <span className="display num text-sm font-bold text-accent">01</span>
          <h2 className="display text-base font-semibold">Identité de la carte</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="col-span-2">
            <label htmlFor="name" className="label-xs mb-1.5 block">
              Nom de la carte
            </label>
            <input
              id="name"
              type="text"
              name="name"
              placeholder="Pikachu"
              required
              className="field"
            />
          </div>
          <div>
            <label htmlFor="set_name" className="label-xs mb-1.5 block">
              Set / série
            </label>
            <input
              id="set_name"
              type="text"
              name="set_name"
              placeholder="Promo S-P"
              required
              className="field"
            />
          </div>
          <div>
            <label htmlFor="local_id" className="label-xs mb-1.5 block">
              Numéro
            </label>
            <input
              id="local_id"
              type="text"
              name="local_id"
              placeholder="208/S-P"
              required
              className="field num"
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex items-baseline gap-2.5">
          <span className="display num text-sm font-bold text-accent">02</span>
          <h2 className="display text-base font-semibold">Photo de la carte</h2>
          <span className="text-xs text-faint">
            son visuel dans le catalogue
          </span>
        </div>
        <div className="flex items-start gap-4">
          <label
            className={`flex aspect-[63/88] w-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-edge-strong text-muted transition hover:border-accent hover:text-accent ${
              compressing ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {compressing ? (
              <Loader2 size={22} className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus size={22} aria-hidden />
            )}
            <span className="px-2 text-center text-xs font-medium">
              {compressing ? "Compression…" : "Choisir la photo"}
            </span>
            <input
              ref={inputRef}
              type="file"
              name="photo"
              accept="image/*"
              required
              onChange={(e) => handlePhoto(e.target.files)}
              className="sr-only"
            />
          </label>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Aperçu de la carte"
              className="aspect-[63/88] w-36 rounded-2xl border border-edge object-cover shadow-md"
            />
          )}
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Cadre la carte de face, bien à plat — c&apos;est cette photo qui
          l&apos;affichera partout, comme un scan officiel.
        </p>
      </section>

      {state && <p className="text-sm text-loss">{state.message}</p>}

      <button
        type="submit"
        disabled={pending || compressing}
        className="btn btn-primary self-start !px-7 !py-3"
      >
        {pending ? "Création…" : "Créer la carte puis ajouter mon exemplaire"}
      </button>
    </form>
  );
}
