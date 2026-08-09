"use client";

import { useState } from "react";
import { GradedSlab } from "@/components/graded-slab";
import {
  GradingReportModal,
  type GradingReportData,
} from "@/components/grading-report";

/**
 * Vitrine : boîtier de carte pré-gradée cliquable → ouvre son rapport
 * public en lecture seule.
 */
export function SlabReportTile({
  data,
  imageUrl,
}: {
  data: GradingReportData;
  imageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-pointer text-left transition-transform duration-300 hover:-translate-y-1"
        title="Voir le rapport de pré-gradation"
      >
        <GradedSlab
          name={data.cardName}
          setName={data.setName}
          localId={data.localId}
          imageUrl={imageUrl}
          grade={data.grade}
          centering={data.centering}
          corners={data.corners}
          edges={data.edges}
          surface={data.surface}
        />
      </button>
      <GradingReportModal data={data} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
