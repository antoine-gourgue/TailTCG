"use client";

import { useState } from "react";
import { Check, ScanLine } from "lucide-react";
import { GradeCapture } from "@/components/grade-capture";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Téléphone (QR flashé) : prend recto et verso pour la pré-gradation, puis les envoie à l'ordinateur */
export function GradeCapturePhone({ token }: { token: string }) {
  const [phase, setPhase] = useState<"intro" | "capture" | "sending" | "done" | "error">("capture");

  async function send(recto: string, verso: string | null) {
    setPhase("sending");
    try {
      const fd = new FormData();
      fd.append("recto", new File([await dataUrlToBlob(recto)], "recto.webp", { type: "image/webp" }));
      if (verso) fd.append("verso", new File([await dataUrlToBlob(verso)], "verso.webp", { type: "image/webp" }));
      const res = await fetch(`/api/capture/${token}/grade`, { method: "POST", body: fd });
      setPhase(res.ok ? "done" : "error");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "capture") return <GradeCapture onDone={send} onClose={() => setPhase("intro")} />;

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      {phase === "done" ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gain/15 text-gain">
            <Check size={30} aria-hidden />
          </span>
          <p className="display text-xl font-bold">C&apos;est envoyé !</p>
          <p className="max-w-xs text-sm text-muted">Retourne sur ton ordinateur : l&apos;analyse démarre toute seule.</p>
        </>
      ) : phase === "sending" ? (
        <p className="text-sm text-muted">Envoi des prises…</p>
      ) : (
        <>
          <p className="display text-xl font-bold">{phase === "error" ? "Envoi impossible" : "Pré-gradation"}</p>
          <p className="max-w-xs text-sm text-muted">
            {phase === "error" ? "La session a peut-être expiré : régénère un QR code depuis l'ordinateur." : "Prends le recto puis le verso, l'ordinateur fera l'analyse."}
          </p>
          {phase !== "error" && (
            <button type="button" onClick={() => setPhase("capture")} className="btn btn-primary">
              <ScanLine size={15} aria-hidden /> Scanner la carte
            </button>
          )}
        </>
      )}
    </div>
  );
}
