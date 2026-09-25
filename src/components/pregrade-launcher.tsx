"use client";

import Link from "next/link";
import { useState } from "react";
import { ScanLine, Search, Sparkles, X } from "lucide-react";
import { GradeCapture, type CaptureRaw } from "@/components/grade-capture";
import { addRecognizedCard } from "@/app/pregrades/actions";
import { PhoneGradeCapture } from "@/components/phone-grade-capture";
import { PregradeWizard } from "@/components/pregrade-wizard";
import { CardImage } from "@/components/card-image";
import { Sheet } from "@/components/sheet";
import type { ScanResult } from "@/lib/scan";

export type LauncherItem = {
  id: string;
  tcgdex_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string;
};

type Capture = { recto: string; verso: string | null; raw: CaptureRaw };

function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Data URL WebP → JPEG (la reconnaissance attend du JPEG) */
async function toJpeg(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.9));
}

/**
 * Point d'entrée de la pré-gradation depuis la page Pré-gradées : scanner la
 * carte (recto, verso), la reconnaître pour retrouver l'exemplaire dans la
 * collection, puis ouvrir l'atelier déjà analysé — ou choisir la carte à la main.
 */
export function PregradeLauncher({ items }: { items: LauncherItem[] }) {
  const [mode, setMode] = useState<"idle" | "capture" | "phone" | "pick" | "wizard">("idle");
  const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
  const [capture, setCapture] = useState<Capture | null>(null);
  const [target, setTarget] = useState<LauncherItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; addHref?: string } | null>(null);
  const [q, setQ] = useState("");

  async function onCaptured(recto: string, verso: string | null, raw: CaptureRaw = {}) {
    const cap = { recto, verso, raw };
    setCapture(cap);
    setMode("idle");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/scan/match", { method: "POST", headers: { "content-type": "image/jpeg" }, body: await toJpeg(recto) });
      const data: ScanResult | null = res.ok ? await res.json() : null;
      const candidates = data && data.status !== "none" ? data.candidates : [];
      // La première version reconnue qui existe dans la collection l'emporte
      const owned = candidates.map((c) => items.find((i) => i.tcgdex_id === c.id)).find(Boolean) ?? null;
      if (owned) {
        setTarget(owned);
        setMode("wizard");
      } else if (candidates[0]) {
        // Reconnue mais absente : on l'ajoute à la collection (à compléter) et on enchaîne
        const c = candidates[0];
        const added = await addRecognizedCard(c);
        if (added.item) {
          setNotice({ text: `${c.name} (${c.setName} · ${c.localId}) n'était pas dans ta collection : ajoutée, à compléter plus tard (état, prix).` });
          setTarget(added.item);
          setMode("wizard");
        } else {
          setNotice({
            text: `Carte reconnue : ${c.name} (${c.setName} · ${c.localId}), mais l'ajout automatique a échoué. Ajoute-la, ou choisis l'exemplaire à la main.`,
            addHref: `/ajouter?card=${encodeURIComponent(c.id)}`,
          });
          setMode("pick");
        }
      } else {
        setNotice({ text: "Carte non reconnue sur cette photo. Choisis l'exemplaire dans ta collection : les prises sont conservées." });
        setMode("pick");
      }
    } catch {
      setNotice({ text: "Reconnaissance indisponible. Choisis l'exemplaire dans ta collection : les prises sont conservées." });
      setMode("pick");
    } finally {
      setBusy(false);
    }
  }

  function pick(item: LauncherItem) {
    setTarget(item);
    setMode("wizard");
  }

  function reset() {
    setMode("idle");
    setTarget(null);
    setCapture(null);
    setNotice(null);
  }

  const words = fold(q).split(/\s+/).filter(Boolean);
  const list = items.filter((i) => words.every((w) => fold(`${i.card_name} ${i.set_name} ${i.local_id}`).includes(w))).slice(0, 60);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMode(isTouch() ? "capture" : "phone")} className="btn btn-primary" disabled={busy}>
          <ScanLine size={15} aria-hidden />
          {busy ? "Reconnaissance…" : "Pré-grader au scan"}
        </button>
        <button type="button" onClick={() => setMode("pick")} className="btn btn-ghost" disabled={busy}>
          <Search size={15} aria-hidden />
          Choisir une carte
        </button>
      </div>

      {notice && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-3 py-2 text-sm">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden />
          <span className="min-w-0 flex-1">
            {notice.text}
            {notice.addHref && (
              <>
                {" "}
                <Link href={notice.addHref} className="font-medium text-accent-strong underline-offset-2 hover:underline">
                  Ajouter cette carte →
                </Link>
              </>
            )}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer" className="text-faint hover:text-foreground">
            <X size={14} aria-hidden />
          </button>
        </p>
      )}

      {mode === "capture" && <GradeCapture onDone={onCaptured} onClose={() => setMode("idle")} />}
      {mode === "phone" && <PhoneGradeCapture onDone={onCaptured} onClose={() => setMode("idle")} />}

      {mode === "pick" && (
        <Sheet
          open
          onClose={() => setMode("idle")}
          label="Choisir une carte"
          size="lg"
          header={
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Search size={16} className="shrink-0 text-accent-strong" aria-hidden />
              <p className="display text-base font-semibold">Quelle carte pré-grader ?</p>
            </div>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, set, numéro…"
              autoFocus
              className="field"
            />
            {capture && <p className="text-xs text-muted">Les prises recto/verso déjà faites seront utilisées pour cette carte.</p>}
            <ul className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
              {list.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => pick(i)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-raised">
                    <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-raised">
                      <CardImage base={i.image_url || null} alt="" placeholder="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.card_name}</span>
                      <span className="block truncate text-xs text-muted">
                        {i.set_name} <span className="num">· {i.local_id}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">Aucune carte ne correspond.</li>}
            </ul>
          </div>
        </Sheet>
      )}

      {mode === "wizard" && target && (
        <PregradeWizard itemId={target.id} photos={[]} startWithScan={!capture} initialCapture={capture ?? undefined} onClose={reset} />
      )}
    </>
  );
}
