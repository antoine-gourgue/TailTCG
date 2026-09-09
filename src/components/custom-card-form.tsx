"use client";

import { useActionState, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  Check,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { createCustomCards, type CustomCardState } from "@/app/ajouter/manuel/actions";
import { LANGUAGES } from "@/lib/domain";

type Photo =
  | { kind: "file"; file: File; preview: string }
  | { kind: "url"; url: string };

type Entry = {
  key: string;
  name: string;
  setName: string;
  localId: string;
  language: string;
  photo: Photo;
};

const MAX = 50;
const isHttp = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
const photoSrc = (p: Photo) => (p.kind === "file" ? p.preview : p.url);

/**
 * Fiche « composer » à gauche (photo par fichier ou par lien, nom, set,
 * numéro, langue) → liste d'attente à droite → un seul envoi pour toutes.
 */
export function CustomCardForm() {
  const [queue, setQueue] = useState<Entry[]>([]);
  const [state, formAction, pending] = useActionState<CustomCardState, FormData>(
    async (prev) => {
      if (queue.length === 0) return { message: "Ajoute au moins une carte à la liste." };
      const data = new FormData();
      data.set("count", String(queue.length));
      queue.forEach((e, i) => {
        data.set(`name_${i}`, e.name);
        data.set(`set_name_${i}`, e.setName);
        data.set(`local_id_${i}`, e.localId);
        data.set(`language_${i}`, e.language);
        if (e.photo.kind === "file") data.set(`photo_${i}`, e.photo.file);
        else data.set(`image_url_${i}`, e.photo.url);
      });
      return createCustomCards(prev, data);
    },
    null
  );

  // ——— Fiche en cours ———
  const [mode, setMode] = useState<"file" | "url">("file");
  const [name, setName] = useState("");
  const [series, setSeries] = useState("");
  const [localId, setLocalId] = useState("");
  const [language, setLanguage] = useState("JP");
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [url, setUrl] = useState("");
  const [urlPreviewFailed, setUrlPreviewFailed] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);

  const urlValid = isHttp(url);
  const photoReady = mode === "file" ? file != null : urlValid;
  const canAdd =
    photoReady &&
    !compressing &&
    name.trim() !== "" &&
    series.trim() !== "" &&
    localId.trim() !== "" &&
    (editing != null || queue.length < MAX);

  async function handlePhoto(files: FileList | null) {
    const picked = files?.[0];
    if (!picked || !picked.type.startsWith("image/")) return;
    setCompressing(true);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const compressed = await imageCompression(picked, {
        maxWidthOrHeight: 1600,
        initialQuality: 0.8,
        fileType: "image/webp",
        maxSizeMB: 1.5,
        useWebWorker: true,
      });
      const out = new File([compressed], "carte.webp", { type: "image/webp" });
      setFile({ file: out, preview: URL.createObjectURL(out) });
    } finally {
      setCompressing(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setMode("file");
    void handlePhoto(e.dataTransfer.files);
  }

  function resetComposer() {
    setName("");
    setLocalId("");
    setFile(null);
    setUrl("");
    setUrlPreviewFailed(false);
    setEditing(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function addToQueue() {
    if (!canAdd) return;
    const photo: Photo =
      mode === "file" && file
        ? { kind: "file", file: file.file, preview: file.preview }
        : { kind: "url", url: url.trim() };
    const entry: Entry = {
      key: editing ?? crypto.randomUUID(),
      name: name.trim(),
      setName: series.trim(),
      localId: localId.trim(),
      language,
      photo,
    };
    setQueue((q) => (editing ? q.map((e) => (e.key === editing ? entry : e)) : [...q, entry]));
    // Set et langue restent : on enchaîne souvent des cartes de la même série
    resetComposer();
    nameRef.current?.focus();
  }

  function edit(entry: Entry) {
    setEditing(entry.key);
    setMode(entry.photo.kind);
    setName(entry.name);
    setSeries(entry.setName);
    setLocalId(entry.localId);
    setLanguage(entry.language);
    setFile(entry.photo.kind === "file" ? { file: entry.photo.file, preview: entry.photo.preview } : null);
    setUrl(entry.photo.kind === "url" ? entry.photo.url : "");
    setUrlPreviewFailed(false);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function remove(key: string) {
    setQueue((q) => q.filter((e) => e.key !== key));
    if (editing === key) resetComposer();
  }

  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addToQueue();
    }
  }

  const previewSrc = mode === "file" ? file?.preview ?? null : urlValid ? url.trim() : null;
  const zoneCls =
    "relative flex aspect-[63/88] w-36 flex-col items-center justify-center gap-2 overflow-hidden rounded-[4.5%/3.5%] text-muted transition sm:w-44";

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
      {/* ——— Fiche ——— */}
      <section ref={composerRef} className="panel scroll-mt-24 p-5 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <p className="display text-base font-semibold">
            {editing ? "Modifier la carte" : "Nouvelle carte"}
          </p>
          <p className="hidden text-xs text-faint sm:block">
            Set et langue sont conservés d&apos;une carte à l&apos;autre
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Photo */}
          <div className="flex w-36 shrink-0 flex-col gap-3 sm:w-44">
            {mode === "file" ? (
              <label
                htmlFor="custom-photo"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={`${zoneCls} cursor-pointer ${
                  file
                    ? "border border-edge bg-surface shadow"
                    : "border-2 border-dashed border-edge-strong bg-raised hover:border-accent hover:text-accent"
                } ${compressing ? "pointer-events-none opacity-60" : ""}`}
              >
                {file ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="tile-badge bottom-2 right-2">Changer</span>
                  </>
                ) : compressing ? (
                  <Loader2 size={22} className="animate-spin" aria-hidden />
                ) : (
                  <>
                    <ImagePlus size={24} strokeWidth={1.7} aria-hidden />
                    <span className="px-4 text-center text-xs font-medium leading-snug">
                      Glisse une photo
                      <br />
                      ou clique
                    </span>
                  </>
                )}
              </label>
            ) : (
              <div
                className={`${zoneCls} ${
                  previewSrc && !urlPreviewFailed
                    ? "border border-edge bg-surface shadow"
                    : "border-2 border-dashed border-edge-strong bg-raised"
                }`}
              >
                {previewSrc && !urlPreviewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={previewSrc}
                    src={previewSrc}
                    alt=""
                    onError={() => setUrlPreviewFailed(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <Link2 size={24} strokeWidth={1.7} aria-hidden />
                    <span className="px-4 text-center text-xs font-medium leading-snug">
                      {urlPreviewFailed ? "Aperçu indisponible" : "Aperçu du lien"}
                    </span>
                  </>
                )}
              </div>
            )}
            <input
              id="custom-photo"
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handlePhoto(e.target.files)}
              className="sr-only"
            />
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Source de la photo">
              <button
                type="button"
                data-on={mode === "file"}
                onClick={() => setMode("file")}
                className="seg flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] font-medium"
              >
                <Upload size={13} aria-hidden />
                Fichier
              </button>
              <button
                type="button"
                data-on={mode === "url"}
                onClick={() => setMode("url")}
                className="seg flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] font-medium"
              >
                <Link2 size={13} aria-hidden />
                Lien
              </button>
            </div>
          </div>

          {/* Identité */}
          <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
            {mode === "url" && (
              <div>
                <label htmlFor="custom-url" className="label-xs mb-1.5 block">
                  Lien de l&apos;image
                </label>
                <input
                  id="custom-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlPreviewFailed(false);
                  }}
                  onKeyDown={onEnter}
                  placeholder="https://…/carte.jpg"
                  className="field text-[13px]"
                />
                <p className="mt-1.5 text-xs text-faint">
                  {urlPreviewFailed
                    ? "L'aperçu ne s'affiche pas ici (lien protégé ?) — l'image sera récupérée à l'ajout."
                    : "JPG, PNG ou WebP, 3 Mo max. L'image est copiée dans ta collection."}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="custom-name" className="label-xs mb-1.5 block">
                Nom de la carte
              </label>
              <input
                id="custom-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Pikachu"
                className="field"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
              <div>
                <label htmlFor="custom-set" className="label-xs mb-1.5 block">
                  Set / série
                </label>
                <input
                  id="custom-set"
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  onKeyDown={onEnter}
                  placeholder="Promo japonaise"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="custom-number" className="label-xs mb-1.5 block">
                  Numéro
                </label>
                <input
                  id="custom-number"
                  type="text"
                  value={localId}
                  onChange={(e) => setLocalId(e.target.value)}
                  onKeyDown={onEnter}
                  placeholder="208/S-P"
                  className="field num"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-end">
              <div>
                <label htmlFor="custom-language" className="label-xs mb-1.5 block">
                  Langue
                </label>
                <select
                  id="custom-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="field"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {editing && (
                  <button type="button" onClick={resetComposer} className="btn btn-ghost">
                    Annuler
                  </button>
                )}
                <button
                  type="button"
                  onClick={addToQueue}
                  disabled={!canAdd}
                  className="btn btn-primary"
                >
                  {editing ? (
                    <>
                      <Check size={15} aria-hidden />
                      Enregistrer
                    </>
                  ) : (
                    <>
                      <Plus size={15} aria-hidden />
                      Ajouter à la liste
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Liste d'attente + envoi ——— */}
      <form action={formAction} className="panel flex flex-col md:sticky md:top-24">
        <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <p className="display text-base font-semibold">À ajouter</p>
          <span className="num rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-muted">
            {queue.length}
            {queue.length >= MAX ? ` / ${MAX}` : ""}
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Layers size={22} strokeWidth={1.6} className="text-faint" aria-hidden />
            <p className="text-sm text-muted">Aucune carte pour l&apos;instant</p>
            <p className="text-xs leading-relaxed text-faint">
              Remplis la fiche, puis « Ajouter à la liste ». Enchaîne autant de cartes que tu veux
              avant de tout envoyer.
            </p>
          </div>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto p-2 md:max-h-[calc(100vh-24rem)]">
            {queue.map((e) => (
              <li
                key={e.key}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-raised ${
                  editing === e.key ? "bg-accent-soft/60" : ""
                }`}
              >
                <Thumb src={photoSrc(e.photo)} />
                <button
                  type="button"
                  onClick={() => edit(e)}
                  title="Modifier"
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {e.setName} · <span className="num">{e.localId}</span> · {e.language}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(e.key)}
                  aria-label={`Retirer ${e.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-surface hover:text-loss"
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-edge p-4">
          {state && <p className="mb-3 text-sm text-loss">{state.message}</p>}
          <button
            type="submit"
            disabled={pending || queue.length === 0}
            className="btn btn-primary w-full !py-3"
          >
            {pending ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Ajout en cours…
              </>
            ) : queue.length <= 1 ? (
              "Ajouter à ma collection"
            ) : (
              `Ajouter ${queue.length} cartes à ma collection`
            )}
          </button>
          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-faint">
            Ajoutées en « à compléter » : état, prix et source se renseignent ensuite depuis la
            fiche de chaque carte.
          </p>
        </div>
      </form>
    </div>
  );
}

/** Vignette de la liste : un lien protégé peut refuser l'aperçu → icône */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-raised text-faint shadow">
      {failed ? (
        <Link2 size={14} aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
