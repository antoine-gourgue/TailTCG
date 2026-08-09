import { Logo } from "@/components/logo";
import { CardImage } from "@/components/card-image";
import { GRADE_LABELS } from "@/lib/grading";

/**
 * Boîtier façon carte gradée : étiquette papier (logo, carte, set,
 * note globale + sous-notes) au-dessus de la carte sous plastique.
 */
export function GradedSlab({
  name,
  setName,
  localId,
  imageUrl,
  fallback = null,
  grade,
  centering,
  corners,
  edges,
  surface,
}: {
  name: string;
  setName: string;
  localId: string;
  imageUrl: string | null;
  fallback?: string | null;
  grade: number;
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge-strong bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-white/[0.06] p-2 shadow-xl">
      {/* Étiquette */}
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#f5f1e6] px-2.5 py-2 text-[#1a1a1a]">
        <Logo variant="mark" size={24} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold leading-tight">{name}</p>
          <p className="truncate text-[10px] leading-tight text-black/60">
            {setName} <span className="num">· {localId}</span>
          </p>
          <p
            className="num mt-0.5 text-[9px] leading-tight tracking-wide text-black/50"
            title="Centrage · Coins"
          >
            CEN {centering} · COI {corners}
          </p>
          <p
            className="num text-[9px] leading-tight tracking-wide text-black/50"
            title="Bords · Surface"
          >
            BOR {edges} · SUR {surface}
          </p>
        </div>
        <div className="shrink-0 border-l border-black/15 pl-2.5 text-center">
          <p className="num text-2xl font-black leading-none">{grade}</p>
          <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-black/60">
            {GRADE_LABELS[grade] ?? ""}
          </p>
        </div>
      </div>
      {/* Carte sous plastique */}
      <div className="relative rounded-xl bg-black/20 p-2">
        <div className="card-tile aspect-[63/88]">
          <CardImage base={imageUrl} alt={name} fallback={fallback} />
        </div>
        <span
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent"
          aria-hidden
        />
      </div>
    </div>
  );
}
