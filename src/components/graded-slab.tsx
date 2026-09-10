import { Logo } from "@/components/logo";
import { CardImage } from "@/components/card-image";
import { GRADE_LABELS } from "@/lib/grading";

/**
 * Boîtier façon carte gradée : étiquette papier (logo, carte, set, note
 * globale + sous-notes) au-dessus de la carte sous plastique. Tout est en
 * unités de conteneur (`cqw`) : le boîtier reste net et proportionné aussi
 * bien en petite tuile de grille qu'en grand dans le détail.
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
  const sub = [setName, localId].filter(Boolean).join(" · ");
  return (
    <div className="@container w-full">
      <div className="overflow-hidden rounded-[5cqw] border border-edge-strong bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-white/[0.06] p-[2cqw] shadow-xl">
        {/* Étiquette */}
        <div className="mb-[2cqw] flex items-stretch gap-[2.5cqw] rounded-[3cqw] bg-[#f5f1e6] px-[3cqw] py-[2.5cqw] text-[#1a1a1a]">
          <span className="hidden shrink-0 items-center @[210px]:flex">
            <Logo variant="mark" size={26} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="truncate text-[6cqw] font-bold leading-tight @[210px]:text-[5cqw]">{name}</p>
            {sub && (
              <p className="truncate text-[4.2cqw] leading-tight text-black/55 @[210px]:text-[3.6cqw]">{sub}</p>
            )}
            <p className="num mt-[1cqw] whitespace-nowrap text-[3.6cqw] leading-tight tracking-tight text-black/50 @[210px]:text-[3cqw]">
              CEN {centering} · COI {corners} · BOR {edges} · SUR {surface}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center border-l border-black/15 pl-[3cqw]">
            <p className="num text-[13cqw] font-black leading-none @[210px]:text-[11cqw]">{grade}</p>
            <p className="mt-[0.5cqw] text-[3cqw] font-semibold uppercase tracking-wide text-black/60 @[210px]:text-[2.4cqw]">
              {GRADE_LABELS[grade] ?? ""}
            </p>
          </div>
        </div>
        {/* Carte sous plastique */}
        <div className="relative rounded-[3cqw] bg-black/20 p-[1.5cqw]">
          <div className="card-tile aspect-[63/88]">
            <CardImage base={imageUrl} alt={name} fallback={fallback} />
          </div>
          <span
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
