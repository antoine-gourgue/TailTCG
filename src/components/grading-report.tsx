"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { GRADE_LABELS } from "@/lib/grading";
import { estimateAll, CRITERION_LABEL, gradeLabel, ratioLabel } from "@/lib/graders";
import {
  defectMeta,
  pointsToSvg,
  withPoints,
  type Annotation,
} from "@/lib/grading-defects";
import { Logo } from "@/components/logo";
import { Sheet } from "@/components/sheet";

export type GradingReportData = {
  grade: number;
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  createdAt: string | null;
  ratios: { lr?: [number, number]; tb?: [number, number] } | null;
  /** centrage du verso, quand il a été mesuré */
  versoRatios?: { lr?: [number, number]; tb?: [number, number] } | null;
  annotations: Annotation[];
  rectoUrl: string | null;
  versoUrl: string | null;
  cardName: string;
  setName: string;
  localId: string;
};

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        <span className="num text-sm font-bold">{value}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full ${
            value >= 8 ? "bg-gain" : value >= 6 ? "bg-accent" : "bg-loss"
          }`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

function AnnotatedFace({
  url,
  face,
  annotations,
  legend,
}: {
  url: string;
  face: "r" | "v";
  annotations: Annotation[];
  legend: string;
}) {
  const here = withPoints(annotations).filter((a) => a.face === face);
  return (
    <div>
      <p className="label-xs mb-1.5">{legend}</p>
      <div className="relative overflow-hidden rounded-xl border border-edge">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={legend} className="w-full" />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {here.map((a, i) => (
            <polyline
              key={i}
              points={pointsToSvg(a.points)}
              fill="none"
              stroke={defectMeta(a.kind).color}
              strokeWidth={0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

// Modale contrôlée : réutilisée par le bouton (fiche) et le boîtier (vitrine)
export function GradingReportModal({
  data,
  open,
  onClose,
}: {
  data: GradingReportData;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      label="Rapport de pré-gradation"
      size="xl"
      flush
      z="z-[60]"
      header={
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Logo variant="mark" size={22} />
          <div className="min-w-0 flex-1">
            <p className="display truncate text-base font-semibold">{data.cardName}</p>
            <p className="truncate text-xs text-muted">
              {data.setName} <span className="num">· {data.localId}</span>
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="num text-2xl font-black leading-none">{data.grade}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
              {GRADE_LABELS[data.grade] ?? ""}
            </p>
          </div>
        </div>
      }
    >
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* Notes */}
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                <Gauge label="Centrage" value={data.centering} />
                <Gauge label="Coins" value={data.corners} />
                <Gauge label="Bords" value={data.edges} />
                <Gauge label="Surface" value={data.surface} />
              </div>

              {/* Centrage mesuré */}
              {data.ratios?.lr && data.ratios?.tb && (
                <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <p className="label-xs">Centrage G/D</p>
                    <p className="num text-sm font-bold">
                      {data.ratios.lr[0]}/{data.ratios.lr[1]}
                    </p>
                  </div>
                  <div>
                    <p className="label-xs">Centrage H/B</p>
                    <p className="num text-sm font-bold">
                      {data.ratios.tb[0]}/{data.ratios.tb[1]}
                    </p>
                  </div>
                </div>
              )}

              {/* Estimation chez chaque société, d'après le centrage mesuré et les sous-notes */}
              {data.ratios?.lr && data.ratios?.tb && (() => {
                const worstOf = (r: { lr?: [number, number]; tb?: [number, number] }) => Math.max(...(r.lr ?? [50, 50]), ...(r.tb ?? [50, 50]));
                const frontWorst = worstOf(data.ratios);
                const backWorst = data.versoRatios?.lr ? worstOf(data.versoRatios) : null;
                const estimates = estimateAll({ frontWorst, backWorst, corners: data.corners, edges: data.edges, surface: data.surface });
                return (
                  <div className="mb-6">
                    <p className="label-xs mb-1">Estimation par société de gradation</p>
                    <p className="mb-2 text-xs text-muted">
                      Centrage {ratioLabel(frontWorst)} recto{backWorst != null ? ` · ${ratioLabel(backWorst)} verso` : ""} · note plafonnée par le critère le plus faible.
                    </p>
                    <ul className="divide-y divide-edge rounded-xl border border-edge">
                      {estimates.map((e) => (
                        <li key={e.grader.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="w-12 shrink-0 text-sm font-semibold">{e.grader.short}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted">
                            {e.grade >= e.grader.scale[0]
                              ? "note maximale"
                              : `limité par ${CRITERION_LABEL[e.limiting]}${e.limiting === "centering" ? ` (plafond ${gradeLabel(e.centeringCap)})` : ""}${
                                  e.withoutLimit > e.grade ? ` · ${gradeLabel(e.withoutLimit)} sinon` : ""
                                }`}
                            {!e.grader.published ? " · barème estimé" : ""}
                          </span>
                          <span className="num shrink-0 text-base font-bold">{gradeLabel(e.grade)}</span>
                          <span className="w-20 shrink-0 truncate text-right text-[11px] text-muted">{e.label ?? ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* Cartes annotées */}
              {(data.rectoUrl || data.versoUrl) && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  {data.rectoUrl && (
                    <AnnotatedFace
                      url={data.rectoUrl}
                      face="r"
                      annotations={data.annotations}
                      legend="Recto"
                    />
                  )}
                  {data.versoUrl && (
                    <AnnotatedFace
                      url={data.versoUrl}
                      face="v"
                      annotations={data.annotations}
                      legend="Verso"
                    />
                  )}
                </div>
              )}

              {/* Défauts relevés */}
              <p className="label-xs mb-2">Défauts relevés</p>
              {data.annotations.length === 0 ? (
                <p className="text-sm text-muted">Aucun défaut notable entouré.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.annotations.map((a, i) => {
                    const m = defectMeta(a.kind);
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2.5 rounded-lg border border-edge px-3 py-1.5 text-sm"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: m.color }}
                          aria-hidden
                        />
                        {m.label}
                        <span className="ml-auto text-xs text-faint">
                          {a.face === "v" ? "verso" : "recto"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-6 text-center text-xs text-faint">
                Pré-gradation indicative — ne remplace pas une gradation
                professionnelle.
                {data.createdAt
                  ? ` Évaluée le ${new Date(data.createdAt).toLocaleDateString("fr-FR")}.`
                  : ""}
              </p>
            </div>
    </Sheet>
  );
}

// Bouton « Rapport » (fiche carte)
export function GradingReportButton({ data }: { data: GradingReportData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <FileText size={15} aria-hidden />
        Rapport
      </button>
      <GradingReportModal data={data} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
